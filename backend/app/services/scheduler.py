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
from app.services.database_service import DatabaseService
from app.database.database import get_db
from app.models.pr_models import PullRequest, RepositorySubscription, TeamSubscription, PRStatus

logger = logging.getLogger(__name__)


class PRMonitorScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.subscribed_repositories: Dict[str, RepositorySubscription] = {}
        self.subscribed_teams: Dict[str, TeamSubscription] = {}  # Key: "org/team"
        self.pr_cache: Dict[str, Dict[int, PullRequest]] = {}
        self.pr_cache_timestamp: Dict[str, datetime] = {}  # Track when repo cache was last updated
        self.team_pr_cache: Dict[str, Dict[int, PullRequest]] = {}  # Key: "org/team"
        self.team_pr_cache_timestamp: Dict[str, datetime] = {}  # Track when team cache was last updated
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
            
            # Load existing subscriptions from database
            asyncio.create_task(self._load_existing_subscriptions())
    
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
        if repository_name in self.pr_cache_timestamp:
            del self.pr_cache_timestamp[repository_name]
        logger.info(f"Removed repository subscription: {repository_name}")
    
    def get_subscribed_repositories(self) -> List[str]:
        return list(self.subscribed_repositories.keys())
    
    def add_team_subscription(self, subscription: TeamSubscription):
        team_key = f"{subscription.organization}/{subscription.team_name}"
        self.subscribed_teams[team_key] = subscription
        if team_key not in self.team_pr_cache:
            self.team_pr_cache[team_key] = {}
        logger.info(f"Added team subscription: {team_key}")
    
    def remove_team_subscription(self, organization: str, team_name: str):
        team_key = f"{organization}/{team_name}"
        if team_key in self.subscribed_teams:
            del self.subscribed_teams[team_key]
        if team_key in self.team_pr_cache:
            del self.team_pr_cache[team_key]
        if team_key in self.team_pr_cache_timestamp:
            del self.team_pr_cache_timestamp[team_key]
        logger.info(f"Removed team subscription: {team_key}")
    
    def get_subscribed_teams(self) -> List[str]:
        return list(self.subscribed_teams.keys())
    
    async def poll_repositories(self):
        has_repos = bool(self.subscribed_repositories)
        has_teams = bool(self.subscribed_teams)
        
        if not has_repos and not has_teams:
            return
        
        logger.info(f"Polling {len(self.subscribed_repositories)} repositories and {len(self.subscribed_teams)} teams for PR updates")
        
        async with GitHubService() as github_service:
            # Poll repositories
            for repo_name, subscription in self.subscribed_repositories.items():
                try:
                    await self._poll_repository(github_service, repo_name, subscription)
                except Exception as e:
                    logger.error(f"Error polling repository {repo_name}: {e}")
            
            # Poll teams (only enabled ones)
            for team_key, subscription in self.subscribed_teams.items():
                if not subscription.enabled:
                    continue
                try:
                    await self._poll_team(github_service, team_key, subscription)
                except Exception as e:
                    logger.error(f"Error polling team {team_key}: {e}")
    
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
            self.pr_cache_timestamp[repo_name] = datetime.utcnow()
            
            # Save PRs to database
            async for db in get_db():
                db_service = DatabaseService(db)
                # Convert PullRequest models to dicts for database
                pr_dicts = [pr.dict() for pr in current_prs]
                await db_service.upsert_pull_requests(pr_dicts)
                # Delete closed PRs from database
                await db_service.delete_closed_pull_requests()
                break
            
            await self._handle_pr_changes(
                repo_name, subscription, new_prs, updated_prs, closed_prs
            )
            
            await self._send_repository_stats_update(repo_name, current_prs)
            
        except Exception as e:
            logger.error(f"Error polling repository {repo_name}: {e}")
    
    async def _poll_team(
        self, 
        github_service: GitHubService, 
        team_key: str, 
        subscription: TeamSubscription
    ):
        try:
            org, team_name = team_key.split('/', 1)
            current_prs = await github_service.get_team_pull_requests(org, team_name)
            previous_prs = self.team_pr_cache.get(team_key, {})
            
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
            
            self.team_pr_cache[team_key] = {pr.number: pr for pr in current_prs}
            self.team_pr_cache_timestamp[team_key] = datetime.utcnow()
            
            # Save PRs to database and update team associations
            async for db in get_db():
                db_service = DatabaseService(db)
                # Convert PullRequest models to dicts for database
                pr_dicts = [pr.dict() for pr in current_prs]
                await db_service.upsert_pull_requests(pr_dicts)
                
                # Update team associations for each PR
                for pr in current_prs:
                    # Get all teams this PR is associated with
                    associated_teams = set()
                    associated_teams.add(team_key)
                    # Check if PR is also in other team caches
                    for other_team_key, other_cache in self.team_pr_cache.items():
                        if pr.number in other_cache:
                            associated_teams.add(other_team_key)
                    await db_service.update_pr_team_associations(int(pr.id), list(associated_teams))
                
                # Delete closed PRs from database
                await db_service.delete_closed_pull_requests()
                break
            
            await self._handle_team_pr_changes(
                team_key, subscription, new_prs, updated_prs, closed_prs
            )
            
            await self._send_team_stats_update(org, team_name, current_prs)
            
        except Exception as e:
            logger.error(f"Error polling team {team_key}: {e}")
    
    async def _handle_team_pr_changes(
        self,
        team_key: str,
        subscription: TeamSubscription,
        new_prs: List[PullRequest],
        updated_prs: List[PullRequest],
        closed_prs: List[PullRequest]
    ):
        for pr in new_prs:
            if self._should_notify_for_team_pr(pr, subscription):
                await self._send_pr_notification(pr, "new_pr")
                await websocket_manager.send_team_pr_update(
                    team_key, pr.model_dump(), "new_pr"
                )
        
        for pr in updated_prs:
            if self._should_notify_for_team_pr(pr, subscription):
                await self._send_pr_notification(pr, "pr_updated")
                await websocket_manager.send_team_pr_update(
                    team_key, pr.model_dump(), "updated"
                )
        
        for pr in closed_prs:
            await websocket_manager.send_team_pr_update(
                team_key, pr.model_dump(), "closed"
            )
    
    def _should_notify_for_team_pr(self, pr: PullRequest, subscription: TeamSubscription) -> bool:
        if subscription.watch_all_prs:
            return True
        
        if subscription.watch_assigned_prs and pr.user_is_assigned:
            return True
        
        if subscription.watch_review_requests and pr.user_is_requested_reviewer:
            return True
        
        return False
    
    async def _send_team_stats_update(self, organization: str, team_name: str, prs: List[PullRequest]):
        try:
            stats = {
                "total_open_prs": len(prs),
                "assigned_to_user": len([pr for pr in prs if pr.user_is_assigned]),
                "review_requests": len([pr for pr in prs if pr.user_is_requested_reviewer]),
                "last_updated": datetime.utcnow().isoformat()
            }
            
            # Update database with team stats
            async for db in get_db():
                db_service = DatabaseService(db)
                await db_service.update_team_stats(
                    organization=organization,
                    team_name=team_name,
                    total_open_prs=stats["total_open_prs"],
                    assigned_to_user=stats["assigned_to_user"],
                    review_requests=stats["review_requests"]
                )
                break
            
            await websocket_manager.send_team_stats_update(organization, team_name, stats)
        except Exception as e:
            logger.error(f"Failed to send team stats update for {organization}/{team_name}: {e}")
    
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
    
    async def force_refresh_team(self, organization: str, team_name: str):
        team_key = f"{organization}/{team_name}"
        if team_key not in self.subscribed_teams:
            logger.warning(f"Team {team_key} is not subscribed")
            return
        
        subscription = self.subscribed_teams[team_key]
        if not subscription.enabled:
            logger.warning(f"Team {team_key} is disabled")
            return
        
        async with GitHubService() as github_service:
            await self._poll_team(github_service, team_key, subscription)
    
    async def _load_existing_subscriptions(self):
        """Load existing subscriptions from database on startup and auto-subscribe to user teams"""
        try:
            async for db in get_db():
                db_service = DatabaseService(db)
                
                # Load existing team subscriptions
                team_subscriptions = await db_service.get_all_team_subscriptions()
                for team_sub in team_subscriptions:
                    self.add_team_subscription(team_sub)
                
                logger.info(f"Loaded {len(team_subscriptions)} existing team subscriptions from database")
                break
            
            # Auto-subscribe to user's teams if enabled
            if settings.AUTO_SUBSCRIBE_USER_TEAMS:
                await self._auto_subscribe_user_teams()
            else:
                logger.info("Auto-subscription to user teams is disabled")
                
        except Exception as e:
            logger.error(f"Error loading existing subscriptions: {e}")
    
    async def _auto_subscribe_user_teams(self):
        """Automatically subscribe to all teams the user belongs to"""
        try:
            async with GitHubService() as github_service:
                user_teams = await github_service.get_current_user_teams()
                
                new_subscriptions = 0
                async for db in get_db():
                    db_service = DatabaseService(db)
                    
                    for team_info in user_teams:
                        org = team_info["organization"]
                        team_name = team_info["team_name"]
                        team_key = f"{org}/{team_name}"
                        
                        # Check if already subscribed
                        if team_key in self.subscribed_teams:
                            continue
                        
                        # Check if exists in database
                        existing = await db_service.get_team_subscription(org, team_name)
                        if existing:
                            # Add to scheduler if not already there
                            self.add_team_subscription(existing)
                            continue
                        
                        # Create new subscription with default settings
                        from ..models.pr_models import TeamSubscriptionRequest
                        request = TeamSubscriptionRequest(
                            organization=org,
                            team_name=team_name,
                            watch_all_prs=True,
                            watch_assigned_prs=True,
                            watch_review_requests=True
                        )
                        
                        # Save to database
                        subscription = await db_service.create_team_subscription(request)
                        
                        # Add to scheduler
                        self.add_team_subscription(subscription)
                        new_subscriptions += 1
                        
                        logger.info(f"Auto-subscribed to team: {team_key}")
                    
                    break
                
                if new_subscriptions > 0:
                    logger.info(f"Auto-subscribed to {new_subscriptions} new user teams")
                else:
                    logger.info("No new teams to auto-subscribe to")
                    
        except Exception as e:
            logger.error(f"Error auto-subscribing to user teams: {e}")


scheduler = PRMonitorScheduler()


def start_scheduler():
    scheduler.start()


def stop_scheduler():
    scheduler.stop()


def get_scheduler() -> PRMonitorScheduler:
    return scheduler