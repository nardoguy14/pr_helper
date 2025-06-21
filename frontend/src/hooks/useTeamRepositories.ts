import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';

interface TeamRepository {
  repository_name: string;
  repository: any;
  total_open_prs: number;
  assigned_to_user: number;
  review_requests: number;
  from_teams: string[];
  prs: any[];
}

interface UseTeamRepositoriesReturn {
  teamRepositories: TeamRepository[];
  loading: boolean;
  error: string | null;
  refreshTeamRepositories: () => Promise<void>;
}

export function useTeamRepositories(isAuthenticated: boolean): UseTeamRepositoriesReturn {
  const [teamRepositories, setTeamRepositories] = useState<TeamRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeamRepositories = useCallback(async () => {
    // Only fetch if authenticated
    if (!isAuthenticated) {
      console.log('useTeamRepositories: Not authenticated, clearing repositories');
      setTeamRepositories([]);
      return;
    }

    try {
      console.log('useTeamRepositories: Starting fetch...');
      setLoading(true);
      setError(null);
      const response = await apiService.getTeamRepositories();
      console.log('useTeamRepositories: Fetched team repositories:', response.repositories.length, response.repositories);
      setTeamRepositories(response.repositories);
    } catch (err: any) {
      setError(err.message);
      console.error('useTeamRepositories: Failed to fetch team repositories:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const refreshTeamRepositories = useCallback(async () => {
    await fetchTeamRepositories();
  }, [fetchTeamRepositories]);

  useEffect(() => {
    fetchTeamRepositories();
  }, [fetchTeamRepositories, isAuthenticated]);

  return {
    teamRepositories,
    loading,
    error,
    refreshTeamRepositories
  };
}