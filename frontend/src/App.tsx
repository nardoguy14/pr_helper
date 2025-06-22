import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { Plus, ArrowLeft, ChevronLeft, ChevronRight, Bell, User, LogOut } from 'lucide-react';

import { ReactFlowMindMap } from './components/visualization/ReactFlowMindMap';
import { PRDirectedGraph } from './components/visualization/PRDirectedGraph';
import { AddSubscriptionForm } from './components/ui/AddSubscriptionForm';
import { SubscriptionList } from './components/ui/SubscriptionList';
import { ConnectionStatus } from './components/ui/ConnectionStatus';
import { NotificationsPanel as NotificationsPanelComponent } from './components/ui/NotificationsPanel';
import { DateRangeFilter } from './components/ui/DateRangeFilter';
import { TokenSetup } from './components/auth/TokenSetup';

import { useWebSocket } from './hooks/useWebSocket';
import { useRepositories } from './hooks/useRepositories';
import { useTeamRepositories } from './hooks/useTeamRepositories';
import { useTeams } from './hooks/useTeams';
import { usePullRequests } from './hooks/usePullRequests';
import { useAuth } from './hooks/useAuth';

import { SubscribeRepositoryRequest, TeamSubscriptionRequest, PullRequest } from './types';

const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }
  
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
    background-color: #f6f8fa;
    color: #24292e;
  }
  
  button, input, select, textarea {
    font-family: inherit;
  }
`;

const AppContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  background: white;
  border-bottom: 1px solid #e1e4e8;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const Logo = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #24292e;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
  
  ${props => props.$variant === 'primary' ? `
    background: #2da44e;
    color: white;
    border-color: #2da44e;
    
    &:hover:not(:disabled) {
      background: #2c974b;
    }
    
    &:disabled {
      background: #94d3a2;
      cursor: not-allowed;
    }
  ` : `
    background: #f6f8fa;
    color: #24292e;
    border-color: #d0d7de;
    
    &:hover {
      background: #f3f4f6;
    }
  `}
`;

const Main = styled.main<{ $repositoriesCollapsed: boolean }>`
  position: fixed;
  top: 73px; /* Below header */
  left: 0;
  right: ${props => props.$repositoriesCollapsed ? '0' : '400px'};
  bottom: 0;
  transition: right 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const RepositoriesPanel = styled.div<{ $collapsed: boolean }>`
  position: fixed;
  top: 73px; /* Below header */
  right: 0;
  width: 400px;
  height: calc(100vh - 73px);
  background: #f6f8fa;
  border-left: 1px solid #e1e4e8;
  transform: translateX(${props => props.$collapsed ? '100%' : '0'});
  transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  overflow-y: auto;
  box-shadow: ${props => props.$collapsed ? 'none' : '-2px 0 8px rgba(0, 0, 0, 0.1)'};
`;


const ViewToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e1e4e8;
  flex-shrink: 0;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow: hidden;
`;

const ViewTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #24292e;
  flex: 1;
`;

const BackButton = styled(Button)`
  background: #f6f8fa;
  color: #24292e;
  border-color: #d0d7de;
`;

const NotificationsButton = styled.button<{ $hasNotifications: boolean }>`
  position: relative;
  background: ${props => props.$hasNotifications ? '#fff5f5' : 'white'};
  border: 1px solid ${props => props.$hasNotifications ? '#fed7d7' : '#e1e4e8'};
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.$hasNotifications ? '#fef2f2' : '#f6f8fa'};
  }
`;

const NotificationsBadge = styled.span`
  position: absolute;
  top: -6px;
  right: -6px;
  background: #d73a49;
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
`;

const NotificationsDropdown = styled.div<{ $visible: boolean }>`
  position: absolute;
  top: 100%;
  right: 0;
  width: 400px;
  max-height: 400px;
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 9999;
  opacity: ${props => props.$visible ? '1' : '0'};
  transform: ${props => props.$visible ? 'translateY(8px)' : 'translateY(0)'};
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transition: all 0.2s ease;
  overflow: hidden;
`;

const NotificationsHeader = styled.div`
  padding: 16px;
  background: #f6f8fa;
  border-bottom: 1px solid #e1e4e8;
  font-weight: 600;
  color: #24292e;
`;

const NotificationsList = styled.div`
  max-height: 300px;
  overflow-y: auto;
