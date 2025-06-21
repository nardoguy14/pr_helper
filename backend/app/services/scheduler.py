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
        
        # Register callback for when token is set
        token_service.add_token_set_callback(self._on_token_set)
    
    async def start(self):
        """Start the scheduler (requires valid token)"""
        if not token_service.is_token_valid:
            logger.warning("Cannot start scheduler without valid GitHub token")
            return False
            
        if not self.is_running:
            # Use GraphQL API if enabled for better performance
            poll_method = self.poll_repositories_graphql if settings.USE_GRAPHQL_API else self.poll_repositories
            self.scheduler.add_job(
                poll_method,
                IntervalTrigger(seconds=settings.POLLING_INTERVAL_SECONDS),
                id="poll_repositories",
                replace_existing=True
            )
            self.scheduler.start()
            self.is_running = True
            api_mode = "GraphQL (efficient)" if settings.USE_GRAPHQL_API else "REST (standard)"
            logger.info(f"PR Monitor scheduler started using {api_mode} API")
            
            # Load existing subscriptions from database
            await self._load_existing_subscriptions()
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
    
    async def poll_repositories_graphql(self):
        """Poll all repositories and teams using efficient GraphQL API (1 API call per org)"""
        if not self.subscribed_repositories and not self.subscribed_teams:
            return
            
        logger.info(f"GraphQL polling {len(self.subscribed_repositories)} repositories and {len(self.subscribed_teams)} teams")
        
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
                    
                    # Update cache and handle changes
                    previous_prs = self.team_pr_cache.get(team_key, {})
                    
                    new_prs = []
                    updated_prs = []
                    closed_prs = []
                    
                    current_pr_numbers = {pr.number for pr in prs}
                    previous_pr_numbers = set(previous_prs.keys())
                    
                    for pr in prs:
                        if pr.number not in previous_prs:
                            new_prs.append(pr)
                        elif pr.updated_at != previous_prs[pr.number].updated_at:
                            updated_prs.append(pr)
                    
                    for pr_number in previous_pr_numbers - current_pr_numbers:
                        closed_prs.append(previous_prs[pr_number])
                    
                    # Update cache
                    self.team_pr_cache[team_key] = {pr.number: pr for pr in prs}
                    self.team_pr_cache_timestamp[team_key] = datetime.now(timezone.utc)
                    
                    # Save PRs to database using GraphQL-specific method
                    async for db in get_db():
                        db_service = DatabaseService(db)
                        pr_dicts = [pr.dict() for pr in prs]
                        await db_service.upsert_pull_requests_graphql(pr_dicts, team_key)
                        logger.info(f"Saved {len(pr_dicts)} PRs to database for team {team_key}")
                        break
                    
                    # Send notifications and updates
                    await self._handle_team_pr_changes(
                        team_key, subscription, 
                        new_prs, updated_prs, closed_prs
                    )
                    
                    await self._send_team_stats_update(org, team_slug, prs)
                            
                except Exception as e:
                    logger.error(f"Error fetching PRs for team {team_key}: {e}")
            
            # Still poll individual repositories using REST API
            github_service = GitHubService()
            for repo_name, subscription in self.subscribed_repositories.items():
                if not subscription.enabled:
                    continue
                try:
                    await self._poll_repository(github_service, repo_name, subscription)
                except Exception as e:
                    logger.error(f"Error polling repository {repo_name}: {e}")
                    
        finally:
            await graphql_service.close()
    
    async def poll_repositories(self):
        # Check if we have a valid token before polling
        if not token_service.is_token_valid:
            logger.warning("Skipping poll: No valid GitHub token available")
            return
            
        has_repos = bool(self.subscribed_repositories)
        has_teams = bool(self.subscribed_teams)
        
        if not has_repos and not has_teams:
            return
        
        logger.info(f"Polling {len(self.subscribed_repositories)} repositories and {len(self.subscribed_teams)} teams for PR updates")
        
        async with GitHubService() as github_service:
            # PHASE 1: Data Collection - Poll all sources and collect PR data
            
            # Poll repositories (existing logic unchanged)
            for repo_name, subscription in self.subscribed_repositories.items():
                try:
                    await self._poll_repository(github_service, repo_name, subscription)
                except Exception as e:
                    logger.error(f"Error polling repository {repo_name}: {e}")
            
            # Poll teams (only enabled ones) - collect data without updating associations
            all_team_prs = {}  # team_key -> list of PRs
            for team_key, subscription in self.subscribed_teams.items():
                if not subscription.enabled:
                    continue
                try:
                    team_prs = await self._collect_team_prs(github_service, team_key, subscription)
                    if team_prs:
                        all_team_prs[team_key] = team_prs
                except Exception as e:
                    logger.error(f"Error polling team {team_key}: {e}")
            
            # PHASE 2: Association Updates - Update all team associations at once
            await self._update_all_team_associations(all_team_prs)
    
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
            self.pr_cache_timestamp[repo_name] = datetime.now(timezone.utc)
            
            # Save PRs to database
            async for db in get_db():
                db_service = DatabaseService(db)
                # Convert PullRequest models to dicts for database
                pr_dicts = [pr.dict() for pr in current_prs]
                await db_service.upsert_pull_requests(pr_dicts, repo_name)
                break
            
            await self._handle_pr_changes(
                repo_name, subscription, new_prs, updated_prs, closed_prs
            )
            
            await self._send_repository_stats_update(repo_name, current_prs)
            
            # Update repository stats in database
            async for db in get_db():
                db_service = DatabaseService(db)
                repo_stats = {
                    "total_open_prs": len(current_prs),
                    "assigned_to_user": len([pr for pr in current_prs if pr.user_is_assigned]),
                    "review_requests": len([pr for pr in current_prs if pr.user_is_requested_reviewer]),
                    "code_owner_prs": 0  # TODO: Implement code owner detection
                }
                await db_service.update_repository_stats(
                    repository_name=repo_name,
                    total_open_prs=repo_stats["total_open_prs"],
                    assigned_to_user=repo_stats["assigned_to_user"],
                    review_requests=repo_stats["review_requests"],
                    code_owner_prs=repo_stats["code_owner_prs"]
                )
                break
            
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
            self.team_pr_cache_timestamp[team_key] = datetime.now(timezone.utc)
            
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
                
                break
            
            await self._handle_team_pr_changes(
                team_key, subscription, new_prs, updated_prs, closed_prs
            )
            
            await self._send_team_stats_update(org, team_name, current_prs)
            
        except Exception as e:
            logger.error(f"Error polling team {team_key}: {e}")
    
    async def _collect_team_prs(
        self, 
        github_service: GitHubService, 
        team_key: str, 
        subscription: TeamSubscription
    ) -> Dict[str, Any]:
        """Phase 1: Collect team PR data without updating associations"""
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
            
            # Update cache
            self.team_pr_cache[team_key] = {pr.number: pr for pr in current_prs}
            self.team_pr_cache_timestamp[team_key] = datetime.now(timezone.utc)
            
            # Save PRs to database (but don't update associations yet)
            async for db in get_db():
                db_service = DatabaseService(db)
                pr_dicts = [pr.dict() for pr in current_prs]
                await db_service.upsert_pull_requests(pr_dicts)
                break
            
            # Send notifications and stats updates
            await self._handle_team_pr_changes(
                team_key, subscription, new_prs, updated_prs, closed_prs
            )
            await self._send_team_stats_update(org, team_name, current_prs)
            
            return {
                'team_key': team_key,
                'current_prs': current_prs,
                'org': org,
                'team_name': team_name
            }
            
        except Exception as e:
            logger.error(f"Error collecting PRs for team {team_key}: {e}")
            return {}
    
    async def _update_all_team_associations(self, all_team_prs: Dict[str, Dict[str, Any]]):
        """Phase 2: Update all team associations after all data is collected"""
        if not all_team_prs:
            return
            
        try:
            # Build a mapping of PR -> teams that should be associated with it
            pr_team_associations = {}  # pr_id -> set of team_keys
            
            for team_data in all_team_prs.values():
                if not team_data:
                    continue
                    
                team_key = team_data['team_key']
                current_prs = team_data['current_prs']
                
                for pr in current_prs:
                    pr_id = int(pr.id)
                    if pr_id not in pr_team_associations:
                        pr_team_associations[pr_id] = set()
                    pr_team_associations[pr_id].add(team_key)
            
            # Update database with all associations at once
            async for db in get_db():
                db_service = DatabaseService(db)
                for pr_id, associated_teams in pr_team_associations.items():
                    await db_service.update_pr_team_associations(pr_id, list(associated_teams))
                break
                
            logger.info(f"Updated team associations for {len(pr_team_associations)} PRs across {len(all_team_prs)} teams")
            
        except Exception as e:
            logger.error(f"Error updating team associations: {e}")
    
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
        now = datetime.now(timezone.utc)
        
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
        
        # Slack notifications disabled - using WebSocket and macOS notifications instead
        logger.debug(f"PR notification would be sent for PR {pr.number} (type: {slack_notification_type})")
    
    async def _send_repository_stats_update(self, repo_name: str, prs: List[PullRequest]):
        try:
            stats = {
                "total_open_prs": len(prs),
                "assigned_to_user": len([pr for pr in prs if pr.user_is_assigned]),
                "review_requests": len([pr for pr in prs if pr.user_is_requested_reviewer]),
                "needs_review": len([pr for pr in prs if pr.status == PRStatus.NEEDS_REVIEW]),
                "last_updated": datetime.now(timezone.utc).isoformat()
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
                
                # Load existing repository subscriptions
                repo_subscriptions = await db_service.get_all_repository_subscriptions()
                for repo_sub in repo_subscriptions:
                    self.add_repository_subscription(repo_sub)
                
                logger.info(f"Loaded {len(team_subscriptions)} team subscriptions and {len(repo_subscriptions)} repository subscriptions from database")
                
                # Check if we need to poll immediately based on last update times
                await self._check_and_poll_if_needed(db_service)
                break
            
            # Auto-subscribe to user's teams if enabled
            if settings.AUTO_SUBSCRIBE_USER_TEAMS:
                await self._auto_subscribe_user_teams()
            else:
                logger.info("Auto-subscription to user teams is disabled")
                
        except Exception as e:
            logger.error(f"Error loading existing subscriptions: {e}")
    
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
            
            # Get all repository stats to check their last update times
            repo_stats = await db_service.get_all_repository_stats()
            
            repos_to_poll = []
            for stat in repo_stats:
                repo_name = stat.repository_name
                # Check if this repository is subscribed
                if repo_name in self.subscribed_repositories:
                    # Check if data is stale (last update is older than polling interval)
                    if stat.last_updated is None or (current_time - stat.last_updated) > polling_interval:
                        repos_to_poll.append(repo_name)
                        logger.info(f"Repository {repo_name} needs immediate poll - last updated: {stat.last_updated}")
            
            # Poll stale teams and repositories immediately
            if teams_to_poll or repos_to_poll:
                logger.info(f"Polling {len(teams_to_poll)} teams and {len(repos_to_poll)} repositories with stale data on startup")
                async with GitHubService() as github_service:
                    # Poll teams
                    for team_key in teams_to_poll:
                        try:
                            await self._poll_team(github_service, team_key, self.subscribed_teams[team_key])
                        except Exception as e:
                            logger.error(f"Error polling team {team_key} on startup: {e}")
                    
                    # Poll repositories
                    for repo_name in repos_to_poll:
                        try:
                            await self._poll_repository(github_service, repo_name, self.subscribed_repositories[repo_name])
                        except Exception as e:
                            logger.error(f"Error polling repository {repo_name} on startup: {e}")
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
            
            # Use the appropriate poll method based on settings
            if settings.USE_GRAPHQL_API:
                await self.poll_repositories_graphql()
            else:
                await self.poll_repositories()
                
        except Exception as e:
            logger.error(f"Error during immediate poll: {e}")


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