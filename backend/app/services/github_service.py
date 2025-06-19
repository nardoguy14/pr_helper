import httpx
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.core.config import settings
from app.models.pr_models import (
    PullRequest, User, Repository, Review, PRState, ReviewState, PRStatus
)

logger = logging.getLogger(__name__)


class GitHubService:
    def __init__(self):
        self.base_url = settings.GITHUB_API_BASE_URL
        self.headers = {
            "Authorization": f"token {settings.GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "PR-Monitor-Backend/1.0"
        }
        self.client = httpx.AsyncClient(
            headers=self.headers,
            timeout=30.0
        )
        self.current_user: Optional[User] = None
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()
    
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
            
            reviews = []
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
            
            reviews = await self.get_pull_request_reviews(
                repository.full_name, pr_data["number"]
            )
            
            current_user = await self.get_current_user()
            if not current_user:
                return None
            
            user_has_reviewed = any(
                review.user.id == current_user.id for review in reviews
            )
            user_is_assigned = any(
                assignee.id == current_user.id for assignee in assignees
            )
            user_is_requested_reviewer = any(
                reviewer.id == current_user.id for reviewer in requested_reviewers
            )
            
            status = self._determine_pr_status(
                reviews, user_has_reviewed, user_is_assigned, user_is_requested_reviewer
            )
            
            return PullRequest(
                id=pr_data["id"],
                number=pr_data["number"],
                title=pr_data["title"],
                body=pr_data.get("body"),
                state=PRState(pr_data["state"]),
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
        reviews: List[Review], 
        user_has_reviewed: bool, 
        user_is_assigned: bool, 
        user_is_requested_reviewer: bool
    ) -> PRStatus:
        if user_has_reviewed:
            return PRStatus.REVIEWED
        
        if user_is_requested_reviewer or user_is_assigned:
            latest_reviews = {}
            for review in reviews:
                latest_reviews[review.user.id] = review
            
            if any(review.state == ReviewState.CHANGES_REQUESTED for review in latest_reviews.values()):
                return PRStatus.WAITING_FOR_CHANGES
            
            return PRStatus.NEEDS_REVIEW
        
        return PRStatus.NEEDS_REVIEW