from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from typing import List
from datetime import datetime, timedelta
import logging
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_models import (
    SubscribeRepositoryRequest, SubscribeRepositoryResponse,
    GetRepositoriesResponse, GetPullRequestsResponse,
    UnsubscribeRepositoryRequest, UnsubscribeRepositoryResponse,
    SubscribeTeamResponse, UnsubscribeTeamRequest, UnsubscribeTeamResponse,
    GetTeamsResponse, GetTeamPullRequestsResponse, ErrorResponse
)
from app.models.pr_models import (
    RepositorySubscription, RepositoryStats,
    TeamSubscriptionRequest, TeamSubscription, TeamStats, PullRequest
)
from app.services.github_service import GitHubService
from app.services.websocket_manager import websocket_manager
from app.services.scheduler import get_scheduler
from app.services.database_service import DatabaseService
from app.services.token_service import token_service
from app.database.database import get_db
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


# Health check endpoint for debugging
@router.get("/health")
async def health_check():
    """Simple health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "backend_running": True
    }


# Authentication endpoints
@router.post("/auth/token")
async def set_github_token(request: dict):
    """Set and validate GitHub token"""
    try:
        token = request.get("token", "").strip()
        if not token:
            raise HTTPException(status_code=400, detail="Token is required")
        
        is_valid = await token_service.set_token(token)
        
        if not is_valid:
            raise HTTPException(
                status_code=401, 
                detail="Invalid GitHub token or insufficient permissions. Ensure token has 'repo' and 'user' scopes."
            )
        
        user_info = token_service.user_info
        
        # Start scheduler now that we have a valid token
        scheduler = get_scheduler()
        if not scheduler.is_running:
            await scheduler.start()
        
        return {
            "success": True,
            "message": "GitHub token validated successfully",
            "user": user_info,
            "scopes_validated": True
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting GitHub token: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auth/status")
async def get_auth_status():
    """Get current authentication status"""
    try:
        return {
            "authenticated": token_service.is_token_valid,
            "user": token_service.user_info if token_service.is_token_valid else None,
            "last_validated": token_service.last_validated.isoformat() if token_service.last_validated else None,
            "needs_revalidation": False  # Will be enhanced with periodic validation
        }
    except Exception as e:
        logger.error(f"Error getting auth status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/validate")
async def validate_github_token():
    """Validate the current GitHub token"""
    try:
        if not token_service.token:
            raise HTTPException(status_code=401, detail="No token set")
        
        # Try to validate with GitHub API directly to get proper status codes
        import aiohttp
        headers = token_service.get_auth_headers()
        
        async with aiohttp.ClientSession() as session:
            async with session.get('https://api.github.com/user', headers=headers) as response:
                if response.status == 200:
                    # Token is valid
                    user_data = await response.json()
                    return {
                        "valid": True,
                        "user": user_data,
                        "last_validated": token_service.last_validated.isoformat() if token_service.last_validated else None
                    }
                elif response.status == 401:
                    # Token is actually invalid/expired
                    return {
                        "valid": False,
                        "error": "Token is invalid or expired. Please update your GitHub token.",
                        "user": None
                    }
                elif response.status == 403:
                    # Rate limited - token is still valid but can't make requests
                    raise HTTPException(
                        status_code=403, 
                        detail="GitHub API rate limit exceeded. Token is still valid but requests are temporarily limited."
                    )
                else:
                    # Other error
                    raise HTTPException(status_code=response.status, detail=f"GitHub API error: {response.status}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating GitHub token: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/auth/token")
async def clear_github_token():
    """Clear the current GitHub token"""
    try:
        token_service.clear_token()
        
        # Stop scheduler when token is cleared
        scheduler = get_scheduler()
        if scheduler.is_running:
            await scheduler.stop()
        
        return {
            "success": True,
            "message": "GitHub token cleared successfully"
        }
    except Exception as e:
        logger.error(f"Error clearing GitHub token: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repositories/subscribe", response_model=SubscribeRepositoryResponse)
async def subscribe_to_repository(
    request: SubscribeRepositoryRequest,
    db: AsyncSession = Depends(get_db)
):
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
            
            # Save to database first
            db_service = DatabaseService(db)
            existing = await db_service.get_repository_subscription(request.repository_name)
            if existing:
                # Delete existing and create new (update)
                await db_service.delete_repository_subscription(request.repository_name)
            
            saved_subscription = await db_service.create_repository_subscription(subscription)
            
            # Then add to scheduler
            scheduler = get_scheduler()
            scheduler.add_repository_subscription(saved_subscription)
            
            await scheduler.force_refresh_repository(request.repository_name)
            
            return SubscribeRepositoryResponse(
                success=True,
                message=f"Successfully subscribed to repository '{request.repository_name}'",
                subscription=saved_subscription
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error subscribing to repository {request.repository_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repositories/unsubscribe", response_model=UnsubscribeRepositoryResponse)
async def unsubscribe_from_repository(
    request: UnsubscribeRepositoryRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        scheduler = get_scheduler()
        subscribed_repos = scheduler.get_subscribed_repositories()
        
        if request.repository_name not in subscribed_repos:
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to repository '{request.repository_name}'"
            )
        
        # Remove from scheduler
        scheduler.remove_repository_subscription(request.repository_name)
        
        # Remove from database
        db_service = DatabaseService(db)
        await db_service.delete_repository_subscription(request.repository_name)
        
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
async def get_subscribed_repositories(db: AsyncSession = Depends(get_db)):
    try:
        # Get repository stats from database (updated by scheduler)
        db_service = DatabaseService(db)
        repository_stats = await db_service.get_all_repository_stats()
        
        # For each stat, we need to get the repository details
        # This is less efficient but maintains the current API response structure
        repositories = []
        if repository_stats:
            async with GitHubService() as github_service:
                for stat in repository_stats:
                    # Get repository details
                    repository = await github_service.get_repository(stat.repository_name)
                    if repository:
                        # Create RepositoryStats with both stats and repository info
                        repo_stats = RepositoryStats(
                            repository_name=stat.repository_name,
                            repository=repository,
                            total_open_prs=stat.total_open_prs,
                            assigned_to_user=stat.assigned_to_user,
                            review_requests=stat.review_requests,
                            code_owner_prs=stat.code_owner_prs,
                            last_updated=stat.last_updated
                        )
                        repositories.append(repo_stats)
        
        return GetRepositoriesResponse(
            repositories=repositories,
            total_count=len(repositories)
        )
    
    except Exception as e:
        logger.error(f"Error getting subscribed repositories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repositories/{repository_name:path}/pull-requests", response_model=GetPullRequestsResponse)
async def get_repository_pull_requests(
    repository_name: str,
    db: AsyncSession = Depends(get_db)
):
    try:
        # URL decode the repository name (FastAPI should do this automatically, but let's be explicit)
        from urllib.parse import unquote
        decoded_repo_name = unquote(repository_name)
        
        scheduler = get_scheduler()
        subscribed_repos = scheduler.get_subscribed_repositories()
        
        if decoded_repo_name not in subscribed_repos:
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to repository '{decoded_repo_name}'"
            )
        
        # Read PRs from database
        db_service = DatabaseService(db)
        pr_dicts = await db_service.get_repository_pull_requests(decoded_repo_name)
        
        # Convert dicts back to PullRequest models
        prs = [PullRequest(**pr_dict) for pr_dict in pr_dicts]
        
        logger.info(f"Returning {len(prs)} PRs from database for repository {decoded_repo_name}")
        
        return GetPullRequestsResponse(
            pull_requests=prs,
            repository_name=decoded_repo_name,
            total_count=len(prs)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pull requests for {repository_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repositories/{repository_name:path}/refresh")
async def refresh_repository(repository_name: str):
    try:
        from urllib.parse import unquote
        decoded_repo_name = unquote(repository_name)
        
        scheduler = get_scheduler()
        subscribed_repos = scheduler.get_subscribed_repositories()
        
        if decoded_repo_name not in subscribed_repos:
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to repository '{decoded_repo_name}'"
            )
        
        await scheduler.force_refresh_repository(decoded_repo_name)
        
        return {"success": True, "message": f"Repository '{decoded_repo_name}' refreshed successfully"}
    
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
            # Use asyncio.wait_for with timeout to handle potential disconnections
            import asyncio
            try:
                # Wait for message with 30 second timeout
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Handle incoming WebSocket messages if needed
                logger.debug(f"Received message from {user_id}: {data}")
                
                # Respond to ping messages to keep connection alive
                if data.strip().lower() in ['ping', 'heartbeat']:
                    await websocket.send_text('pong')
                    
            except asyncio.TimeoutError:
                # Send ping to check if connection is still alive
                try:
                    await websocket.send_text('ping')
                except:
                    # Connection is dead, break the loop
                    break
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id}")
        websocket_manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        websocket_manager.disconnect(user_id)


# Team API Endpoints
@router.post("/teams/subscribe", response_model=SubscribeTeamResponse)
async def subscribe_to_team(request: TeamSubscriptionRequest):
    """Subscribe to a GitHub team to monitor their pull requests"""
    try:
        async with GitHubService() as github_service:
            # Verify team exists and is accessible
            team_info = await github_service.get_team_info(request.organization, request.team_name)
            if not team_info:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Team '{request.organization}/{request.team_name}' not found or not accessible"
                )
            
            # Check if we can access team members
            members = await github_service.get_team_members(request.organization, request.team_name)
            if not members:
                raise HTTPException(
                    status_code=403,
                    detail=f"Cannot access members of team '{request.organization}/{request.team_name}'. Check permissions."
                )
            
            subscription = TeamSubscription(
                organization=request.organization,
                team_name=request.team_name,
                watch_all_prs=request.watch_all_prs,
                watch_assigned_prs=request.watch_assigned_prs,
                watch_review_requests=request.watch_review_requests
            )
            
            # Store subscription in database
            async for db in get_db():
                db_service = DatabaseService(db)
                await db_service.create_team_subscription(request)
                break
            
            # Add to scheduler for real-time monitoring
            scheduler = get_scheduler()
            scheduler.add_team_subscription(subscription)
            
            return SubscribeTeamResponse(
                success=True,
                message=f"Successfully subscribed to team '{request.organization}/{request.team_name}'",
                subscription=subscription
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error subscribing to team {request.organization}/{request.team_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/teams/unsubscribe", response_model=UnsubscribeTeamResponse)
async def unsubscribe_from_team(request: UnsubscribeTeamRequest):
    """Unsubscribe from a GitHub team"""
    try:
        # Remove from scheduler
        scheduler = get_scheduler()
        team_key = f"{request.organization}/{request.team_name}"
        if team_key not in scheduler.get_subscribed_teams():
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to team '{request.organization}/{request.team_name}'"
            )
        
        scheduler.remove_team_subscription(request.organization, request.team_name)
        
        # Remove from database
        async for db in get_db():
            db_service = DatabaseService(db)
            success = await db_service.delete_team_subscription(request.organization, request.team_name)
            if not success:
                logger.warning(f"Team subscription not found in database: {team_key}")
            break
        
        return UnsubscribeTeamResponse(
            success=True,
            message=f"Successfully unsubscribed from team '{request.organization}/{request.team_name}'"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unsubscribing from team {request.organization}/{request.team_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/teams", response_model=GetTeamsResponse)
async def get_subscribed_teams():
    """Get all subscribed teams with their statistics"""
    try:
        # Get team stats from database (updated by scheduler)
        teams = []
        async for db in get_db():
            db_service = DatabaseService(db)
            teams = await db_service.get_all_team_stats()
            break
        
        return GetTeamsResponse(
            teams=teams,
            total_count=len(teams)
        )
    
    except Exception as e:
        logger.error(f"Error getting subscribed teams: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/teams/auto-subscribe")
async def auto_subscribe_to_user_teams():
    """Automatically subscribe to all teams the current user belongs to"""
    try:
        scheduler = get_scheduler()
        await scheduler._auto_subscribe_user_teams()
        
        return {
            "success": True,
            "message": "Successfully auto-subscribed to user teams"
        }
    
    except Exception as e:
        logger.error(f"Error auto-subscribing to user teams: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/teams/available")
async def get_available_teams():
    """Get teams the user belongs to but hasn't subscribed to yet"""
    try:
        async with GitHubService() as github_service:
            user_teams = await github_service.get_current_user_teams()
        
        scheduler = get_scheduler()
        subscribed_teams = scheduler.get_subscribed_teams()
        
        available_teams = []
        for team_info in user_teams:
            team_key = f"{team_info['organization']}/{team_info['team_name']}"
            if team_key not in subscribed_teams:
                available_teams.append({
                    "organization": team_info["organization"],
                    "team_name": team_info["team_name"],
                    "name": team_info["name"],
                    "description": team_info.get("description"),
                    "privacy": team_info.get("privacy", "closed")
                })
        
        return {
            "teams": available_teams,
            "total_count": len(available_teams)
        }
    
    except Exception as e:
        logger.error(f"Error getting available teams: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/user/info")