`;

const UserMenuButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #24292e;
  transition: all 0.2s ease;
  position: relative;
  
  &:hover {
    background: #f6f8fa;
    border-color: #d0d7de;
  }
`;

const UserAvatar = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 50%;
`;

const UserMenuDropdown = styled.div<{ $visible: boolean }>`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  min-width: 200px;
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
  opacity: ${props => props.$visible ? '1' : '0'};
  transform: translateY(${props => props.$visible ? '0' : '-10px'});
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transition: all 0.2s ease;
  z-index: 100;
  overflow: hidden;
`;

const UserMenuHeader = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #e1e4e8;
  font-weight: 600;
  color: #24292e;
`;

const UserMenuItem = styled.button`
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #24292e;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.2s ease;
  text-align: left;
  
  &:hover {
    background: #f6f8fa;
  }
  
  &:focus {
    outline: none;
    background: #f6f8fa;
  }
`;

const RepositoriesToggle = styled.button<{ $collapsed: boolean }>`
  position: fixed;
  top: 50%;
  right: ${props => props.$collapsed ? '0px' : '400px'};
  transform: translateY(-50%);
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 8px 0 0 8px;
  width: 40px;
  height: 56px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
  z-index: 1001;
  
  &:hover {
    background: #f6f8fa;
  }
`;


const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px;
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  color: #656d76;
`;

const ErrorMessage = styled.div`
  background: #fff5f5;
  border: 1px solid #fed7d7;
  color: #c53030;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: #24292e;
  margin: 0 0 12px 0;
  padding: 0;
