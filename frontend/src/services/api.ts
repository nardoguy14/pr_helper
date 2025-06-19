import axios, { AxiosResponse } from 'axios';
import {
  RepositoryStats,
  PullRequest,
  SubscribeRepositoryRequest,
  ApiResponse,
  RepositorySubscription
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

class ApiService {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
    
    // Configure axios defaults
    axios.defaults.timeout = 10000;
    axios.defaults.headers.common['Content-Type'] = 'application/json';
  }

  private getUrl(endpoint: string): string {
    return `${this.baseURL}/api/v1${endpoint}`;
  }

  private async handleRequest<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
    try {
      const response = await request;
      return response.data;
    } catch (error: any) {
      console.error('API request failed:', error);
      
      if (error.response) {
        // Server responded with error status
        const errorMessage = error.response.data?.detail || 
                           error.response.data?.message || 
                           `HTTP ${error.response.status}: ${error.response.statusText}`;
        throw new Error(errorMessage);
      } else if (error.request) {
        // Request was made but no response received
        throw new Error('No response from server. Please check your connection.');
      } else {
        // Something else happened
        throw new Error(error.message || 'An unexpected error occurred');
      }
    }
  }

  // Repository Management
  async subscribeToRepository(request: SubscribeRepositoryRequest): Promise<ApiResponse<RepositorySubscription>> {
    return this.handleRequest(
      axios.post(this.getUrl('/repositories/subscribe'), request)
    );
  }

  async unsubscribeFromRepository(repositoryName: string): Promise<ApiResponse<null>> {
    return this.handleRequest(
      axios.post(this.getUrl('/repositories/unsubscribe'), {
        repository_name: repositoryName
      })
    );
  }

  async getSubscribedRepositories(): Promise<{ repositories: RepositoryStats[]; total_count: number }> {
    return this.handleRequest(
      axios.get(this.getUrl('/repositories'))
    );
  }

  async getRepositoryPullRequests(repositoryName: string): Promise<{ 
    pull_requests: PullRequest[]; 
    repository_name: string; 
    total_count: number 
  }> {
    return this.handleRequest(
      axios.get(this.getUrl(`/repositories/${encodeURIComponent(repositoryName)}/pull-requests`))
    );
  }

  async refreshRepository(repositoryName: string): Promise<{ success: boolean; message: string }> {
    return this.handleRequest(
      axios.post(this.getUrl(`/repositories/${encodeURIComponent(repositoryName)}/refresh`))
    );
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.handleRequest(
      axios.get(this.getUrl('/health'))
    );
  }

  // Utility methods
  setBaseURL(url: string) {
    this.baseURL = url;
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Export class for testing or multiple instances
export { ApiService };