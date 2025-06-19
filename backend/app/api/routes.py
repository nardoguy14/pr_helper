from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from typing import List
from datetime import datetime
import logging

from app.models.api_models import (
    SubscribeRepositoryRequest, SubscribeRepositoryResponse,
    GetRepositoriesResponse, GetPullRequestsResponse,
    UnsubscribeRepositoryRequest, UnsubscribeRepositoryResponse,
    ErrorResponse
)
from app.models.pr_models import RepositorySubscription, RepositoryStats
from app.services.github_service import GitHubService
from app.services.websocket_manager import websocket_manager
from app.services.scheduler import get_scheduler

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/repositories/subscribe", response_model=SubscribeRepositoryResponse)
async def subscribe_to_repository(request: SubscribeRepositoryRequest):
    try:
        async with GitHubService() as github_service:
            repository = await github_service.get_repository(request.repository_name)
            if not repository:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Repository '{request.repository_name}' not found or not accessible"
                )
            
            subscription = RepositorySubscription(
                repository_name=request.repository_name,
                watch_all_prs=request.watch_all_prs,
                watch_assigned_prs=request.watch_assigned_prs,
                watch_review_requests=request.watch_review_requests,
                watch_code_owner_prs=request.watch_code_owner_prs,
                teams=request.teams
            )
            
            scheduler = get_scheduler()
            scheduler.add_repository_subscription(subscription)
            
            await scheduler.force_refresh_repository(request.repository_name)
            
            return SubscribeRepositoryResponse(
                success=True,
                message=f"Successfully subscribed to repository '{request.repository_name}'",
                subscription=subscription
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error subscribing to repository {request.repository_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repositories/unsubscribe", response_model=UnsubscribeRepositoryResponse)
async def unsubscribe_from_repository(request: UnsubscribeRepositoryRequest):
    try:
        scheduler = get_scheduler()
        subscribed_repos = scheduler.get_subscribed_repositories()
        
        if request.repository_name not in subscribed_repos:
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to repository '{request.repository_name}'"
            )
        
        scheduler.remove_repository_subscription(request.repository_name)
        
        return UnsubscribeRepositoryResponse(
            success=True,
            message=f"Successfully unsubscribed from repository '{request.repository_name}'"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unsubscribing from repository {request.repository_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repositories", response_model=GetRepositoriesResponse)
async def get_subscribed_repositories():
    try:
        scheduler = get_scheduler()
        subscribed_repos = scheduler.get_subscribed_repositories()
        
        repositories = []
        async with GitHubService() as github_service:
            for repo_name in subscribed_repos:
                repository = await github_service.get_repository(repo_name)
                if repository:
                    prs = await github_service.get_pull_requests(repo_name)
                    
                    current_user = await github_service.get_current_user()
                    assigned_count = 0
                    review_requests = 0
                    
                    if current_user:
                        assigned_count = len([
                            pr for pr in prs 
                            if any(assignee.id == current_user.id for assignee in pr.assignees)
                        ])
                        review_requests = len([
                            pr for pr in prs 
                            if any(reviewer.id == current_user.id for reviewer in pr.requested_reviewers)
                        ])
                    
                    stats = RepositoryStats(
                        repository=repository,
                        total_open_prs=len(prs),
                        assigned_to_user=assigned_count,
                        review_requests=review_requests,
                        code_owner_prs=0,  # TODO: Implement code owner detection
                        last_updated=datetime.utcnow()
                    )
                    repositories.append(stats)
        
        return GetRepositoriesResponse(
            repositories=repositories,
            total_count=len(repositories)
        )
    
    except Exception as e:
        logger.error(f"Error getting subscribed repositories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repositories/{repository_name}/pull-requests", response_model=GetPullRequestsResponse)
async def get_repository_pull_requests(repository_name: str):
    try:
        scheduler = get_scheduler()
        subscribed_repos = scheduler.get_subscribed_repositories()
        
        if repository_name not in subscribed_repos:
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to repository '{repository_name}'"
            )
        
        async with GitHubService() as github_service:
            prs = await github_service.get_pull_requests(repository_name)
            
            return GetPullRequestsResponse(
                pull_requests=prs,
                repository_name=repository_name,
                total_count=len(prs)
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pull requests for {repository_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repositories/{repository_name}/refresh")
async def refresh_repository(repository_name: str):
    try:
        scheduler = get_scheduler()
        subscribed_repos = scheduler.get_subscribed_repositories()
        
        if repository_name not in subscribed_repos:
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to repository '{repository_name}'"
            )
        
        await scheduler.force_refresh_repository(repository_name)
        
        return {"success": True, "message": f"Repository '{repository_name}' refreshed successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing repository {repository_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket_manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages if needed
            logger.info(f"Received message from {user_id}: {data}")
    except WebSocketDisconnect:
        websocket_manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        websocket_manager.disconnect(user_id)