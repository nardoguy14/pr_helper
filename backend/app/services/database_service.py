from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timezone
import json
import logging

from app.database.models import (
    TeamSubscription as DBTeamSubscription,
    TeamStats as DBTeamStats,
    RepositorySubscription as DBRepositorySubscription,
    RepositoryStats as DBRepositoryStats,
    PullRequest as DBPullRequest
)
from app.models.pr_models import (
    TeamSubscription, TeamStats, TeamSubscriptionRequest,
    RepositorySubscription, RepositoryStats
)

logger = logging.getLogger(__name__)


class DatabaseService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # Team Subscription Operations
    async def create_team_subscription(self, team_sub: TeamSubscriptionRequest) -> TeamSubscription:
        """Create a new team subscription"""
        db_team_sub = DBTeamSubscription(
            organization=team_sub.organization,
            team_name=team_sub.team_name,
            watch_all_prs=team_sub.watch_all_prs,
            watch_assigned_prs=team_sub.watch_assigned_prs,
            watch_review_requests=team_sub.watch_review_requests
        )
        
        self.db.add(db_team_sub)
        await self.db.commit()
        await self.db.refresh(db_team_sub)
        
        return TeamSubscription(
            organization=db_team_sub.organization,
            team_name=db_team_sub.team_name,
            watch_all_prs=db_team_sub.watch_all_prs,
            watch_assigned_prs=db_team_sub.watch_assigned_prs,
            watch_review_requests=db_team_sub.watch_review_requests,
            enabled=getattr(db_team_sub, 'enabled', True)
        )

    async def get_team_subscription(self, organization: str, team_name: str) -> Optional[TeamSubscription]:
        """Get a specific team subscription"""
        result = await self.db.execute(
            select(DBTeamSubscription).where(
                DBTeamSubscription.organization == organization,
                DBTeamSubscription.team_name == team_name
            )
        )
        db_team_sub = result.scalar_one_or_none()
        
        if not db_team_sub:
            return None
            
        return TeamSubscription(
            organization=db_team_sub.organization,
            team_name=db_team_sub.team_name,
            watch_all_prs=db_team_sub.watch_all_prs,
            watch_assigned_prs=db_team_sub.watch_assigned_prs,
            watch_review_requests=db_team_sub.watch_review_requests,
            enabled=getattr(db_team_sub, 'enabled', True)
        )

    async def get_all_team_subscriptions(self) -> List[TeamSubscription]:
        """Get all team subscriptions"""
        result = await self.db.execute(select(DBTeamSubscription))
        db_team_subs = result.scalars().all()
        
        return [
            TeamSubscription(
                organization=db_team_sub.organization,
                team_name=db_team_sub.team_name,
                watch_all_prs=db_team_sub.watch_all_prs,
                watch_assigned_prs=db_team_sub.watch_assigned_prs,
                watch_review_requests=db_team_sub.watch_review_requests
            )
            for db_team_sub in db_team_subs
        ]

    async def delete_team_subscription(self, organization: str, team_name: str) -> bool:
        """Delete a team subscription"""
        result = await self.db.execute(
            delete(DBTeamSubscription).where(
                DBTeamSubscription.organization == organization,
                DBTeamSubscription.team_name == team_name
            )
        )
        await self.db.commit()
        return result.rowcount > 0

    # Team Stats Operations
    async def update_team_stats(self, organization: str, team_name: str, 
                               total_open_prs: int, assigned_to_user: int, 
                               review_requests: int) -> TeamStats:
        """Update or create team statistics"""
        # Check if stats exist
        result = await self.db.execute(
            select(DBTeamStats).where(
                DBTeamStats.organization == organization,
                DBTeamStats.team_name == team_name
            )
        )
        db_stats = result.scalar_one_or_none()
        
        if db_stats:
            # Update existing stats
            db_stats.total_open_prs = total_open_prs
            db_stats.assigned_to_user = assigned_to_user
            db_stats.review_requests = review_requests
            db_stats.last_updated = datetime.now(timezone.utc)
        else:
            # Create new stats
            db_stats = DBTeamStats(
                organization=organization,
                team_name=team_name,
                total_open_prs=total_open_prs,
                assigned_to_user=assigned_to_user,
                review_requests=review_requests
            )
            self.db.add(db_stats)
        
        await self.db.commit()
        await self.db.refresh(db_stats)
        
        return TeamStats(
            organization=db_stats.organization,
            team_name=db_stats.team_name,
            total_open_prs=db_stats.total_open_prs,
            assigned_to_user=db_stats.assigned_to_user,
            review_requests=db_stats.review_requests,
            last_updated=db_stats.last_updated,
            enabled=True  # Default to enabled since stats don't track this directly
        )

    async def get_team_stats(self, organization: str, team_name: str) -> Optional[TeamStats]:
        """Get team statistics"""
        result = await self.db.execute(
            select(DBTeamStats).where(
                DBTeamStats.organization == organization,
                DBTeamStats.team_name == team_name
            )
        )
        db_stats = result.scalar_one_or_none()
        
        if not db_stats:
            return None
            
        return TeamStats(
            organization=db_stats.organization,
            team_name=db_stats.team_name,
            total_open_prs=db_stats.total_open_prs,
            assigned_to_user=db_stats.assigned_to_user,
            review_requests=db_stats.review_requests,
            last_updated=db_stats.last_updated,
            enabled=True  # Default to enabled since stats don't track this directly
        )

    async def get_all_team_stats(self) -> List[TeamStats]:
        """Get all team statistics with enabled status from subscriptions"""
        result = await self.db.execute(
            select(DBTeamStats, DBTeamSubscription.enabled).join(
                DBTeamSubscription,
                (DBTeamStats.organization == DBTeamSubscription.organization) &
                (DBTeamStats.team_name == DBTeamSubscription.team_name)
            )
        )
        rows = result.fetchall()
        
        return [
            TeamStats(
                organization=row[0].organization,
                team_name=row[0].team_name,
                total_open_prs=row[0].total_open_prs,
                assigned_to_user=row[0].assigned_to_user,
                review_requests=row[0].review_requests,
                last_updated=row[0].last_updated,
                enabled=row[1] if len(row) > 1 else True
            )
            for row in rows
        ]

    async def enable_team_subscription(self, organization: str, team_name: str) -> bool:
        """Enable a team subscription"""
        result = await self.db.execute(
            update(DBTeamSubscription).where(
                DBTeamSubscription.organization == organization,
                DBTeamSubscription.team_name == team_name
            ).values(enabled=True)
        )
        await self.db.commit()
        return result.rowcount > 0

    async def disable_team_subscription(self, organization: str, team_name: str) -> bool:
        """Disable a team subscription"""
        result = await self.db.execute(
            update(DBTeamSubscription).where(
                DBTeamSubscription.organization == organization,
                DBTeamSubscription.team_name == team_name
            ).values(enabled=False)
        )
        await self.db.commit()
        return result.rowcount > 0

    async def get_enabled_team_subscriptions(self) -> List[TeamSubscription]:
        """Get only enabled team subscriptions"""
        result = await self.db.execute(
            select(DBTeamSubscription).where(DBTeamSubscription.enabled == True)
        )
        db_team_subs = result.scalars().all()
        
        return [
            TeamSubscription(
                organization=db_team_sub.organization,
                team_name=db_team_sub.team_name,
                watch_all_prs=db_team_sub.watch_all_prs,
                watch_assigned_prs=db_team_sub.watch_assigned_prs,
                watch_review_requests=db_team_sub.watch_review_requests,
                enabled=getattr(db_team_sub, 'enabled', True)
            )
            for db_team_sub in db_team_subs
        ]
    
    # Repository Subscription Operations
    async def get_all_repository_subscriptions(self) -> List[RepositorySubscription]:
        """Get all repository subscriptions"""
        result = await self.db.execute(select(DBRepositorySubscription))
        db_repo_subs = result.scalars().all()
        
        return [
            RepositorySubscription(
                repository_name=db_repo_sub.repository_name,
                watch_all_prs=db_repo_sub.watch_all_prs,
                watch_assigned_prs=db_repo_sub.watch_assigned_prs,
                watch_review_requests=db_repo_sub.watch_review_requests,
                watch_code_owner_prs=db_repo_sub.watch_code_owner_prs,
                teams=db_repo_sub.teams or []
            )
            for db_repo_sub in db_repo_subs
        ]
    
    # Repository Stats Operations  
    async def get_all_repository_stats(self) -> List[RepositoryStats]:
        """Get all repository statistics"""
        result = await self.db.execute(select(DBRepositoryStats))
        db_repo_stats = result.scalars().all()
        
        return [
            RepositoryStats(
                repository_name=db_repo_stat.repository_name,
                total_open_prs=db_repo_stat.total_open_prs,
                assigned_to_user=db_repo_stat.assigned_to_user,
                review_requests=db_repo_stat.review_requests,
                code_owner_prs=db_repo_stat.code_owner_prs,
                last_updated=db_repo_stat.last_updated
            )
            for db_repo_stat in db_repo_stats
        ]
    
    async def update_repository_stats(self, repository_name: str, 
                                     total_open_prs: int, assigned_to_user: int, 
                                     review_requests: int, code_owner_prs: int = 0) -> RepositoryStats:
        """Update or create repository statistics"""
        # Check if stats exist
        result = await self.db.execute(
            select(DBRepositoryStats).where(
                DBRepositoryStats.repository_name == repository_name
            )
        )
        db_stats = result.scalar_one_or_none()
        
        if db_stats:
            # Update existing stats
            db_stats.total_open_prs = total_open_prs
            db_stats.assigned_to_user = assigned_to_user
            db_stats.review_requests = review_requests
            db_stats.code_owner_prs = code_owner_prs
            db_stats.last_updated = datetime.now(timezone.utc)
        else:
            # Create new stats
            db_stats = DBRepositoryStats(
                repository_name=repository_name,
                total_open_prs=total_open_prs,
                assigned_to_user=assigned_to_user,
                review_requests=review_requests,
                code_owner_prs=code_owner_prs
            )
            self.db.add(db_stats)
        
        await self.db.commit()
        await self.db.refresh(db_stats)
        
        return RepositoryStats(
            repository_name=db_stats.repository_name,
            total_open_prs=db_stats.total_open_prs,
            assigned_to_user=db_stats.assigned_to_user,
            review_requests=db_stats.review_requests,
            code_owner_prs=db_stats.code_owner_prs,
            last_updated=db_stats.last_updated
        )
    
    # Pull Request Operations
    async def upsert_pull_requests(self, pull_requests: List[dict]) -> None:
        """Insert or update multiple pull requests"""
        for pr_data in pull_requests:
            # Check if PR exists
            result = await self.db.execute(
                select(DBPullRequest).where(DBPullRequest.github_id == pr_data['id'])
            )
            db_pr = result.scalar_one_or_none()
            
            if db_pr:
                # Update existing PR
                for key, value in pr_data.items():
                    if key == 'id':
                        continue  # Skip GitHub ID, it's immutable
                    elif key == 'repository':
                        db_pr.repository_name = value['full_name']
                    elif key == 'user':
                        db_pr.author_login = value['login']
                        db_pr.author_avatar_url = value.get('avatar_url')
                    elif key == 'created_at':
                        if isinstance(value, str):
                            db_pr.github_created_at = datetime.fromisoformat(value.replace('Z', '+00:00'))
                        else:
                            db_pr.github_created_at = value
                    elif key == 'updated_at':
                        if isinstance(value, str):
                            db_pr.github_updated_at = datetime.fromisoformat(value.replace('Z', '+00:00'))
                        else:
                            db_pr.github_updated_at = value
                    elif hasattr(db_pr, key):
                        setattr(db_pr, key, value)
                
                # Always update the full JSON data (serialize to string for SQLite)
                # Convert datetime objects to strings
                pr_data_serializable = self._convert_datetimes_to_strings(pr_data)
                db_pr.pr_data = json.dumps(pr_data_serializable)
            else:
                # Create new PR
                db_pr = DBPullRequest(
                    github_id=pr_data['id'],
                    number=pr_data['number'],
                    repository_name=pr_data['repository']['full_name'],
                    title=pr_data['title'],
                    body=pr_data.get('body', ''),
                    state=pr_data['state'],
                    html_url=pr_data['html_url'],
                    author_login=pr_data['user']['login'],
                    author_avatar_url=pr_data['user'].get('avatar_url'),
                    draft=pr_data.get('draft', False),
                    user_is_assigned=pr_data.get('user_is_assigned', False),
                    user_is_requested_reviewer=pr_data.get('user_is_requested_reviewer', False),
                    user_has_reviewed=pr_data.get('user_has_reviewed', False),
                    status=pr_data.get('status', 'needs_review'),
                    additions=pr_data.get('additions', 0),
                    deletions=pr_data.get('deletions', 0),
                    changed_files=pr_data.get('changed_files', 0),
                    mergeable_state=pr_data.get('mergeable_state'),
                    review_decision=pr_data.get('review_decision'),
                    github_created_at=datetime.fromisoformat(pr_data['created_at'].replace('Z', '+00:00')) if isinstance(pr_data['created_at'], str) else pr_data['created_at'],
                    github_updated_at=datetime.fromisoformat(pr_data['updated_at'].replace('Z', '+00:00')) if isinstance(pr_data['updated_at'], str) else pr_data['updated_at'],
                    pr_data=json.dumps(self._convert_datetimes_to_strings(pr_data))
                )
                self.db.add(db_pr)
        
        await self.db.commit()
    
    async def get_repository_pull_requests(self, repository_name: str) -> List[dict]:
        """Get all open pull requests for a repository"""
        result = await self.db.execute(
            select(DBPullRequest).where(
                DBPullRequest.repository_name == repository_name,
                DBPullRequest.state == 'open'
            ).order_by(DBPullRequest.github_updated_at.desc())
        )
        db_prs = result.scalars().all()
        
        return [json.loads(pr.pr_data) for pr in db_prs]
    
    async def get_team_pull_requests(self, team_key: str) -> List[dict]:
        """Get all pull requests associated with a team"""
        result = await self.db.execute(
            select(DBPullRequest).where(
                DBPullRequest.associated_teams.contains(team_key),
                DBPullRequest.state == 'open'
            ).order_by(DBPullRequest.github_updated_at.desc())
        )
        db_prs = result.scalars().all()
        
        return [json.loads(pr.pr_data) for pr in db_prs]
    
    async def get_user_relevant_pull_requests(self, subscribed_repos: List[str], subscribed_teams: List[str]) -> List[dict]:
        """Get all open pull requests relevant to the current user across all subscribed repositories and teams"""
        try:
            # Build the query for user-relevant PRs
            conditions = []
            
            # PRs from subscribed repositories
            if subscribed_repos:
                repo_condition = DBPullRequest.repository_name.in_(subscribed_repos)
                conditions.append(repo_condition)
            
            # PRs from subscribed teams
            if subscribed_teams:
                team_conditions = []
                for team_key in subscribed_teams:
                    team_conditions.append(DBPullRequest.associated_teams.contains(team_key))
                if team_conditions:
                    from sqlalchemy import or_
                    conditions.append(or_(*team_conditions))
            
            if not conditions:
                return []
            
            # Combine all conditions with OR (PRs from repos OR teams)
            from sqlalchemy import or_
            combined_condition = or_(*conditions)
            
            # Filter for user-relevant PRs: assigned, review requested, or needs review
            user_relevant_condition = or_(
                DBPullRequest.user_is_assigned == True,
                DBPullRequest.user_is_requested_reviewer == True,
                # Note: status filtering for needs_review will be done in application logic
                # since user_has_reviewed isn't stored in the database consistently
            )
            
            result = await self.db.execute(
                select(DBPullRequest).where(
                    combined_condition,
                    DBPullRequest.state == 'open',
                    user_relevant_condition
                ).order_by(DBPullRequest.github_updated_at.desc())
            )
            db_prs = result.scalars().all()
            
            return [json.loads(pr.pr_data) for pr in db_prs]
            
        except Exception as e:
            logger.error(f"Error getting user relevant PRs: {e}")
            return []
    
    async def update_pr_team_associations(self, pr_id: int, team_keys: List[str]) -> None:
        """Update which teams are associated with a PR"""
        result = await self.db.execute(
            select(DBPullRequest).where(DBPullRequest.github_id == pr_id)
        )
        db_pr = result.scalar_one_or_none()
        
        if db_pr:
            db_pr.associated_teams = ','.join(team_keys) if team_keys else None
            await self.db.commit()
    
    async def delete_closed_pull_requests(self) -> int:
        """Delete PRs that have been closed"""
        result = await self.db.execute(
            delete(DBPullRequest).where(DBPullRequest.state == 'closed')
        )
        await self.db.commit()
        return result.rowcount
    
    async def get_all_pull_requests(self) -> List[dict]:
        """Get all open pull requests"""
        result = await self.db.execute(
            select(DBPullRequest).where(DBPullRequest.state == 'open')
            .order_by(DBPullRequest.github_updated_at.desc())
        )
        db_prs = result.scalars().all()
        
        return [json.loads(pr.pr_data) for pr in db_prs]
    
    def _convert_datetimes_to_strings(self, obj):
        """Recursively convert datetime objects to ISO format strings for JSON serialization"""
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif isinstance(obj, dict):
            return {key: self._convert_datetimes_to_strings(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_datetimes_to_strings(item) for item in obj]
        else:
            return obj