`;

function App() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentView, setCurrentView] = useState<'mindmap' | 'pr-graph'>('mindmap');
  const [repositoriesCollapsed, setRepositoriesCollapsed] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [expandedRepositoryNodes, setExpandedRepositoryNodes] = useState<Set<string>>(new Set());
  const [allTeamPullRequests, setAllTeamPullRequests] = useState<Record<string, any[]>>({});
  const [teamRepositories, setTeamRepositories] = useState<Record<string, string[]>>({});
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  // Initialize with last week
  const getDefaultDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    return { startDate, endDate };
  };
  
  const [dateFilter, setDateFilter] = useState<{ startDate: Date | null; endDate: Date | null }>(getDefaultDateRange());
  const notificationsRef = useRef<HTMLButtonElement>(null);

  // Authentication hook
  const { 
    isAuthenticated, 
    user, 
    isLoading: authLoading, 
    error: authError, 
    rateLimited,
    setToken, 
    clearToken 
  } = useAuth();

  // Debug authentication state changes
  useEffect(() => {
    console.log('App: Authentication state changed:', {
      isAuthenticated,
      user: user?.login,
      authLoading,
      authError
    });
  }, [isAuthenticated, user, authLoading, authError]);
  
  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-user-menu]')) {
        setShowUserMenu(false);
      }
      if (!target.closest('[data-notifications]')) {
        setShowNotifications(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debug backend status in Electron
  useEffect(() => {
    if (window.electronAPI && (window.electronAPI as any).getBackendStatus) {
      const checkBackendStatus = async () => {
        try {
          const status = await (window.electronAPI as any).getBackendStatus();
          console.log('Backend Status:', status);
          
          // Show backend logs in console
          if (status.logs) {
            status.logs.forEach((log: any) => {
              console.log(`[Backend ${log.type}] ${log.timestamp}: ${log.message}`);
            });
          }
        } catch (error) {
          console.error('Failed to get backend status:', error);
        }
      };

      checkBackendStatus();
      
      // Check backend status every 5 seconds
      const interval = setInterval(checkBackendStatus, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  // Hooks - Pass isAuthenticated to enable data fetching after auth
  const {
    repositories,
    loading: reposLoading,
    error: reposError,
    subscribeToRepository,
    unsubscribeFromRepository,
    refreshRepository,
    updateRepositoryStats
  } = useRepositories(isAuthenticated);

  // Hook for team-discovered repositories (dynamic nodes)
  const {
    teamRepositories: discoveredTeamRepositories,
    loading: teamRepositoriesLoading,
    error: teamRepositoriesError,
    refreshTeamRepositories
  } = useTeamRepositories(isAuthenticated);

  const {
    teams,
    loading: teamsLoading,
    error: teamsError,
    subscribeToTeam,
    unsubscribeFromTeam,
    refreshTeam,
    updateTeamStats,
    enableTeam,
    disableTeam
  } = useTeams(isAuthenticated);

  const {
    allPullRequests,
    userRelevantPRs,
    expandedRepositories,
    loading: prsLoading,
    error: prsError,
    fetchPullRequestsForRepository,
    fetchPullRequestsForAllRepositories,
    fetchUserRelevantPullRequests,
    toggleRepositoryExpansion,
    updatePullRequest,
    addPullRequest,
    clearAllPullRequests,
    getPullRequestsForRepository
  } = usePullRequests(isAuthenticated);

  const { isConnected, error: wsError } = useWebSocket(
    // Handle PR updates
    useCallback(async (data: any) => {
      const { repository, update_type, pull_request } = data;
      
      // Update PRs for any repository we have data for
      if (allPullRequests[repository] !== undefined) {
        switch (update_type) {
          case 'new_pr':
          case 'updated':
            addPullRequest(repository, pull_request);
            break;
          case 'closed':
            updatePullRequest(repository, pull_request);
            break;
        }
        
        // Show notification for PR updates
        const { NotificationService } = await import('./services/notifications');
        await NotificationService.notifyPRUpdate(pull_request, update_type);
      }
    }, [allPullRequests, addPullRequest, updatePullRequest]),
    
    // Handle repository stats updates
    useCallback((data: any) => {
      const { repository, stats } = data;
      updateRepositoryStats(repository, stats);
    }, [updateRepositoryStats]),
    isAuthenticated
  );

  // Track when initial data is loaded after authentication
  useEffect(() => {
    if (isAuthenticated && !initialDataLoaded) {
      // Mark as loaded when we have either repos or teams data, or both finished loading
      if ((!reposLoading && !teamsLoading) && (repositories.length > 0 || teams.length > 0)) {
        setInitialDataLoaded(true);
      }
    }
  }, [isAuthenticated, initialDataLoaded, reposLoading, teamsLoading, repositories.length, teams.length]);

  // Reset initial data loaded state when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setInitialDataLoaded(false);
    }
  }, [isAuthenticated]);

  // Debug the hook data
  useEffect(() => {
    console.log('=== HOOK DEBUG ===');
    console.log('isAuthenticated:', isAuthenticated);
    console.log('discoveredTeamRepositories:', discoveredTeamRepositories);
    console.log('teamRepositoriesLoading:', teamRepositoriesLoading);
    console.log('teamRepositoriesError:', teamRepositoriesError);
    console.log('=== END HOOK DEBUG ===');
  }, [isAuthenticated, discoveredTeamRepositories, teamRepositoriesLoading, teamRepositoriesError]);

  // Transform team repositories data from the new hook into the expected format
  useEffect(() => {
    console.log('Transform useEffect triggered, discoveredTeamRepositories:', discoveredTeamRepositories?.length || 0);
    
    if (discoveredTeamRepositories && discoveredTeamRepositories.length > 0) {
      const transformedTeamRepos: Record<string, string[]> = {};
      
      // Group repositories by the teams they come from
      discoveredTeamRepositories.forEach(teamRepo => {
        teamRepo.from_teams.forEach(teamKey => {
          if (!transformedTeamRepos[teamKey]) {
            transformedTeamRepos[teamKey] = [];
          }
          if (!transformedTeamRepos[teamKey].includes(teamRepo.repository_name)) {
            transformedTeamRepos[teamKey].push(teamRepo.repository_name);
          }
        });
      });
      
      console.log('Setting transformed team repositories:', transformedTeamRepos);
      setTeamRepositories(transformedTeamRepos);
    } else {
      console.log('No discovered team repositories to transform');
    }
  }, [discoveredTeamRepositories]);

  // Preload PR data for all repositories when they change
  useEffect(() => {
    if (repositories.length > 0 && !reposLoading) {
      const repositoryNames = repositories.map(repo => repo.repository.full_name);
      fetchPullRequestsForAllRepositories(repositoryNames);
    }
  }, [repositories, reposLoading, fetchPullRequestsForAllRepositories]);

  // Add automatic polling every 30 seconds for repository PR data as fallback to WebSocket
  useEffect(() => {
    if (!isAuthenticated || repositories.length === 0) return;

    const interval = setInterval(() => {
      const repositoryNames = repositories.map(repo => repo.repository.full_name);
      fetchPullRequestsForAllRepositories(repositoryNames);
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, [fetchPullRequestsForAllRepositories, isAuthenticated, repositories]);

  // Load user-relevant PRs for notifications on app start and when teams change
  useEffect(() => {
    if ((repositories.length > 0 && !reposLoading) || (teams.length > 0 && !teamsLoading)) {
      fetchUserRelevantPullRequests();
    }
  }, [repositories, reposLoading, teams, teamsLoading, fetchUserRelevantPullRequests]);

  // Request notification permissions on app start
  useEffect(() => {
    import('./services/notifications').then(({ NotificationService }) => {
      NotificationService.requestPermission();
    });
  }, []);

  // Track previous user-relevant PRs to detect new assignments/review requests
  const [previousUserPRs, setPreviousUserPRs] = useState<PullRequest[]>([]);

  // Detect new PR assignments and review requests for notifications
  useEffect(() => {
    if (userRelevantPRs.length === 0) return;

    // Skip on first load to avoid notifications for existing PRs
    if (previousUserPRs.length === 0) {
      setPreviousUserPRs(userRelevantPRs);
      return;
    }

    const newPRs = userRelevantPRs.filter(currentPR => 
      !previousUserPRs.some(prevPR => prevPR.id === currentPR.id)
    );

    // Check for existing PRs with new assignments or review requests
    const updatedPRs = userRelevantPRs.filter(currentPR => {
      const prevPR = previousUserPRs.find(prev => prev.id === currentPR.id);
      if (!prevPR) return false;

      // Check if newly assigned
      const newlyAssigned = !prevPR.user_is_assigned && currentPR.user_is_assigned;
      // Check if newly requested for review
      const newlyRequestedReview = !prevPR.user_is_requested_reviewer && currentPR.user_is_requested_reviewer;

      return newlyAssigned || newlyRequestedReview;
    });

    // Send notifications for new PRs
    newPRs.forEach(async (pr) => {
      const { NotificationService } = await import('./services/notifications');
      if (pr.user_is_assigned) {
        await NotificationService.notifyNewAssignment(pr);
      } else if (pr.user_is_requested_reviewer) {
        await NotificationService.notifyNewReviewRequest(pr);
      }
    });

    // Send notifications for updated PRs
    updatedPRs.forEach(async (pr) => {
      const { NotificationService } = await import('./services/notifications');
      const prevPR = previousUserPRs.find(prev => prev.id === pr.id);
      if (!prevPR) return;

      if (!prevPR.user_is_assigned && pr.user_is_assigned) {
        await NotificationService.notifyNewAssignment(pr);
      } else if (!prevPR.user_is_requested_reviewer && pr.user_is_requested_reviewer) {
        await NotificationService.notifyNewReviewRequest(pr);
      }
    });

    // Update previous PRs for next comparison
    setPreviousUserPRs(userRelevantPRs);
  }, [userRelevantPRs, previousUserPRs]);

  // Periodic refresh of user-relevant PRs for real-time notifications
  useEffect(() => {
    if (!fetchUserRelevantPullRequests) return;

    // Refresh user-relevant PRs every 2 minutes to catch new assignments/reviews
    const interval = setInterval(() => {
      fetchUserRelevantPullRequests();
    }, 2 * 60 * 1000); // 2 minutes

    return () => clearInterval(interval);
  }, [fetchUserRelevantPullRequests]);

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotifications]);

  // Fetch team PRs to populate allTeamPullRequests when teams are available
  useEffect(() => {
    if (teams.length === 0 || !isAuthenticated) return;
    
    teams.forEach(team => {
      const teamKey = `${team.organization}/${team.team_name}`;
      
      // Skip if already have data for this team
      if (allTeamPullRequests[teamKey]) return;
      
      console.log('Fetching PRs for team:', teamKey);
      
      fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/v1/teams/${team.organization}/${team.team_name}/pull-requests`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to fetch team PRs: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('Fetched PRs for team:', teamKey, data.pull_requests?.length || 0);
          
          setAllTeamPullRequests(prev => ({
            ...prev,
            [teamKey]: data.pull_requests || []
          }));
        })
        .catch(error => {
          console.error('Failed to fetch team PRs:', error);
        });
    });
  }, [teams, isAuthenticated, allTeamPullRequests]);

  const handleAddRepository = async (request: SubscribeRepositoryRequest) => {
    try {
      await subscribeToRepository(request);
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add repository:', error);
      // Error is handled by the hook
    }
  };

  const handleAddTeam = async (request: TeamSubscriptionRequest) => {
    try {
      await subscribeToTeam(request);
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add team:', error);
      // Error is handled by the hook
    }
  };

  const handleRemoveRepository = async (repositoryName: string) => {
    // Remove from expanded repositories if it was expanded
    if (expandedRepositories.has(repositoryName)) {
      toggleRepositoryExpansion(repositoryName);
    }
    await unsubscribeFromRepository(repositoryName);
  };

  const handleRepositoryClick = useCallback(async (nodeId: string, repositoryName: string) => {
    console.log('handleRepositoryClick called:', nodeId, repositoryName);
    console.log('Current expandedRepositoryNodes before toggle:', Array.from(expandedRepositoryNodes));
    
    // Toggle the node expansion state
    setExpandedRepositoryNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        console.log('Removing nodeId from expanded:', nodeId);
        newSet.delete(nodeId);
      } else {
        console.log('Adding nodeId to expanded:', nodeId);
        newSet.add(nodeId);
      }
      console.log('New expandedRepositoryNodes:', Array.from(newSet));
      return newSet;
    });
    
    // Check if we already have PR data for this repository (either from direct subscription or team)
    const hasPRData = allPullRequests[repositoryName] || 
                     Object.values(allTeamPullRequests).some(teamPRs => 
                       teamPRs.some((pr: any) => pr.repository.full_name === repositoryName)
                     );
    
    if (hasPRData) {
      // If we have PR data from teams, populate the allPullRequests for this repo
      if (!allPullRequests[repositoryName]) {
        const repoPRs: any[] = [];
        Object.values(allTeamPullRequests).forEach(teamPRs => {
          teamPRs.forEach((pr: any) => {
            if (pr.repository.full_name === repositoryName) {
              repoPRs.push(pr);
            }
          });
        });
        
        if (repoPRs.length > 0) {
          console.log('Populating repository PRs from team data:', repoPRs.length, 'PRs');
          // Use the existing usePullRequests hook method to add these PRs
          repoPRs.forEach(pr => addPullRequest(repositoryName, pr));
        }
      }
      
      // Also toggle in the old system for backward compatibility
      toggleRepositoryExpansion(repositoryName);
    } else {
      // Fetch PR data if we don't have it
      try {
        await fetchPullRequestsForRepository(repositoryName);
        toggleRepositoryExpansion(repositoryName);
      } catch (error) {
        console.error('Failed to fetch pull requests:', error);
      }
    }
  }, [expandedRepositoryNodes, allPullRequests, allTeamPullRequests, addPullRequest, toggleRepositoryExpansion, fetchPullRequestsForRepository]);

  const handleTeamClick = useCallback(async (organization: string, teamName: string) => {
    console.log('handleTeamClick called:', organization, teamName);
    const teamKey = `${organization}/${teamName}`;
    
    // Simple toggle expansion logic - let the hook handle data fetching
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (prev.has(teamKey)) {
        console.log('Collapsing team:', teamKey);
        newSet.delete(teamKey);
      } else {
        console.log('Expanding team:', teamKey);
        newSet.add(teamKey);
      }
      return newSet;
    });
  }, []);

  const handleBackToMindMap = () => {
    clearAllPullRequests();
    setCurrentView('mindmap');
  };

  const handlePRClick = useCallback(async (pr: PullRequest) => {
    const { openExternal } = await import('./utils/electron');
    await openExternal(pr.html_url);
  }, []);

  // Get all PRs from both repositories and teams
  const allPRs = useMemo(() => {
    const repoPRs = Object.values(allPullRequests).flat();
    const teamPRs = Object.values(allTeamPullRequests).flat();
    return [...repoPRs, ...teamPRs];
  }, [allPullRequests, allTeamPullRequests]);

  // Filter PRs based on date filter
  const filteredPullRequests = useMemo(() => {
    if (!dateFilter.startDate && !dateFilter.endDate) return allPullRequests;
    
    const filtered: Record<string, PullRequest[]> = {};
    Object.entries(allPullRequests).forEach(([repo, prs]) => {
      const filteredPRs = prs.filter(pr => {
        const prDate = new Date(pr.created_at);
        const afterStart = !dateFilter.startDate || prDate >= dateFilter.startDate;
        const beforeEnd = !dateFilter.endDate || prDate <= dateFilter.endDate;
        return afterStart && beforeEnd;
      });
      // Only include repos that have PRs in the date range
      if (filteredPRs.length > 0) {
        filtered[repo] = filteredPRs;
      }
    });
    return filtered;
  }, [allPullRequests, dateFilter]);

  // Filter team PRs based on date filter
  const filteredTeamPullRequests = useMemo(() => {
    if (!dateFilter.startDate && !dateFilter.endDate) return allTeamPullRequests;
    
    const filtered: Record<string, any[]> = {};
    Object.entries(allTeamPullRequests).forEach(([team, prs]) => {
      const filteredPRs = prs.filter(pr => {
        const prDate = new Date(pr.created_at);
        const afterStart = !dateFilter.startDate || prDate >= dateFilter.startDate;
        const beforeEnd = !dateFilter.endDate || prDate <= dateFilter.endDate;
        return afterStart && beforeEnd;
      });
      // Only include teams that have PRs in the date range
      if (filteredPRs.length > 0) {
        filtered[team] = filteredPRs;
      }
    });
    return filtered;
  }, [allTeamPullRequests, dateFilter]);

  // Filter repositories to only show those with visible PRs and update their counts
  const visibleRepositories = useMemo(() => {
    return repositories
      .map(repo => {
        const repoPRs = filteredPullRequests[repo.repository.full_name] || [];
        if (repoPRs.length === 0) return null;
        
        // Calculate filtered stats
        const filteredStats = {
          total_open_prs: repoPRs.length,
          assigned_to_user: repoPRs.filter(pr => pr.user_is_assigned).length,
          review_requests: repoPRs.filter(pr => pr.user_is_requested_reviewer).length,
          code_owner_prs: 0, // Maintain the property for compatibility
        };
        
        return {
          ...repo,
          ...filteredStats
        };
      })
      .filter((repo): repo is NonNullable<typeof repo> => repo !== null);
  }, [repositories, filteredPullRequests]);

  // Create teams with filtered PR counts based on date filter
  const teamsWithFilteredCounts = useMemo(() => {
    return teams.map(team => {
      const teamKey = `${team.organization}/${team.team_name}`;
      const teamPRs = filteredTeamPullRequests[teamKey];
      
      console.log(`Team ${teamKey}: original count=${team.total_open_prs}, has fetched PRs=${!!teamPRs}, fetched count=${teamPRs?.length || 0}`);
      
      // If we have fetched PRs for this team, use the filtered count
      // Otherwise, return the team with a flag indicating we need to fetch PRs
      if (teamPRs) {
        const filteredStats = {
          total_open_prs: teamPRs.length,
          assigned_to_user: teamPRs.filter((pr: any) => pr.user_is_assigned).length,
          review_requests: teamPRs.filter((pr: any) => pr.user_is_requested_reviewer).length,
        };
        
        return {
          ...team,
          ...filteredStats,
          hasFetchedPRs: true
        };
      }
      
      // Return original team stats if we haven't fetched the PRs yet
      // The display will show "..." or indicate loading for unfetched teams
      return {
        ...team,
        hasFetchedPRs: false
      };
    });
  }, [teams, filteredTeamPullRequests]);

  // Get PRs that need attention from the current user (assigned, review requested, etc.)
  // Now includes assigned PRs that were missing before!
  const reviewPRs = userRelevantPRs.filter(pr => 
    pr.user_is_assigned ||                    // Assigned PRs (was missing!)
    pr.user_is_requested_reviewer || 
    (pr.status === 'needs_review' && !pr.user_has_reviewed)
  );

  // Handle token setup
  const handleTokenSet = async (token: string, userInfo: any) => {
    console.log('Token set successfully, user:', userInfo);
    // The authentication state should already be updated by the TokenSetup component
    // Just trigger any additional data refresh if needed
  };
  
  // Handle logout
  const handleLogout = async () => {
    console.log('Logging out...');
    setShowUserMenu(false);
    await clearToken();
    // Clear all data
    clearAllPullRequests();
    // Clear dock badge and tray notification
    if (window.electronAPI) {
      if (window.electronAPI.setBadgeCount) {
        window.electronAPI.setBadgeCount(0);
      }
      if (window.electronAPI.setTrayNotification) {
        window.electronAPI.setTrayNotification(0);
      }
    }
  };

  // Update macOS dock badge and tray icon when review count changes
  useEffect(() => {
    if (window.electronAPI) {
      console.log(`🔴 Updating dock badge and tray icon with ${reviewPRs.length} pending reviews`);
      
      // Update dock badge
      if (window.electronAPI.setBadgeCount) {
        window.electronAPI.setBadgeCount(reviewPRs.length);
      }
      
      // Update tray icon
      if (window.electronAPI.setTrayNotification) {
        window.electronAPI.setTrayNotification(reviewPRs.length);
      }
    }
  }, [reviewPRs.length]);

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <>
        <GlobalStyle />
        <AppContainer style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>Loading...</div>
            <div style={{ color: '#586069' }}>Checking authentication status</div>
          </div>
        </AppContainer>
      </>
    );
  }

  // Show loading screen while fetching initial data after authentication
  if (isAuthenticated && !initialDataLoaded && (reposLoading || teamsLoading)) {
    return (
      <>
        <GlobalStyle />
        <AppContainer style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>Loading your data...</div>
            <div style={{ color: '#586069' }}>Fetching repositories and teams</div>
          </div>
        </AppContainer>
      </>
    );
  }

  // Rate Limit Banner Component
  const RateLimitBanner = () => {
    if (!rateLimited) return null;
    
    return (
      <div style={{
        backgroundColor: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '4px',
        padding: '12px 16px',
        margin: '16px',
        display: 'flex',
        alignItems: 'center',
        color: '#856404'
      }}>
        <span style={{ marginRight: '8px' }}>⚠️</span>
        <div>
          <strong>GitHub API Rate Limited</strong>
          <div style={{ fontSize: '14px', marginTop: '4px' }}>
            Your GitHub token is still valid, but API requests are temporarily limited. 
            Please wait a few minutes before making more requests.
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <GlobalStyle />
      <TokenSetup 
        isVisible={!isAuthenticated} 
        onTokenSet={handleTokenSet}
        setToken={setToken}
      />
      <AppContainer>
        <RateLimitBanner />
        <Header>
          <HeaderLeft>
            <Logo>
              📋 PR Monitor
            </Logo>
            {expandedRepositories.size > 0 && (
              <span style={{ color: '#586069', fontSize: '14px' }}>
                → {expandedRepositories.size} expanded
              </span>
            )}
          </HeaderLeft>
          
          <HeaderRight>
            <ConnectionStatus 
              isConnected={isConnected} 
              error={wsError} 
            />
            <NotificationsButton
              data-notifications
              ref={notificationsRef}
              $hasNotifications={reviewPRs.length > 0}
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell size={16} />
              {reviewPRs.length > 0 && (
                <NotificationsBadge>{reviewPRs.length}</NotificationsBadge>
              )}
              <NotificationsDropdown $visible={showNotifications}>
                <NotificationsPanelComponent
                  userRelevantPRs={reviewPRs}
                  onPRClick={handlePRClick}
                />
              </NotificationsDropdown>
            </NotificationsButton>
            
            {user && (
              <UserMenuButton data-user-menu onClick={() => setShowUserMenu(!showUserMenu)}>
                {user.avatar_url ? (
                  <UserAvatar src={user.avatar_url} alt={user.login} />
                ) : (
                  <User size={20} />
                )}
                <span>{user.login}</span>
                <UserMenuDropdown $visible={showUserMenu}>
                  <UserMenuHeader>Signed in as {user.login}</UserMenuHeader>
                  <UserMenuItem onClick={handleLogout}>
                    <LogOut size={16} />
                    Change GitHub Token
                  </UserMenuItem>
                </UserMenuDropdown>
              </UserMenuButton>
            )}
          </HeaderRight>
        </Header>

        <RepositoriesPanel $collapsed={repositoriesCollapsed}>
          {/* Date Range Filter */}
          {allPRs.length > 0 && (
            <>
              <SectionTitle>Filter PRs</SectionTitle>
              <DateRangeFilter
                pullRequests={allPRs}
                onDateChange={(startDate, endDate) => {
                  setDateFilter({ startDate, endDate });
                  // Reset expanded states to redraw the whole graph
                  setExpandedTeams(new Set());
                  setExpandedRepositoryNodes(new Set());
                  // Clear all expanded repositories
                  if (expandedRepositories.size > 0) {
                    clearAllPullRequests();
                  }
                }}
              />
            </>
          )}
          
          {/* Subscriptions Section */}
          <SectionTitle>Subscriptions</SectionTitle>
          
          {(reposError || teamsError) && (
            <ErrorMessage>
              {reposError || teamsError}
            </ErrorMessage>
          )}
          
          {(reposLoading || teamsLoading) && repositories.length === 0 && teams.length === 0 ? (
            <EmptyState>
              <h3>Loading subscriptions...</h3>
              <p>Fetching your subscribed repositories and teams from GitHub.</p>
            </EmptyState>
          ) : (
            <SubscriptionList
              repositories={visibleRepositories}
              teams={teamsWithFilteredCounts}
              onRemoveRepository={handleRemoveRepository}
              onRefreshRepository={refreshRepository}
              onRemoveTeam={unsubscribeFromTeam}
              onRefreshTeam={refreshTeam}
              loading={reposLoading || teamsLoading}
            />
          )}
          
          <Button 
            $variant="primary" 
            onClick={() => setShowAddForm(true)}
            style={{ marginTop: '16px', width: '100%' }}
          >
            <Plus size={16} />
            Add Subscription
          </Button>
        </RepositoriesPanel>

        <RepositoriesToggle
          $collapsed={repositoriesCollapsed}
          onClick={() => setRepositoriesCollapsed(!repositoriesCollapsed)}
        >
          {repositoriesCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </RepositoriesToggle>

        <Main $repositoriesCollapsed={repositoriesCollapsed}>
          <ViewToggle>
            {currentView === 'pr-graph' && (
              <BackButton onClick={handleBackToMindMap}>
                <ArrowLeft size={16} />
                Back to Overview
              </BackButton>
            )}
            
            <ViewTitle>
              {currentView === 'mindmap' ? 'Repository Overview' : 'Pull Requests'}
            </ViewTitle>
          </ViewToggle>

          <ContentArea>
            {prsError && (
              <ErrorMessage>
                {prsError}
              </ErrorMessage>
            )}

            {currentView === 'mindmap' ? (
              reposLoading && repositories.length === 0 ? (
                <EmptyState>
                  <h3>Loading...</h3>
                  <p>Setting up your repository dashboard.</p>
                </EmptyState>
              ) : visibleRepositories.length > 0 || teamsWithFilteredCounts.length > 0 ? (
                <ReactFlowMindMap
                  key={`mindmap-${dateFilter.startDate?.getTime() || 0}-${dateFilter.endDate?.getTime() || 0}`}
                  repositories={visibleRepositories}
                  teams={teamsWithFilteredCounts}
                  onRepositoryClick={handleRepositoryClick}
                  onTeamClick={handleTeamClick}
                  onPRClick={handlePRClick}
                  expandedRepositories={expandedRepositoryNodes}
                  expandedTeams={expandedTeams}
                  allPullRequests={filteredPullRequests}
                  allTeamPullRequests={filteredTeamPullRequests}
                  teamRepositories={teamRepositories}
                />
              ) : (
                <EmptyState>
                  <h3>Welcome to PR Monitor</h3>
                  <p>Add repositories or teams to start monitoring pull requests in a visual mind map.</p>
                  <Button 
                    $variant="primary" 
                    onClick={() => setShowAddForm(true)}
                    style={{ marginTop: '16px' }}
                  >
                    <Plus size={16} />
                    Add Your First Subscription
                  </Button>
                </EmptyState>
              )
            ) : (
              expandedRepositories.size > 0 && (
                <PRDirectedGraph
                  pullRequests={Object.values(filteredPullRequests).flat()}
                  repositoryName={Array.from(expandedRepositories)[0]}
                  onPRClick={handlePRClick}
                />
              )
            )}
          </ContentArea>
        </Main>

        <AddSubscriptionForm
          isVisible={showAddForm}
          onSubmitRepository={handleAddRepository}
          onSubmitTeam={handleAddTeam}
          onCancel={() => setShowAddForm(false)}
        />
      </AppContainer>
    </>
  );
}

export default App;