async def get_user_info():
    """Get current user information and team memberships"""
    try:
        async with GitHubService() as github_service:
            current_user = await github_service.get_current_user()
            user_teams = await github_service.get_current_user_teams()
        
        scheduler = get_scheduler()
        subscribed_teams = scheduler.get_subscribed_teams()
        
        return {
            "user": current_user.model_dump() if current_user else None,
            "teams": user_teams,
            "subscribed_teams": subscribed_teams,
            "auto_subscribe_enabled": settings.AUTO_SUBSCRIBE_USER_TEAMS
        }
    
    except Exception as e:
        logger.error(f"Error getting user info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/teams/{organization}/{team_name}/enable")
async def enable_team_subscription(organization: str, team_name: str):
    """Enable a team subscription"""
    try:
        # Check if team subscription exists
        team_key = f"{organization}/{team_name}"
        scheduler = get_scheduler()
        if team_key not in scheduler.get_subscribed_teams():
            raise HTTPException(
                status_code=404,
                detail=f"Team subscription '{organization}/{team_name}' not found"
            )
        
        # Enable in database
        async for db in get_db():
            db_service = DatabaseService(db)
            success = await db_service.enable_team_subscription(organization, team_name)
            if not success:
                raise HTTPException(
                    status_code=404,
                    detail=f"Team subscription '{organization}/{team_name}' not found in database"
                )
            break
        
        # Update scheduler
        subscription = scheduler.subscribed_teams[team_key]
        subscription.enabled = True
        
        return {
            "success": True,
            "message": f"Team subscription '{organization}/{team_name}' enabled successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enabling team subscription {organization}/{team_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/teams/{organization}/{team_name}/disable")
