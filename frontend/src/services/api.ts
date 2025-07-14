import axios, { AxiosResponse } from 'axios';
import {
  PullRequest,
  ApiResponse,
  TeamSubscriptionRequest,
  TeamSubscription,
  TeamStats,
  SubscribeTeamResponse,
  GetTeamsResponse,
  GetTeamPullRequestsResponse
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


  // Team Management
  async subscribeToTeam(request: TeamSubscriptionRequest): Promise<SubscribeTeamResponse> {
    return this.handleRequest(
      axios.post(this.getUrl('/teams/subscribe'), request)
    );
  }

  async unsubscribeFromTeam(organization: string, teamName: string): Promise<{ success: boolean; message: string }> {
    return this.handleRequest(
      axios.post(this.getUrl('/teams/unsubscribe'), {
        organization,
        team_name: teamName
      })
    );
  }

  async getSubscribedTeams(): Promise<GetTeamsResponse> {
    return this.handleRequest(
      axios.get(this.getUrl('/teams'))
    );
  }

  async getTeamPullRequests(organization: string, teamName: string): Promise<GetTeamPullRequestsResponse> {
    return this.handleRequest(
      axios.get(this.getUrl(`/teams/${encodeURIComponent(organization)}/${encodeURIComponent(teamName)}/pull-requests`))
    );
  }

  async refreshTeam(organization: string, teamName: string): Promise<{ success: boolean; message: string }> {
    return this.handleRequest(
      axios.post(this.getUrl(`/teams/${encodeURIComponent(organization)}/${encodeURIComponent(teamName)}/refresh`))
    );
  }

  async enableTeam(organization: string, teamName: string): Promise<{ success: boolean; message: string }> {
    return this.handleRequest(
      axios.post(this.getUrl(`/teams/${encodeURIComponent(organization)}/${encodeURIComponent(teamName)}/enable`))
    );
  }

  async disableTeam(organization: string, teamName: string): Promise<{ success: boolean; message: string }> {
    return this.handleRequest(
      axios.post(this.getUrl(`/teams/${encodeURIComponent(organization)}/${encodeURIComponent(teamName)}/disable`))
    );
  }

  // Get user-relevant pull requests (assigned, review requested, etc.)
  async getUserRelevantPullRequests(): Promise<{
    pull_requests: PullRequest[];
    total_count: number;
    sources: { repositories: number; teams: number };
  }> {
    return this.handleRequest(
      axios.get(this.getUrl('/users/me/pull-requests'))
    );
  }

  // Get team-discovered repositories for dynamic node creation
  async getTeamRepositories(): Promise<{
    repositories: any[];
    total_count: number;
  }> {
    return this.handleRequest(
      axios.get(this.getUrl('/teams/repositories'))
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