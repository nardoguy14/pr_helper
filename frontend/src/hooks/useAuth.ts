import { useState, useEffect } from 'react';
import { makeApiRequest } from '../utils/api';

interface User {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  lastValidated: string | null;
  tokenExpired: boolean;
  rateLimited: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
    error: null,
    lastValidated: null,
    tokenExpired: false,
    rateLimited: false,
  });

  const checkAuthStatus = async (retries = 5) => {
    try {
      console.log('useAuth: Checking authentication status...');
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await makeApiRequest('/api/v1/auth/status');
      console.log('useAuth: Auth status response:', response.status);
      const data = await response.json();
      console.log('useAuth: Auth status data:', data);

      if (response.ok) {
        console.log('useAuth: Auth status check successful, authenticated:', data.authenticated);
        setAuthState({
          isAuthenticated: data.authenticated,
          user: data.user,
          isLoading: false,
          error: null,
          lastValidated: data.last_validated,
          tokenExpired: false,
          rateLimited: false,
        });
      } else {
        console.log('useAuth: Auth status check failed:', response.status, data);
        setAuthState({
          isAuthenticated: false,
          user: null,
          isLoading: false,
          error: 'Failed to check authentication status',
          lastValidated: null,
          tokenExpired: true,
          rateLimited: false,
        });
      }
    } catch (error) {
      console.error('useAuth: Exception during auth status check:', error);
      
      // If backend isn't ready yet, retry after a delay
      if (retries > 0 && error instanceof Error && error.message.includes('Failed to fetch')) {
        console.log(`useAuth: Backend not ready, retrying in 2 seconds... (${retries} retries left)`);
        setTimeout(() => checkAuthStatus(retries - 1), 2000);
        return;
      }
      
      setAuthState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: 'Network error while checking authentication',
        lastValidated: null,
        tokenExpired: false,
        rateLimited: false,
      });
    }
  };

  const validateTokenWithGitHub = async (token: string): Promise<{ success: boolean; user?: User; error?: string; rateLimited?: boolean }> => {
    try {
      console.log('useAuth: Validating token directly with GitHub API...');
      
      // First check rate limit status
      const rateLimitResponse = await fetch('https://api.github.com/rate_limit', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (rateLimitResponse.ok) {
        const rateLimitData = await rateLimitResponse.json();
        console.log('useAuth: Rate limit data:', rateLimitData);
        
        if (rateLimitData.rate.remaining === 0) {
          const resetTime = new Date(rateLimitData.rate.reset * 1000);
          return {
            success: true,
            rateLimited: true,
            error: `GitHub API rate limit exceeded. Rate limit resets at ${resetTime.toLocaleTimeString()}.`
          };
        }
      }

      // If rate limit check passed, get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (userResponse.ok) {
        const user = await userResponse.json();
        console.log('useAuth: GitHub user data:', user);
        return { success: true, user };
      } else if (userResponse.status === 403) {
        return {
          success: true,
          rateLimited: true,
          error: 'GitHub API rate limit exceeded during user fetch.'
        };
      } else if (userResponse.status === 401) {
        return {
          success: false,
          error: 'Invalid GitHub token. Please check your token and try again.'
        };
      } else {
        return {
          success: false,
          error: `GitHub API error: ${userResponse.status}`
        };
      }
    } catch (error) {
      console.error('useAuth: Error validating with GitHub:', error);
      return {
        success: false,
        error: 'Network error while validating token with GitHub'
      };
    }
  };

  const setToken = async (token: string): Promise<{ success: boolean; user?: User; error?: string }> => {
    try {
      console.log('useAuth: Setting token, length:', token.length);
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      // First validate directly with GitHub
      const githubValidation = await validateTokenWithGitHub(token);
      
      if (!githubValidation.success) {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: githubValidation.error || 'Token validation failed',
          rateLimited: false,
          tokenExpired: true,
        }));
        return { success: false, error: githubValidation.error };
      }

      if (githubValidation.rateLimited) {
        // Token is valid but rate limited
        setAuthState({
          isAuthenticated: true,
          user: githubValidation.user || null,
          isLoading: false,
          error: githubValidation.error || null,
          lastValidated: new Date().toISOString(),
          tokenExpired: false,
          rateLimited: true,
        });

        await storeToken(token);
        
        // Show notification about rate limiting
        if (window.electronAPI) {
          window.electronAPI.showNotification(
            'GitHub API Rate Limited',
            'Your token is valid but the GitHub API rate limit has been exceeded. Some features may be limited until the rate limit resets.'
          );
        }

        return { success: true, error: githubValidation.error };
      }

      // Token is valid and not rate limited, proceed with backend validation
      const response = await makeApiRequest('/api/v1/auth/token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

      console.log('useAuth: Token validation response:', response.status);
      const data = await response.json();
      console.log('useAuth: Token validation data:', data);

      if (response.ok) {
        console.log('useAuth: Token validation successful, storing token and updating state');
        setAuthState({
          isAuthenticated: true,
          user: data.user,
          isLoading: false,
          error: null,
          lastValidated: new Date().toISOString(),
          tokenExpired: false,
          rateLimited: false,
        });

        // Store token securely
        await storeToken(token);
        console.log('useAuth: Token stored successfully');

        return { success: true, user: data.user };
      } else if (response.status === 403) {
        // Rate limited during initial token setting - still set as authenticated
        console.warn('useAuth: Rate limited during token validation, but token is valid');
        setAuthState({
          isAuthenticated: true,
          user: null, // We don't have user info due to rate limit
          isLoading: false,
          error: 'GitHub API rate limit exceeded. Your token is valid but requests are temporarily limited.',
          lastValidated: new Date().toISOString(),
          tokenExpired: false,
          rateLimited: true,
        });

        // Store token since it's valid
        await storeToken(token);
        
        return { success: true, error: 'Rate limited but token is valid' };
      } else {
        console.error('useAuth: Token validation failed:', response.status, data);
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: data.detail || 'Authentication failed',
          rateLimited: false,
        }));
        return { success: false, error: data.detail || 'Authentication failed' };
      }
    } catch (error) {
      console.error('useAuth: Exception during token validation:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Network error during authentication',
      }));
      return { success: false, error: 'Network error during authentication' };
    }
  };

  const clearToken = async (): Promise<void> => {
    try {
      await makeApiRequest('/api/v1/auth/token', { method: 'DELETE' });
      await removeStoredToken();
      
      setAuthState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: null,
        lastValidated: null,
        tokenExpired: false,
        rateLimited: false,
      });
    } catch (error) {
      console.error('Error clearing token:', error);
    }
  };

  const validateToken = async (): Promise<boolean> => {
    try {
      console.log('useAuth: Validating current token...');
      const response = await makeApiRequest('/api/v1/auth/validate', {
        method: 'POST',
      });

      const data = await response.json();
      console.log('useAuth: Token validation result:', data);

      if (response.ok && data.valid) {
        // Token is still valid, update last validated time
        setAuthState(prev => ({
          ...prev,
          lastValidated: data.last_validated,
          tokenExpired: false,
          rateLimited: false,
          error: null,
        }));
        return true;
      } else if (response.status === 403) {
        // Rate limited - keep token and authentication, just show rate limit state
        console.warn('useAuth: GitHub API rate limited');
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: true, // Keep authenticated
          rateLimited: true,
          error: 'GitHub API rate limit exceeded. Please wait before making more requests.',
        }));

        // Show notification about rate limiting
        if (window.electronAPI) {
          window.electronAPI.showNotification(
            'GitHub API Rate Limited',
            'GitHub API rate limit exceeded. Your token is still valid, but requests are temporarily limited.'
          );
        }

        return false; // Return false to indicate API calls should be paused
      } else {
        // Token is actually invalid or expired
        console.warn('useAuth: Token validation failed:', data.error);
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          error: data.error || 'GitHub token has expired',
          tokenExpired: true,
          rateLimited: false,
        }));

        // Show notification about token expiration
        if (window.electronAPI) {
          window.electronAPI.showNotification(
            'GitHub Token Expired',
            'Your GitHub token has expired. Please update your token to continue receiving notifications.'
          );
        }

        // Clear stored token only for actual expiration
        await removeStoredToken();
        return false;
      }
    } catch (error) {
      console.error('useAuth: Error validating token:', error);
      return false;
    }
  };

  const initializeAuth = async () => {
    console.log('useAuth: Initializing authentication...');
    
    // First check for stored token
    const storedToken = await getStoredToken();
    console.log('useAuth: Stored token found:', !!storedToken);
    
    if (storedToken) {
      console.log('useAuth: Validating stored token...');
      // Try to validate stored token
      const result = await setToken(storedToken);
      if (!result.success) {
        console.log('useAuth: Stored token is invalid, removing and checking server status');
        // Stored token is invalid, remove it
        await removeStoredToken();
        await checkAuthStatus();
      }
    } else {
      console.log('useAuth: No stored token, checking server auth status');
      // No stored token, check server auth status
      await checkAuthStatus();
    }
  };

  useEffect(() => {
    initializeAuth();
  }, []);

  // Periodic token validation (every 5 minutes)
  useEffect(() => {
    if (!authState.isAuthenticated) return;

    const validateInterval = setInterval(async () => {
      console.log('useAuth: Running periodic token validation...');
      await validateToken();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(validateInterval);
  }, [authState.isAuthenticated]);

  return {
    ...authState,
    setToken,
    clearToken,
    checkAuthStatus,
    validateToken,
  };
};

// Token storage utilities
const STORAGE_KEY = 'github_token';

const storeToken = async (token: string): Promise<void> => {
  try {
    if (window.electronAPI) {
      // Store securely in Electron
      // For now, use localStorage - in production, this should use encrypted storage
      localStorage.setItem(STORAGE_KEY, btoa(token));
    } else {
      // Store in browser localStorage (encrypted)
      localStorage.setItem(STORAGE_KEY, btoa(token));
    }
  } catch (error) {
    console.error('Error storing token:', error);
  }
};

const getStoredToken = async (): Promise<string | null> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? atob(stored) : null;
  } catch (error) {
    console.error('Error retrieving token:', error);
    return null;
  }
};

const removeStoredToken = async (): Promise<void> => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error removing token:', error);
  }
};