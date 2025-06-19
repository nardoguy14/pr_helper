import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Set, List, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import settings
from app.services.github_service import GitHubService
from app.services.websocket_manager import websocket_manager
from app.services.slack_service import slack_service
from app.models.pr_models import PullRequest, RepositorySubscription, PRStatus

logger = logging.getLogger(__name__)


class PRMonitorScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.subscribed_repositories: Dict[str, RepositorySubscription] = {}
        self.pr_cache: Dict[str, Dict[int, PullRequest]] = {}
        self.last_notification_time: Dict[str, datetime] = {}
        self.is_running = False
    
    def start(self):
        if not self.is_running:
            self.scheduler.add_job(
                self.poll_repositories,
                IntervalTrigger(seconds=settings.POLLING_INTERVAL_SECONDS),
                id="poll_repositories",
                replace_existing=True
            )
            self.scheduler.start()
            self.is_running = True
            logger.info("PR Monitor scheduler started")
    
    def stop(self):
        if self.is_running:
            self.scheduler.shutdown()
            self.is_running = False
            logger.info("PR Monitor scheduler stopped")
    
    def add_repository_subscription(self, subscription: RepositorySubscription):
        repo_name = subscription.repository_name
        self.subscribed_repositories[repo_name] = subscription
        if repo_name not in self.pr_cache:
            self.pr_cache[repo_name] = {}
        logger.info(f"Added repository subscription: {repo_name}")
    
    def remove_repository_subscription(self, repository_name: str):
        if repository_name in self.subscribed_repositories:
            del self.subscribed_repositories[repository_name]
        if repository_name in self.pr_cache:
            del self.pr_cache[repository_name]
        logger.info(f"Removed repository subscription: {repository_name}")
    
    def get_subscribed_repositories(self) -> List[str]:
        return list(self.subscribed_repositories.keys())
    
    async def poll_repositories(self):
        if not self.subscribed_repositories:
            return
        
        logger.info(f"Polling {len(self.subscribed_repositories)} repositories for PR updates")
        
        async with GitHubService() as github_service:
            for repo_name, subscription in self.subscribed_repositories.items():
                try:
                    await self._poll_repository(github_service, repo_name, subscription)
                except Exception as e:
                    logger.error(f"Error polling repository {repo_name}: {e}")
    
    async def _poll_repository(
        self, 
        github_service: GitHubService, 
        repo_name: str, 
        subscription: RepositorySubscription
    ):
        try:
            current_prs = await github_service.get_pull_requests(repo_name)
            previous_prs = self.pr_cache.get(repo_name, {})
            
            new_prs = []
            updated_prs = []
            closed_prs = []
            
            current_pr_numbers = {pr.number for pr in current_prs}
            previous_pr_numbers = set(previous_prs.keys())
            
            for pr in current_prs:
                if pr.number not in previous_prs:
                    new_prs.append(pr)
                elif pr.updated_at != previous_prs[pr.number].updated_at:
                    updated_prs.append(pr)
            
            for pr_number in previous_pr_numbers - current_pr_numbers:
                closed_prs.append(previous_prs[pr_number])
            
            self.pr_cache[repo_name] = {pr.number: pr for pr in current_prs}
            
            await self._handle_pr_changes(
                repo_name, subscription, new_prs, updated_prs, closed_prs
            )
            
            await self._send_repository_stats_update(repo_name, current_prs)
            
        except Exception as e:
            logger.error(f"Error polling repository {repo_name}: {e}")
    
    async def _handle_pr_changes(
        self,
        repo_name: str,
        subscription: RepositorySubscription,
        new_prs: List[PullRequest],
        updated_prs: List[PullRequest],
        closed_prs: List[PullRequest]
    ):
        for pr in new_prs:
            if self._should_notify_for_pr(pr, subscription):
                await self._send_pr_notification(pr, "new_pr")
                await websocket_manager.send_pr_update(
                    repo_name, pr.model_dump(), "new_pr"
                )
        
        for pr in updated_prs:
            if self._should_notify_for_pr(pr, subscription):
                await self._send_pr_notification(pr, "pr_updated")
                await websocket_manager.send_pr_update(
                    repo_name, pr.model_dump(), "updated"
                )
        
        for pr in closed_prs:
            await websocket_manager.send_pr_update(
                repo_name, pr.model_dump(), "closed"
            )
    
    def _should_notify_for_pr(self, pr: PullRequest, subscription: RepositorySubscription) -> bool:
        if subscription.watch_all_prs:
            return True
        
        if subscription.watch_assigned_prs and pr.user_is_assigned:
            return True
        
        if subscription.watch_review_requests and pr.user_is_requested_reviewer:
            return True
        
        return False
    
    async def _send_pr_notification(self, pr: PullRequest, notification_type: str):
        notification_key = f"{pr.repository.full_name}:{pr.number}:{notification_type}"
        now = datetime.utcnow()
        
        if notification_key in self.last_notification_time:
            time_since_last = now - self.last_notification_time[notification_key]
            if time_since_last < timedelta(hours=1):
                return
        
        self.last_notification_time[notification_key] = now
        
        notification_type_map = {
            "new_pr": "review_requested" if pr.user_is_requested_reviewer else "pr_updated",
            "pr_updated": "review_requested" if pr.status == PRStatus.NEEDS_REVIEW else "pr_updated"
        }
        
        slack_notification_type = notification_type_map.get(notification_type, "pr_updated")
        
        try:
            async with slack_service as slack:
                await slack.send_pr_review_notification(pr, slack_notification_type)
        except Exception as e:
            logger.error(f"Failed to send Slack notification for PR {pr.number}: {e}")
    
    async def _send_repository_stats_update(self, repo_name: str, prs: List[PullRequest]):
        try:
            stats = {
                "total_open_prs": len(prs),
                "assigned_to_user": len([pr for pr in prs if pr.user_is_assigned]),
                "review_requests": len([pr for pr in prs if pr.user_is_requested_reviewer]),
                "needs_review": len([pr for pr in prs if pr.status == PRStatus.NEEDS_REVIEW]),
                "last_updated": datetime.utcnow().isoformat()
            }
            
            await websocket_manager.send_repository_stats_update(repo_name, stats)
        except Exception as e:
            logger.error(f"Failed to send repository stats update for {repo_name}: {e}")
    
    async def force_refresh_repository(self, repo_name: str):
        if repo_name not in self.subscribed_repositories:
            logger.warning(f"Repository {repo_name} is not subscribed")
            return
        
        subscription = self.subscribed_repositories[repo_name]
        async with GitHubService() as github_service:
            await self._poll_repository(github_service, repo_name, subscription)


scheduler = PRMonitorScheduler()


def start_scheduler():
    scheduler.start()


def stop_scheduler():
    scheduler.stop()


def get_scheduler() -> PRMonitorScheduler:
    return scheduler