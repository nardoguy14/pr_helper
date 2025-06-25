import httpx
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.core.config import settings
from app.models.pr_models import (
    PullRequest, User, Repository, Review, Team, PRState, ReviewState, PRStatus
)
from app.services.token_service import token_service

logger = logging.getLogger(__name__)


class GitHubService:
    def __init__(self):
        self.base_url = settings.GITHUB_API_BASE_URL
        self.current_user: Optional[User] = None
        self._client: Optional[httpx.AsyncClient] = None
    
    @property
    def client(self) -> httpx.AsyncClient:
        """Get HTTP client with dynamic token"""
        if not token_service.is_token_valid:
            raise ValueError("No valid GitHub token available. Please authenticate first.")
        
        if self._client is None:
            headers = token_service.get_auth_headers()
            headers["User-Agent"] = "PR-Monitor-Backend/1.0"
            
            self._client = httpx.AsyncClient(
                headers=headers,
                timeout=30.0
            )
        
        return self._client
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def get_current_user(self) -> Optional[User]:
        if self.current_user:
            return self.current_user
            
        try:
            response = await self.client.get(f"{self.base_url}/user")
            response.raise_for_status()
            user_data = response.json()
            
            self.current_user = User(
                id=user_data["id"],
                login=user_data["login"],
                avatar_url=user_data["avatar_url"],
                html_url=user_data["html_url"]
            )
            return self.current_user
        except Exception as e:
            logger.error(f"Failed to get current user: {e}")
            return None
    
    async def get_repository(self, repo_name: str) -> Optional[Repository]:
        try:
            response = await self.client.get(f"{self.base_url}/repos/{repo_name}")
            response.raise_for_status()
            repo_data = response.json()
            
            return Repository(
                id=repo_data["id"],
                name=repo_data["name"],
                full_name=repo_data["full_name"],
                html_url=repo_data["html_url"],
                description=repo_data.get("description"),
                private=repo_data["private"]
            )
        except Exception as e:
            logger.error(f"Failed to get repository {repo_name}: {e}")
            return None
    
    async def get_pull_requests(self, repo_name: str, state: str = "open") -> List[PullRequest]:
        try:
            response = await self.client.get(
                f"{self.base_url}/repos/{repo_name}/pulls",
                params={"state": state, "sort": "updated", "direction": "desc"}
            )
            response.raise_for_status()
            prs_data = response.json()
            
            repository = await self.get_repository(repo_name)
            if not repository:
                return []
            
            pull_requests = []
            for pr_data in prs_data:
                pr = await self._convert_pr_data(pr_data, repository)
                if pr:
                    pull_requests.append(pr)
            
            return pull_requests
        except Exception as e:
            logger.error(f"Failed to get pull requests for {repo_name}: {e}")
            return []
    
    async def get_pull_request_reviews(self, repo_name: str, pr_number: int) -> List[Review]:
        try:
            response = await self.client.get(
                f"{self.base_url}/repos/{repo_name}/pulls/{pr_number}/reviews"
            )
            response.raise_for_status()
            reviews_data = response.json()
            
            # First, convert all reviews
            all_reviews = []
            for review_data in reviews_data:
                if review_data["state"] in ["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]:
                    review = Review(
                        id=review_data["id"],
                        user=User(
                            id=review_data["user"]["id"],
                            login=review_data["user"]["login"],
                            avatar_url=review_data["user"]["avatar_url"],
                            html_url=review_data["user"]["html_url"]
                        ),
                        state=self._convert_review_state(review_data["state"]),
                        submitted_at=datetime.fromisoformat(
                            review_data["submitted_at"].replace("Z", "+00:00")
                        ) if review_data.get("submitted_at") else None,
                        body=review_data.get("body")
                    )
                    all_reviews.append(review)
            
            # Keep only the latest review from each reviewer
            latest_reviews_by_user = {}
            for review in all_reviews:
                user_login = review.user.login
                if user_login not in latest_reviews_by_user or (
                    review.submitted_at and 
                    latest_reviews_by_user[user_login].submitted_at and
                    review.submitted_at > latest_reviews_by_user[user_login].submitted_at
                ):
                    latest_reviews_by_user[user_login] = review
            
            # Only include meaningful reviews (not just comments)
            reviews = []
            for review in latest_reviews_by_user.values():
                if review.state in ["approved", "changes_requested"]:
                    reviews.append(review)
            
            return reviews
        except Exception as e:
            logger.error(f"Failed to get reviews for PR {pr_number} in {repo_name}: {e}")
            return []
    
    async def get_codeowners(self, repo_name: str) -> Dict[str, List[str]]:
        try:
            codeowners_paths = [
                ".github/CODEOWNERS",
                "docs/CODEOWNERS",
                "CODEOWNERS"
            ]
            
            for path in codeowners_paths:
                try:
                    response = await self.client.get(
                        f"{self.base_url}/repos/{repo_name}/contents/{path}"
                    )
                    if response.status_code == 200:
                        content_data = response.json()
                        import base64
                        content = base64.b64decode(content_data["content"]).decode("utf-8")
                        return self._parse_codeowners(content)
                except:
                    continue
            
            return {}
        except Exception as e:
            logger.error(f"Failed to get CODEOWNERS for {repo_name}: {e}")
            return {}
    
    def _parse_codeowners(self, content: str) -> Dict[str, List[str]]:
        codeowners = {}
        lines = content.strip().split("\n")
        
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            
            parts = line.split()
            if len(parts) >= 2:
                path_pattern = parts[0]
                owners = [owner.strip("@") for owner in parts[1:]]
                codeowners[path_pattern] = owners
        
        return codeowners
    
    async def _convert_pr_data(self, pr_data: Dict[str, Any], repository: Repository) -> Optional[PullRequest]:
        try:
            user = User(
                id=pr_data["user"]["id"],
                login=pr_data["user"]["login"],
                avatar_url=pr_data["user"]["avatar_url"],
                html_url=pr_data["user"]["html_url"]
            )
            
            assignees = [
                User(
                    id=assignee["id"],
                    login=assignee["login"],
                    avatar_url=assignee["avatar_url"],
                    html_url=assignee["html_url"]
                )
                for assignee in pr_data.get("assignees", [])
            ]
            
            requested_reviewers = [
                User(
                    id=reviewer["id"],
                    login=reviewer["login"],
                    avatar_url=reviewer["avatar_url"],
                    html_url=reviewer["html_url"]
                )
                for reviewer in pr_data.get("requested_reviewers", [])
            ]
            
            # Extract requested teams
            requested_teams = []
            for team in pr_data.get("requested_teams", []):
                requested_teams.append(Team(
                    id=team.get("id", 0),
                    github_id=str(team.get("id", "")),
                    name=team.get("name", ""),
                    slug=team.get("slug", ""),
                    description=team.get("description", ""),
                    privacy=team.get("privacy", "")
                ))
            
            reviews = await self.get_pull_request_reviews(
                repository.full_name, pr_data["number"]
            )
            
            current_user = await self.get_current_user()
            if not current_user:
                return None
            
            user_has_reviewed = any(
                review.user.login == current_user.login for review in reviews
            )
            user_is_assigned = any(
                assignee.login == current_user.login for assignee in assignees
            )
            user_is_requested_reviewer = any(
                reviewer.login == current_user.login for reviewer in requested_reviewers
            )
            
            # Also check if user is part of any requested teams
            # BUT only if the user hasn't already reviewed the PR
            # If user has reviewed, their part is done even if team review is still pending
            if not user_is_requested_reviewer and requested_teams and not user_has_reviewed:
                user_is_requested_reviewer = True
            
            # Determine actual PR state (GitHub API returns "closed" for merged PRs too)
            if pr_data.get("merged_at") or pr_data.get("merged"):
                pr_state = PRState.MERGED
            else:
                pr_state = PRState(pr_data["state"])
            
            status = self._determine_pr_status(
                pr_state, reviews, user_has_reviewed, user_is_assigned, user_is_requested_reviewer
            )
            
            return PullRequest(
                id=pr_data["id"],
                number=pr_data["number"],
                title=pr_data["title"],
                body=pr_data.get("body"),
                state=pr_state,
                html_url=pr_data["html_url"],
                created_at=datetime.fromisoformat(
                    pr_data["created_at"].replace("Z", "+00:00")
                ),
                updated_at=datetime.fromisoformat(
                    pr_data["updated_at"].replace("Z", "+00:00")
                ),
                closed_at=datetime.fromisoformat(
                    pr_data["closed_at"].replace("Z", "+00:00")
                ) if pr_data.get("closed_at") else None,
                merged_at=datetime.fromisoformat(
                    pr_data["merged_at"].replace("Z", "+00:00")
                ) if pr_data.get("merged_at") else None,
                user=user,
                assignees=assignees,
                requested_reviewers=requested_reviewers,
                requested_teams=requested_teams,
                reviews=reviews,
                repository=repository,
                draft=pr_data.get("draft", False),
                mergeable=pr_data.get("mergeable"),
                status=status,
                user_has_reviewed=user_has_reviewed,
                user_is_assigned=user_is_assigned,
                user_is_requested_reviewer=user_is_requested_reviewer
            )
        except Exception as e:
            logger.error(f"Failed to convert PR data: {e}")
            return None
    
    def _convert_review_state(self, github_state: str) -> ReviewState:
        mapping = {
            "APPROVED": ReviewState.APPROVED,
            "CHANGES_REQUESTED": ReviewState.CHANGES_REQUESTED,
            "COMMENTED": ReviewState.PENDING,
            "DISMISSED": ReviewState.DISMISSED
        }
        return mapping.get(github_state, ReviewState.PENDING)
    
    def _determine_pr_status(
        self, 
        pr_state: PRState,
        reviews: List[Review], 
        user_has_reviewed: bool, 
        user_is_assigned: bool, 
        user_is_requested_reviewer: bool
    ) -> PRStatus:
        # If PR is closed or merged, it doesn't need review regardless of previous requests
        if pr_state in [PRState.CLOSED, PRState.MERGED]:
            return PRStatus.OPEN
        
        # If you've reviewed it (approved or requested changes), you're done
        if user_has_reviewed:
            return PRStatus.REVIEWED
        
        # If you're requested/assigned but haven't reviewed, it needs your review
        if user_is_requested_reviewer or user_is_assigned:
            return PRStatus.NEEDS_REVIEW
        
        # Otherwise, you're not involved - just show it as open
        return PRStatus.OPEN

    async def get_team_members(self, org: str, team_slug: str) -> List[User]:
        """Get all members of a team in an organization"""
        try:
            response = await self.client.get(
                f"{self.base_url}/orgs/{org}/teams/{team_slug}/members"
            )
            response.raise_for_status()
            members_data = response.json()
            
            members = []
            for member_data in members_data:
                member = User(
                    id=member_data["id"],
                    login=member_data["login"],
                    avatar_url=member_data["avatar_url"],
                    html_url=member_data["html_url"]
                )
                members.append(member)
            
            return members
        except Exception as e:
            logger.error(f"Failed to get team members for {org}/{team_slug}: {e}")
            return []
    
    async def get_team_info(self, org: str, team_slug: str) -> Optional[Dict[str, Any]]:
        """Get team information"""
        try:
            response = await self.client.get(
                f"{self.base_url}/orgs/{org}/teams/{team_slug}"
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get team info for {org}/{team_slug}: {e}")
            return None
    
    async def get_team_pull_requests(self, org: str, team_slug: str) -> List[PullRequest]:
        """Get all open pull requests authored by team members"""
        members = await self.get_team_members(org, team_slug)
        if not members:
            return []
        
        # Build search query for all team members
        authors = " ".join([f"author:{member.login}" for member in members])
        search_query = f"{authors} type:pr state:open"
        
        try:
            response = await self.client.get(
                f"{self.base_url}/search/issues",
                params={
                    "q": search_query,
                    "sort": "updated",
                    "order": "desc",
                    "per_page": 100
                }
            )
            response.raise_for_status()
            search_data = response.json()
            
            pull_requests = []
            for item in search_data.get("items", []):
                # Extract repo name from URL
                repo_full_name = "/".join(item["repository_url"].split("/")[-2:])
                
                # Get repository info
                repository = await self.get_repository(repo_full_name)
                if not repository:
                    continue
                
                # Convert to our PR format
                pr = await self._convert_search_result_to_pr(item, repository)
                if pr:
                    pull_requests.append(pr)
            
            return pull_requests
        except Exception as e:
            logger.error(f"Failed to get team pull requests for {org}/{team_slug}: {e}")
            return []
    
    async def _convert_search_result_to_pr(self, item: Dict[str, Any], repository: Repository) -> Optional[PullRequest]:
        """Convert GitHub search result to PullRequest object"""
        try:
            # Get detailed PR data
            pr_number = item["number"]
            response = await self.client.get(
                f"{self.base_url}/repos/{repository.full_name}/pulls/{pr_number}"
            )
            response.raise_for_status()
            pr_data = response.json()
            
            return await self._convert_pr_data(pr_data, repository)
        except Exception as e:
            logger.error(f"Failed to convert search result to PR: {e}")
            return None
    
    async def search_user_pull_requests(self, username: str) -> List[PullRequest]:
        """Search for open pull requests authored by a specific user"""
        try:
            response = await self.client.get(
                f"{self.base_url}/search/issues",
                params={
                    "q": f"author:{username} type:pr state:open",
                    "sort": "updated",
                    "order": "desc",
                    "per_page": 100
                }
            )
            response.raise_for_status()
            search_data = response.json()
            
            pull_requests = []
            for item in search_data.get("items", []):
                # Extract repo name from URL
                repo_full_name = "/".join(item["repository_url"].split("/")[-2:])
                
                # Get repository info
                repository = await self.get_repository(repo_full_name)
                if not repository:
                    continue
                
                # Convert to our PR format
                pr = await self._convert_search_result_to_pr(item, repository)
                if pr:
                    pull_requests.append(pr)
            
            return pull_requests
        except Exception as e:
            logger.error(f"Failed to search pull requests for user {username}: {e}")
            return []
    
    async def get_current_user_teams(self) -> List[Dict[str, Any]]:
        """Get all teams that the current user belongs to"""
        try:
            # Get all organizations the user belongs to
            response = await self.client.get(f"{self.base_url}/user/orgs")
            response.raise_for_status()
            orgs = response.json()
            
            all_teams = []
            
            for org in orgs:
                org_login = org["login"]
                try:
                    # Get teams for this organization that the user belongs to
                    teams_response = await self.client.get(
                        f"{self.base_url}/user/teams",
                        params={"org": org_login}
                    )
                    teams_response.raise_for_status()
                    teams = teams_response.json()
                    
                    for team in teams:
                        team_info = {
                            "organization": org_login,
                            "team_name": team["slug"],
                            "team_id": team["id"],
                            "name": team["name"],
                            "description": team.get("description"),
                            "privacy": team.get("privacy", "closed"),
                            "permission": team.get("permission", "pull")
                        }
                        all_teams.append(team_info)
                        
                except Exception as e:
                    logger.warning(f"Failed to get teams for organization {org_login}: {e}")
                    continue
            
            logger.info(f"Found {len(all_teams)} teams for current user")
            return all_teams
            
        except Exception as e:
            logger.error(f"Failed to get current user teams: {e}")
            return []