async def disable_team_subscription(organization: str, team_name: str):
    """Disable a team subscription"""
    try:
        # Check if team subscription exists
        team_key = f"{organization}/{team_name}"
        scheduler = get_scheduler()
        if team_key not in scheduler.get_subscribed_teams():
            raise HTTPException(
                status_code=404,
                detail=f"Team subscription '{organization}/{team_name}' not found"
            )
        
        # Disable in database
        async for db in get_db():
            db_service = DatabaseService(db)
            success = await db_service.disable_team_subscription(organization, team_name)
            if not success:
                raise HTTPException(
                    status_code=404,
                    detail=f"Team subscription '{organization}/{team_name}' not found in database"
                )
            break
        
        # Update scheduler
        subscription = scheduler.subscribed_teams[team_key]
        subscription.enabled = False
        
        return {
            "success": True,
            "message": f"Team subscription '{organization}/{team_name}' disabled successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disabling team subscription {organization}/{team_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/teams/{organization}/{team_name}/pull-requests", response_model=GetTeamPullRequestsResponse)
async def get_team_pull_requests(
    organization: str, 
    team_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Get all pull requests for a specific team"""
    try:
        scheduler = get_scheduler()
        team_key = f"{organization}/{team_name}"
        
        # Check if subscribed to this team
        if team_key not in scheduler.get_subscribed_teams():
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to team '{organization}/{team_name}'"
            )
        
        # Read PRs from database
        db_service = DatabaseService(db)
        pr_dicts = await db_service.get_team_pull_requests(team_key)
        
        # Convert dicts back to PullRequest models
        prs = [PullRequest(**pr_dict) for pr_dict in pr_dicts]
        
        logger.info(f"Returning {len(prs)} PRs from database for team {team_key}")
        
        return GetTeamPullRequestsResponse(
            pull_requests=prs,
            organization=organization,
            team_name=team_name,
            total_count=len(prs)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pull requests for team {organization}/{team_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/teams/{organization}/{team_name}/refresh")
async def refresh_team(organization: str, team_name: str):
    """Force refresh team pull requests"""
    try:
        # Check if subscribed and refresh
        scheduler = get_scheduler()
        team_key = f"{organization}/{team_name}"
        if team_key not in scheduler.get_subscribed_teams():
            raise HTTPException(
                status_code=404,
                detail=f"Not subscribed to team '{organization}/{team_name}'"
            )
        
        await scheduler.force_refresh_team(organization, team_name)
        
        return {
            "success": True, 
            "message": f"Team '{organization}/{team_name}' refreshed successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing team {organization}/{team_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/me/pull-requests")
async def get_user_relevant_pull_requests():
    """Get all pull requests relevant to the current user (assigned, review requested, etc.)"""
    try:
        scheduler = get_scheduler()
        
        # Get subscribed repositories and teams
        subscribed_repos = scheduler.get_subscribed_repositories()
        subscribed_teams = scheduler.get_subscribed_teams()
        
        if not subscribed_repos and not subscribed_teams:
            return {"pull_requests": []}
        
        # Get user-relevant PRs from database
        async for db in get_db():
            db_service = DatabaseService(db)
            user_prs = await db_service.get_user_relevant_pull_requests(
                subscribed_repos=subscribed_repos,
                subscribed_teams=subscribed_teams
            )
            break
        
        # Additional filtering for status-based conditions (needs_review && !user_has_reviewed)
        # This is done here since user_has_reviewed isn't consistently stored in the database
        filtered_prs = []
        for pr in user_prs:
            # Always include assigned PRs and review requests
            if pr.get('user_is_assigned') or pr.get('user_is_requested_reviewer'):
                filtered_prs.append(pr)
            # Include PRs that need review and user hasn't reviewed
            elif pr.get('status') == 'needs_review' and not pr.get('user_has_reviewed'):
                filtered_prs.append(pr)
        
        logger.info(f"Retrieved {len(filtered_prs)} user-relevant PRs from {len(subscribed_repos)} repos and {len(subscribed_teams)} teams")
        
        return {
            "pull_requests": filtered_prs,
            "total_count": len(filtered_prs),
            "sources": {
                "repositories": len(subscribed_repos),
                "teams": len(subscribed_teams)
            }
        }
    
    except Exception as e:
        logger.error(f"Error getting user relevant pull requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))