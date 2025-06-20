"""
Token management service for handling GitHub authentication tokens dynamically.
"""

import asyncio
from typing import Optional, Dict, Any
import aiohttp
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class TokenService:
    """Service for managing GitHub authentication tokens"""
    
    def __init__(self):
        self._token: Optional[str] = None
        self._token_valid: bool = False
        self._user_info: Optional[Dict[str, Any]] = None
        self._last_validated: Optional[datetime] = None
        self._validation_lock = asyncio.Lock()
    
    @property
    def token(self) -> Optional[str]:
        """Get the current token"""
        return self._token
    
    @property
    def is_token_valid(self) -> bool:
        """Check if current token is valid"""
        return self._token_valid and self._token is not None
    
    @property
    def user_info(self) -> Optional[Dict[str, Any]]:
        """Get authenticated user information"""
        return self._user_info
    
    @property
    def last_validated(self) -> Optional[datetime]:
        """Get the timestamp when token was last validated"""
        return self._last_validated
    
    async def set_token(self, token: str) -> bool:
        """
        Set and validate a new GitHub token
        
        Args:
            token: GitHub personal access token
            
        Returns:
            bool: True if token is valid, False otherwise
        """
        async with self._validation_lock:
            self._token = token.strip()
            
            # Validate the token
            is_valid = await self._validate_token()
            
            if is_valid:
                self._token_valid = True
                logger.info(f"GitHub token validated successfully for user: {self._user_info.get('login', 'Unknown')}")
            else:
                self._token_valid = False
                self._user_info = None
                logger.warning("GitHub token validation failed")
            
            return is_valid
    
    async def _validate_token(self) -> bool:
        """
        Validate the current token with GitHub API
        
        Returns:
            bool: True if token is valid, False otherwise
        """
        if not self._token:
            return False
        
        try:
            headers = {
                'Authorization': f'token {self._token}',
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'PR-Monitor-App'
            }
            
            async with aiohttp.ClientSession() as session:
                # Test token by getting authenticated user info
                async with session.get('https://api.github.com/user', headers=headers) as response:
                    if response.status == 200:
                        self._user_info = await response.json()
                        self._last_validated = datetime.now(timezone.utc)
                        
                        # Also check token scopes
                        scopes = response.headers.get('X-OAuth-Scopes', '')
                        logger.info(f"Token scopes: {scopes}")
                        
                        # Verify we have necessary permissions
                        required_scopes = ['repo', 'user']
                        available_scopes = [scope.strip() for scope in scopes.split(',') if scope.strip()]
                        
                        # Check if we have the required scopes (repo includes public_repo)
                        has_repo = 'repo' in available_scopes or 'public_repo' in available_scopes
                        has_user = 'user' in available_scopes or 'user:email' in available_scopes
                        
                        if not (has_repo and has_user):
                            logger.warning(f"Token missing required scopes. Has: {available_scopes}, Needs: {required_scopes}")
                            return False
                        
                        return True
                    elif response.status == 401:
                        logger.error("GitHub token is invalid or expired")
                        return False
                    elif response.status == 403:
                        logger.warning("GitHub API rate limit exceeded")
                        # For rate limiting, we don't invalidate the token
                        # The frontend should handle this differently
                        return False
                    else:
                        logger.error(f"GitHub API error: {response.status}")
                        return False
                        
        except Exception as e:
            logger.error(f"Error validating GitHub token: {str(e)}")
            return False
    
    async def refresh_validation(self) -> bool:
        """
        Re-validate the current token
        
        Returns:
            bool: True if token is still valid, False otherwise
        """
        if not self._token:
            return False
        
        return await self._validate_token()
    
    def clear_token(self):
        """Clear the current token and user info"""
        self._token = None
        self._token_valid = False
        self._user_info = None
        self._last_validated = None
        logger.info("GitHub token cleared")
    
    def get_auth_headers(self) -> Dict[str, str]:
        """
        Get authentication headers for GitHub API requests
        
        Returns:
            dict: Headers with authorization
        """
        if not self.is_token_valid:
            raise ValueError("No valid token available")
        
        return {
            'Authorization': f'token {self._token}',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PR-Monitor-App'
        }


# Global token service instance
token_service = TokenService()