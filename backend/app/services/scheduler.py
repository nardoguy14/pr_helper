import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Set, List, Optional, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import settings
from app.services.github_service import GitHubService
from app.services.github_graphql_service_v2 import GitHubGraphQLServiceV2
from app.services.websocket_manager import websocket_manager
from app.services.database_service import DatabaseService
from app.services.token_service import token_service
from app.database.database import get_db
from app.models.pr_models import PullRequest, TeamSubscription, PRStatus
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class PRMonitorScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.subscribed_teams: Dict[str, TeamSubscription] = {}  # Key: "org/team"
        self.is_running = False
        
        # Register callback for when token is set
        token_service.add_token_set_callback(self._on_token_set)
    
    async def start(self):
        """Start the scheduler (requires valid token)"""
        if not token_service.is_token_valid:
            logger.warning("Cannot start scheduler without valid GitHub token")
            return False
            
        if not self.is_running:
            # Only monitor team PRs using GraphQL API
            self.scheduler.add_job(
                self.poll_team_repositories,
                IntervalTrigger(seconds=settings.POLLING_INTERVAL_SECONDS),
                id="poll_team_repositories",
                replace_existing=True
            )
            self.scheduler.start()
            self.is_running = True
            logger.info("PR Monitor scheduler started - Team-based monitoring only")
            
            # Load existing team subscriptions from database
            await self._load_existing_team_subscriptions()
            return True
        return True
    
    async def stop(self):
        """Stop the scheduler"""
        if self.is_running:
            self.scheduler.shutdown(wait=False)
            self.is_running = False
            logger.info("PR Monitor scheduler stopped")
            return True
        return False
    
    
    def add_team_subscription(self, subscription: TeamSubscription):
        team_key = f"{subscription.organization}/{subscription.team_name}"
        self.subscribed_teams[team_key] = subscription
        logger.info(f"Added team subscription: {team_key}")
    
    def remove_team_subscription(self, organization: str, team_name: str):
        team_key = f"{organization}/{team_name}"
        if team_key in self.subscribed_teams:
            del self.subscribed_teams[team_key]
        logger.info(f"Removed team subscription: {team_key}")
    
    def get_subscribed_teams(self) -> List[str]:
        return list(self.subscribed_teams.keys())
    
    async def poll_team_repositories(self):
        """Poll all subscribed teams using efficient GraphQL API (1 API call per org)"""
        if not self.subscribed_teams:
            logger.debug("No team subscriptions to poll")
            return
            
        logger.info(f"Team-based polling for {len(self.subscribed_teams)} teams")
        
        graphql_service = GitHubGraphQLServiceV2()
        try:
            # Process only subscribed teams
            for team_key, subscription in self.subscribed_teams.items():
                if not subscription.enabled:
                    continue
                
                try:
                    org, team_slug = team_key.split('/', 1)
                    logger.info(f"Fetching PRs for team {team_key} with GraphQL...")
                    prs = await graphql_service.get_team_pull_requests(org, team_slug)
                    
                    # Update user-specific fields for GraphQL PRs
                    await self._update_user_specific_fields(prs)
                    
                    # Get previous PRs from database for comparison
                    async for db in get_db():
                        previous_prs = await self._get_team_prs_from_database(db, team_key)
                        break
                    
                    new_prs = []
                    updated_prs = []
                    closed_prs = []
                    
                    current_pr_numbers = {pr.number for pr in prs}
                    previous_pr_numbers = {pr.number for pr in previous_prs}
                    
                    # Create lookup for previous PRs by number
                    previous_pr_map = {pr.number: pr for pr in previous_prs}
                    
                    for pr in prs:
                        if pr.number not in previous_pr_map:
                            new_prs.append(pr)
                            logger.info(f"Found genuinely NEW PR: {team_key} PR#{pr.number}")
                        elif pr.updated_at != previous_pr_map[pr.number].updated_at:
                            updated_prs.append(pr)
                    
                    for pr_number in previous_pr_numbers - current_pr_numbers:
                        closed_prs.append(previous_pr_map[pr_number])
                    
                    # Save PRs to database using GraphQL-specific method
                    async for db in get_db():
                        db_service = DatabaseService(db)
                        pr_dicts = [pr.dict() for pr in prs]
                        await db_service.upsert_pull_requests_graphql(pr_dicts, team_key)
                        logger.info(f"Saved {len(pr_dicts)} PRs to database for team {team_key}")
                        break
                    
                    # Log discovered repositories from team PRs (no subscriptions created)
                    await self._log_discovered_repositories_from_prs(prs)
                    
                    # Send notifications and updates
                    await self._handle_team_pr_changes(
                        team_key, subscription, 
                        new_prs, updated_prs, closed_prs
                    )
                    
                    await self._send_team_stats_update(org, team_slug, prs)
                            
                except Exception as e:
                    logger.error(f"Error fetching PRs for team {team_key}: {e}")
            
        finally:
            await graphql_service.close()

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
                await websocket_manager.send_team_pr_update(
                    team_key, pr.model_dump(), "new_pr"
                )
        
        for pr in updated_prs:
            if self._should_notify_for_team_pr(pr, subscription):
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
                "last_updated": datetime.now(timezone.utc).isoformat()
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
    
    async def _load_existing_team_subscriptions(self):
        """Load existing team subscriptions from database on startup and auto-subscribe to user teams"""
        try:
            async for db in get_db():
                db_service = DatabaseService(db)
                
                # Load existing team subscriptions only
                team_subscriptions = await db_service.get_all_team_subscriptions()
                for team_sub in team_subscriptions:
                    self.add_team_subscription(team_sub)
                
                logger.info(f"Loaded {len(team_subscriptions)} team subscriptions from database")
                
                # Check if we need to poll immediately based on last update times
                await self._check_and_poll_if_needed(db_service)
                break
            
            # Auto-subscribe to user's teams if enabled
            if settings.AUTO_SUBSCRIBE_USER_TEAMS:
                await self._auto_subscribe_user_teams()
            else:
                logger.info("Auto-subscription to user teams is disabled")
                
        except Exception as e:
            logger.error(f"Error loading existing team subscriptions: {e}")
    
    async def _check_and_poll_if_needed(self, db_service: DatabaseService):
        """Check last update times and poll if data is stale"""
        try:
            current_time = datetime.now(timezone.utc)
            polling_interval = timedelta(seconds=settings.POLLING_INTERVAL_SECONDS)
            
            # Get all team stats to check their last update times
            team_stats = await db_service.get_all_team_stats()
            
            teams_to_poll = []
            for stat in team_stats:
                team_key = f"{stat.organization}/{stat.team_name}"
                # Check if this team is subscribed and enabled
                if team_key in self.subscribed_teams and self.subscribed_teams[team_key].enabled:
                    # Check if data is stale (last update is older than polling interval)
                    if stat.last_updated is None or (current_time - stat.last_updated) > polling_interval:
                        teams_to_poll.append(team_key)
                        logger.info(f"Team {team_key} needs immediate poll - last updated: {stat.last_updated}")
            
            # Poll stale teams immediately if needed
            if teams_to_poll:
                logger.info(f"Polling {len(teams_to_poll)} teams with stale data on startup")
                # Teams will be polled by the regular GraphQL polling cycle
            else:
                logger.info("All team and repository data is fresh, skipping initial poll")
                
        except Exception as e:
            logger.error(f"Error checking poll status on startup: {e}")
    
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
    
    async def _on_token_set(self):
        """Callback when token is successfully set - start scheduler and trigger immediate poll"""
        try:
            logger.info("Token set callback triggered - starting scheduler and polling immediately")
            
            # Start the scheduler if not already running
            await self.start()
            
            # Trigger an immediate poll
            await self._trigger_immediate_poll()
            
        except Exception as e:
            logger.error(f"Error in token set callback: {e}")
    
    async def _trigger_immediate_poll(self):
        """Trigger an immediate poll without waiting for the scheduler interval"""
        try:
            logger.info("Triggering immediate poll after token is set")
            
            # Always use GraphQL API
            await self.poll_team_repositories()
                
        except Exception as e:
            logger.error(f"Error during immediate poll: {e}")

    async def _update_user_specific_fields(self, prs: List[PullRequest]):
        """Update user-specific fields for PRs fetched via GraphQL"""
        current_user = token_service.user_info
        if not current_user:
            return
        
        for pr in prs:
            # Check if current user has reviewed
            pr.user_has_reviewed = any(
                review.user.login == current_user["login"] for review in pr.reviews
            )
            
            # Check if current user is assigned
            pr.user_is_assigned = any(
                assignee.login == current_user["login"] for assignee in pr.assignees
            )
            
            # Check if current user is requested reviewer (individual or team)
            pr.user_is_requested_reviewer = any(
                reviewer.login == current_user["login"] for reviewer in pr.requested_reviewers
            )
            
            # Also check if user is part of any requested teams
            # BUT only if the user hasn't already reviewed the PR
            # If user has reviewed, their part is done even if team review is still pending
            if not pr.user_is_requested_reviewer and pr.requested_teams and not pr.user_has_reviewed:
                pr.user_is_requested_reviewer = True
            
            # Update status based on user involvement
            github_service = GitHubService()
            pr.status = github_service._determine_pr_status(
                pr.state, pr.reviews, pr.user_has_reviewed, pr.user_is_assigned, pr.user_is_requested_reviewer
            )

    async def _log_discovered_repositories_from_prs(self, prs):
        """Log discovered repositories from team PRs without creating subscriptions"""
        discovered_repos = set()
        
        # Extract unique repository names from PRs
        for pr in prs:
            if hasattr(pr, 'repository') and pr.repository:
                repo_full_name = pr.repository.full_name
                discovered_repos.add(repo_full_name)
        
        if discovered_repos:
            logger.info(f"Found {len(discovered_repos)} repositories in team PRs: {list(discovered_repos)}")
        
        # Note: Repository nodes will be created dynamically in the frontend
        # based on team PR data, without creating actual repository subscriptions
    
    async def _get_team_prs_from_database(self, db: AsyncSession, team_key: str) -> List[PullRequest]:
        """Get PRs from database for a team"""
        try:
            db_service = DatabaseService(db)
            pr_dicts = await db_service.get_team_pull_requests(team_key, state="open")
            
            # Convert dicts to PullRequest objects
            prs = []
            for pr_dict in pr_dicts:
                pr = PullRequest(**pr_dict)
                prs.append(pr)
            
            return prs
        except Exception as e:
            logger.error(f"Error getting team PRs from database: {e}")
            return []
    


scheduler = PRMonitorScheduler()


def start_scheduler():
    # Don't start the scheduler automatically - it will be started when a token is provided
    logger.info("Scheduler service initialized (waiting for GitHub token)")


async def start_scheduler_async():
    return await scheduler.start()


async def stop_scheduler():
    return await scheduler.stop()


def get_scheduler() -> PRMonitorScheduler:
    return scheduler