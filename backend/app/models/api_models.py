from pydantic import BaseModel
from typing import List, Optional
from app.models.pr_models import (
    PullRequest, RepositorySubscription, RepositoryStats,
    TeamSubscription, TeamStats, TeamSubscriptionRequest
)


class SubscribeRepositoryRequest(BaseModel):
    repository_name: str
    watch_all_prs: bool = False
    watch_assigned_prs: bool = True
    watch_review_requests: bool = True
    watch_code_owner_prs: bool = False
    teams: List[str] = []


class SubscribeRepositoryResponse(BaseModel):
    success: bool
    message: str
    subscription: Optional[RepositorySubscription] = None


class GetRepositoriesResponse(BaseModel):
    repositories: List[RepositoryStats]
    total_count: int


class GetPullRequestsResponse(BaseModel):
    pull_requests: List[PullRequest]
    repository_name: str
    total_count: int


class UnsubscribeRepositoryRequest(BaseModel):
    repository_name: str


class UnsubscribeRepositoryResponse(BaseModel):
    success: bool
    message: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


# Team-related API models
class SubscribeTeamResponse(BaseModel):
    success: bool
    message: str
    subscription: Optional[TeamSubscription] = None


class UnsubscribeTeamRequest(BaseModel):
    organization: str
    team_name: str


class UnsubscribeTeamResponse(BaseModel):
    success: bool
    message: str


class GetTeamsResponse(BaseModel):
    teams: List[TeamStats]
    total_count: int


class GetTeamPullRequestsResponse(BaseModel):
    pull_requests: List[PullRequest]
    organization: str
    team_name: str
    total_count: int