import { useState, useEffect } from 'react';

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
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
    error: null,
  });

  const checkAuthStatus = async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await fetch('http://localhost:8000/api/v1/auth/status');
      const data = await response.json();

      if (response.ok) {
        setAuthState({
          isAuthenticated: data.authenticated,
          user: data.user,
          isLoading: false,
          error: null,
        });
      } else {
        setAuthState({
          isAuthenticated: false,
          user: null,
          isLoading: false,
          error: 'Failed to check authentication status',
        });
      }
    } catch (error) {
      setAuthState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: 'Network error while checking authentication',
      });
    }
  };

  const setToken = async (token: string): Promise<{ success: boolean; user?: User; error?: string }> => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await fetch('http://localhost:8000/api/v1/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        setAuthState({
          isAuthenticated: true,
          user: data.user,
          isLoading: false,
          error: null,
        });

        // Store token securely
        await storeToken(token);

        return { success: true, user: data.user };
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: data.detail || 'Authentication failed',
        }));
        return { success: false, error: data.detail || 'Authentication failed' };
      }
    } catch (error) {
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
      await fetch('http://localhost:8000/api/v1/auth/token', { method: 'DELETE' });
      await removeStoredToken();
      
      setAuthState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error clearing token:', error);
    }
  };

  const initializeAuth = async () => {
    // First check for stored token
    const storedToken = await getStoredToken();
    
    if (storedToken) {
      // Try to validate stored token
      const result = await setToken(storedToken);
      if (!result.success) {
        // Stored token is invalid, remove it
        await removeStoredToken();
        await checkAuthStatus();
      }
    } else {
      // No stored token, check server auth status
      await checkAuthStatus();
    }
  };

  useEffect(() => {
    initializeAuth();
  }, []);

  return {
    ...authState,
    setToken,
    clearToken,
    checkAuthStatus,
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