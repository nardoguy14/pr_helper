import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { TeamStats, TeamSubscriptionRequest } from '../types';

interface UseTeamsReturn {
  teams: TeamStats[];
  loading: boolean;
  error: string | null;
  subscribeToTeam: (request: TeamSubscriptionRequest) => Promise<void>;
  unsubscribeFromTeam: (organization: string, teamName: string) => Promise<void>;
  refreshTeam: (organization: string, teamName: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  updateTeamStats: (organization: string, teamName: string, stats: any) => void;
  enableTeam: (organization: string, teamName: string) => Promise<void>;
  disableTeam: (organization: string, teamName: string) => Promise<void>;
}

export function useTeams(isAuthenticated: boolean): UseTeamsReturn {
  const [teams, setTeams] = useState<TeamStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    // Only fetch if authenticated
    if (!isAuthenticated) {
      setTeams([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getSubscribedTeams();
      
      // Only update if teams data has actually changed
      setTeams(prev => {
        // Deep comparison to check if data has changed
        if (JSON.stringify(prev) === JSON.stringify(response.teams)) {
          return prev; // Return same reference to prevent re-renders
        }
        return response.teams;
      });
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch teams:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const subscribeToTeam = useCallback(async (request: TeamSubscriptionRequest) => {
    try {
      setError(null);
      const response = await apiService.subscribeToTeam(request);
      if (response.success) {
        await fetchTeams(); // Refresh the list
      } else {
        throw new Error(response.message || 'Failed to subscribe to team');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchTeams]);

  const unsubscribeFromTeam = useCallback(async (organization: string, teamName: string) => {
    try {
      setError(null);
      const response = await apiService.unsubscribeFromTeam(organization, teamName);
      if (response.success) {
        setTeams(prev => prev.filter(team => 
          !(team.organization === organization && team.team_name === teamName)
        ));
      } else {
        throw new Error(response.message || 'Failed to unsubscribe from team');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const refreshTeam = useCallback(async (organization: string, teamName: string) => {
    try {
      setError(null);
      await apiService.refreshTeam(organization, teamName);
      await fetchTeams(); // Refresh the list to get updated stats
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchTeams]);

  const refreshAll = useCallback(async () => {
    await fetchTeams();
  }, [fetchTeams]);

  const updateTeamStats = useCallback((organization: string, teamName: string, stats: any) => {
    setTeams(prev => {
      const targetTeam = prev.find(team => team.organization === organization && team.team_name === teamName);
      
      // If team not found, return previous array unchanged
      if (!targetTeam) {
        return prev;
      }
      
      // Check if any stats actually changed
      const statsChanged = 
        targetTeam.total_open_prs !== stats.total_open_prs ||
        targetTeam.assigned_to_user !== stats.assigned_to_user ||
        targetTeam.review_requests !== stats.review_requests ||
        targetTeam.last_updated !== stats.last_updated;
      
      // If no changes, return previous array to prevent re-renders
      if (!statsChanged) {
        return prev;
      }
      
      // Only create new array if data actually changed
      return prev.map(team => {
        if (team.organization === organization && team.team_name === teamName) {
          return {
            ...team,
            total_open_prs: stats.total_open_prs,
            assigned_to_user: stats.assigned_to_user,
            review_requests: stats.review_requests,
            last_updated: stats.last_updated
          };
        }
        return team;
      });
    });
  }, []);

  const enableTeam = useCallback(async (organization: string, teamName: string) => {
    try {
      setError(null);
      const response = await apiService.enableTeam(organization, teamName);
      if (response.success) {
        setTeams(prev => prev.map(team => 
          team.organization === organization && team.team_name === teamName
            ? { ...team, enabled: true }
            : team
        ));
      } else {
        throw new Error(response.message || 'Failed to enable team');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const disableTeam = useCallback(async (organization: string, teamName: string) => {
    try {
      setError(null);
      const response = await apiService.disableTeam(organization, teamName);
      if (response.success) {
        setTeams(prev => prev.map(team => 
          team.organization === organization && team.team_name === teamName
            ? { ...team, enabled: false }
            : team
        ));
      } else {
        throw new Error(response.message || 'Failed to disable team');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams, isAuthenticated]);

  return {
    teams,
    loading,
    error,
    subscribeToTeam,
    unsubscribeFromTeam,
    refreshTeam,
    refreshAll,
    updateTeamStats,
    enableTeam,
    disableTeam
  };
}