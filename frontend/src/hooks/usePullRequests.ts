import { useState, useCallback, useEffect } from 'react';
import { apiService } from '../services/api';
import { PullRequest } from '../types';

interface UsePullRequestsReturn {
  allPullRequests: Record<string, PullRequest[]>; // repositoryName -> PullRequest[]
  userRelevantPRs: PullRequest[]; // PRs relevant to current user (assigned, review requested, etc.)
  expandedRepositories: Set<string>;
  loading: boolean;
  error: string | null;
  fetchPullRequestsForRepository: (repositoryName: string) => Promise<void>;
  fetchPullRequestsForAllRepositories: (repositoryNames: string[]) => Promise<void>;
  fetchUserRelevantPullRequests: () => Promise<void>;
  toggleRepositoryExpansion: (repositoryName: string) => void;
  updatePullRequest: (repositoryName: string, updatedPR: PullRequest) => void;
  removePullRequest: (repositoryName: string, prNumber: number) => void;
  addPullRequest: (repositoryName: string, newPR: PullRequest) => void;
  clearAllPullRequests: () => void;
  getPullRequestsForRepository: (repositoryName: string) => PullRequest[];
}

export function usePullRequests(isAuthenticated: boolean): UsePullRequestsReturn {
  const [allPullRequests, setAllPullRequests] = useState<Record<string, PullRequest[]>>({});
  const [userRelevantPRs, setUserRelevantPRs] = useState<PullRequest[]>([]);
  const [expandedRepositories, setExpandedRepositories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPullRequestsForRepository = useCallback(async (repositoryName: string) => {
    // Repository fetching no longer supported - teams only
    console.warn('fetchPullRequestsForRepository called but no longer supported');
  }, []);

  const fetchPullRequestsForAllRepositories = useCallback(async (repositoryNames: string[]) => {
    // Repository fetching no longer supported - teams only
    console.warn('fetchPullRequestsForAllRepositories called but no longer supported');
  }, []);

  const fetchUserRelevantPullRequests = useCallback(async () => {
    // Only fetch if authenticated
    if (!isAuthenticated) {
      setUserRelevantPRs([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.getUserRelevantPullRequests();
      setUserRelevantPRs(response.pull_requests || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch user relevant pull requests:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const toggleRepositoryExpansion = useCallback((repositoryName: string) => {
    setExpandedRepositories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(repositoryName)) {
        newSet.delete(repositoryName);
      } else {
        newSet.add(repositoryName);
      }
      return newSet;
    });
  }, []);

  const updatePullRequest = useCallback((repositoryName: string, updatedPR: PullRequest) => {
    setAllPullRequests(prev => {
      const existingPRs = prev[repositoryName] || [];
      const existingPR = existingPRs.find(pr => pr.number === updatedPR.number);
      
      // If PR doesn't exist or data hasn't changed, return previous state
      if (!existingPR || JSON.stringify(existingPR) === JSON.stringify(updatedPR)) {
        return prev;
      }
      
      return {
        ...prev,
        [repositoryName]: existingPRs.map(pr => 
          pr.number === updatedPR.number ? updatedPR : pr
        )
      };
    });
  }, []);

  const removePullRequest = useCallback((repositoryName: string, prNumber: number) => {
    setAllPullRequests(prev => ({
      ...prev,
      [repositoryName]: (prev[repositoryName] || []).filter(pr => pr.number !== prNumber)
    }));
  }, []);

  const addPullRequest = useCallback((repositoryName: string, newPR: PullRequest) => {
    setAllPullRequests(prev => {
      const existingPRs = prev[repositoryName] || [];
      const existingPR = existingPRs.find(pr => pr.number === newPR.number);
      
      // If PR already exists and data hasn't changed, return previous state
      if (existingPR && JSON.stringify(existingPR) === JSON.stringify(newPR)) {
        return prev;
      }
      
      return {
        ...prev,
        [repositoryName]: existingPR
          ? existingPRs.map(pr => pr.number === newPR.number ? newPR : pr)
          : [newPR, ...existingPRs]
      };
    });
  }, []);

  const clearAllPullRequests = useCallback(() => {
    setAllPullRequests({});
    setExpandedRepositories(new Set());
  }, []);

  const getPullRequestsForRepository = useCallback((repositoryName: string): PullRequest[] => {
    return allPullRequests[repositoryName] || [];
  }, [allPullRequests]);

  // Add automatic polling every 30 seconds as fallback to WebSocket
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      console.log('📡 Polling for user-relevant PRs...');
      fetchUserRelevantPullRequests();
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, [fetchUserRelevantPullRequests, isAuthenticated]);

  return {
    allPullRequests,
    userRelevantPRs,
    expandedRepositories,
    loading,
    error,
    fetchPullRequestsForRepository,
    fetchPullRequestsForAllRepositories,
    fetchUserRelevantPullRequests,
    toggleRepositoryExpansion,
    updatePullRequest,
    removePullRequest,
    addPullRequest,
    clearAllPullRequests,
    getPullRequestsForRepository
  };
}