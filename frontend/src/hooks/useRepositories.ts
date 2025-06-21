import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { RepositoryStats, PullRequest, SubscribeRepositoryRequest } from '../types';

interface UseRepositoriesReturn {
  repositories: RepositoryStats[];
  loading: boolean;
  error: string | null;
  subscribeToRepository: (request: SubscribeRepositoryRequest) => Promise<void>;
  unsubscribeFromRepository: (repositoryName: string) => Promise<void>;
  refreshRepository: (repositoryName: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  updateRepositoryStats: (repositoryName: string, stats: any) => void;
}

export function useRepositories(isAuthenticated: boolean): UseRepositoriesReturn {
  const [repositories, setRepositories] = useState<RepositoryStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRepositories = useCallback(async () => {
    // Only fetch if authenticated
    if (!isAuthenticated) {
      setRepositories([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getSubscribedRepositories();
      setRepositories(response.repositories);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch repositories:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const subscribeToRepository = useCallback(async (request: SubscribeRepositoryRequest) => {
    try {
      setError(null);
      const response = await apiService.subscribeToRepository(request);
      if (response.success) {
        await fetchRepositories(); // Refresh the list
      } else {
        throw new Error(response.message || 'Failed to subscribe to repository');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchRepositories]);

  const unsubscribeFromRepository = useCallback(async (repositoryName: string) => {
    try {
      setError(null);
      const response = await apiService.unsubscribeFromRepository(repositoryName);
      if (response.success) {
        setRepositories(prev => prev.filter(repo => repo.repository.full_name !== repositoryName));
      } else {
        throw new Error(response.message || 'Failed to unsubscribe from repository');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const refreshRepository = useCallback(async (repositoryName: string) => {
    try {
      setError(null);
      await apiService.refreshRepository(repositoryName);
      await fetchRepositories(); // Refresh the list to get updated stats
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchRepositories]);

  const refreshAll = useCallback(async () => {
    await fetchRepositories();
  }, [fetchRepositories]);

  const updateRepositoryStats = useCallback((repositoryName: string, stats: any) => {
    setRepositories(prev => prev.map(repo => {
      if (repo.repository.full_name === repositoryName) {
        return {
          ...repo,
          total_open_prs: stats.total_open_prs,
          assigned_to_user: stats.assigned_to_user,
          review_requests: stats.review_requests,
          last_updated: stats.last_updated
        };
      }
      return repo;
    }));
  }, []);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories, isAuthenticated]);

  return {
    repositories,
    loading,
    error,
    subscribeToRepository,
    unsubscribeFromRepository,
    refreshRepository,
    refreshAll,
    updateRepositoryStats
  };
}