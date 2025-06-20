// API URL utilities for different environments

// Debug function to check backend connectivity
export const checkBackendConnectivity = async (): Promise<boolean> => {
  try {
    console.log('API: Checking backend connectivity...');
    const response = await makeApiRequest('/api/v1/health');
    const isHealthy = response.ok;
    console.log('API: Backend health check result:', isHealthy);
    return isHealthy;
  } catch (error) {
    console.error('API: Backend connectivity check failed:', error);
    return false;
  }
};

export const getBackendUrl = (): string => {
  // In Electron production build, always use localhost:8000
  // since the backend runs locally
  if (window.electronAPI) {
    console.log('API: Running in Electron, using localhost:8000');
    return 'http://localhost:8000';
  }
  
  // In web development, use environment variable or default
  const url = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  console.log('API: Running in web, using URL:', url);
  return url;
};

export const makeApiRequest = async (endpoint: string, options?: RequestInit): Promise<Response> => {
  const baseUrl = getBackendUrl();
  const url = `${baseUrl}${endpoint}`;
  
  console.log('API: Making request to:', url);
  console.log('API: Request options:', { method: options?.method || 'GET', headers: options?.headers });
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    console.log('API: Response status:', response.status);
    console.log('API: Response headers:', Object.fromEntries(response.headers.entries()));
    
    // Check if it's a network connectivity issue
    if (!response.ok && response.status === 0) {
      console.error('API: Network connectivity issue - backend may not be running');
    }
    
    return response;
  } catch (error) {
    console.error('API: Request failed with error:', error);
    console.error('API: Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};