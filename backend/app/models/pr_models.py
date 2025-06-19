from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class PRState(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    MERGED = "merged"


class ReviewState(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    DISMISSED = "dismissed"


class PRStatus(str, Enum):
    NEEDS_REVIEW = "needs_review"
    REVIEWED = "reviewed"
    WAITING_FOR_CHANGES = "waiting_for_changes"
    READY_TO_MERGE = "ready_to_merge"


class User(BaseModel):
    id: int
    login: str
    avatar_url: str
    html_url: str


class Repository(BaseModel):
    id: int
    name: str
    full_name: str
    html_url: str
    description: Optional[str] = None
    private: bool = False


class Review(BaseModel):
    id: int
    user: User
    state: ReviewState
    submitted_at: Optional[datetime] = None
    body: Optional[str] = None


class PullRequest(BaseModel):
    id: int
    number: int
    title: str
    body: Optional[str] = None
    state: PRState
    html_url: str
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None
    merged_at: Optional[datetime] = None
    user: User
    assignees: List[User] = []
    requested_reviewers: List[User] = []
    reviews: List[Review] = []
    repository: Repository
    draft: bool = False
    mergeable: Optional[bool] = None
    
    # Computed status based on review state and user involvement
    status: PRStatus = PRStatus.NEEDS_REVIEW
    user_has_reviewed: bool = False
    user_is_assigned: bool = False
    user_is_requested_reviewer: bool = False


class RepositorySubscription(BaseModel):
    repository_name: str
    watch_all_prs: bool = False
    watch_assigned_prs: bool = True
    watch_review_requests: bool = True
    watch_code_owner_prs: bool = False
    teams: List[str] = []


class WebSocketMessage(BaseModel):
    type: str
    data: Dict[str, Any]
    timestamp: datetime = datetime.utcnow()


class RepositoryStats(BaseModel):
    repository: Repository
    total_open_prs: int
    assigned_to_user: int
    review_requests: int
    code_owner_prs: int
    last_updated: datetime


class TeamSubscription(BaseModel):
    organization: str
    team_name: str
    watch_all_prs: bool = True
    watch_assigned_prs: bool = True
    watch_review_requests: bool = True
    enabled: bool = True


class TeamStats(BaseModel):
    organization: str
    team_name: str
    total_open_prs: int
    assigned_to_user: int
    review_requests: int
    last_updated: datetime
    enabled: bool = True


class TeamSubscriptionRequest(BaseModel):
    organization: str
    team_name: str
    watch_all_prs: bool = True
    watch_assigned_prs: bool = True
    watch_review_requests: bool = True