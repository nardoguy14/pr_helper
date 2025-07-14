import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { ArrowLeft, ChevronLeft, ChevronRight, Bell, User, LogOut } from 'lucide-react';

import { ReactFlowMindMap } from './components/visualization/ReactFlowMindMap';
import { PRDirectedGraph } from './components/visualization/PRDirectedGraph';
import { SubscriptionList } from './components/ui/SubscriptionList';
import { ConnectionStatus } from './components/ui/ConnectionStatus';
import { NotificationsPanel as NotificationsPanelComponent } from './components/ui/NotificationsPanel';
import { DateRangeFilter } from './components/ui/DateRangeFilter';
import { AuthorFilter } from './components/ui/AuthorFilter';
import { TokenSetup } from './components/auth/TokenSetup';

import { useWebSocket } from './hooks/useWebSocket';
import { useTeamRepositories } from './hooks/useTeamRepositories';
import { useTeams } from './hooks/useTeams';
import { usePullRequests } from './hooks/usePullRequests';
import { useAuth } from './hooks/useAuth';

import { PullRequest, PRState, PR_STATE_COLORS } from './types';

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

const StatusFilterContainer = styled.div`
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
`;

const PRCount = styled.div`
  text-align: center;
  margin-top: 12px;
  font-size: 13px;
  color: #586069;

  strong {
    color: #24292e;
    font-weight: 600;
  }
`;

const StatusFilterTitle = styled.h4`
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #24292e;
`;

const StatusFilterButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const StatusFilterButton = styled.button<{ $active: boolean; $stateColor: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid ${props => props.$active ? props.$stateColor : '#d0d7de'};
  background: ${props => props.$active ? props.$stateColor + '15' : 'white'};
  color: ${props => props.$active ? props.$stateColor : '#656d76'};
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  pointer-events: auto;
  z-index: 10;
  position: relative;
  
  &:hover {
    border-color: ${props => props.$stateColor};
    background: ${props => props.$stateColor + '10'};
    color: ${props => props.$stateColor};
  }
  
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.$active ? props.$stateColor : '#d0d7de'};
  }
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
  // Add form removed - teams are auto-discovered
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
  // Status filter state - default to show only open PRs (draft PRs have state=open)
  const [statusFilter, setStatusFilter] = useState<Set<PRState>>(new Set([PRState.OPEN]));
  // Separate filter for draft status - default to exclude drafts
  const [includeDrafts, setIncludeDrafts] = useState(false);
  // PR Status filter (needs_review, etc.) - default to show needs_review PRs
  const [prStatusFilter, setPrStatusFilter] = useState<Set<string>>(new Set(['needs_review']));
  // Author filter state - empty set means show all authors
  const [authorFilter, setAuthorFilter] = useState<Set<string>>(new Set());
  
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

  // Removed repository hooks - using teams only

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
    
    isAuthenticated,
    
    // Handle team PR updates with notifications
    useCallback(async (data: any) => {
      const { team, update_type, pull_request } = data;
      console.log('🔔 Received team PR update:', { team, update_type, pr: pull_request.number });

      // Check if this PR is truly new by comparing against what the frontend knows
      const teamKey = team;
      const existingPRs = allTeamPullRequests[teamKey] || [];
      const prExists = existingPRs.some((pr: any) => pr.id === pull_request.id);
      
      if (!prExists && (pull_request.user_is_assigned || pull_request.user_is_requested_reviewer)) {
        console.log('📢 TRULY NEW team PR detected, sending notification:', pull_request.number);
        const { NotificationService } = await import('./services/notifications');
        
        if (pull_request.user_is_assigned) {
          await NotificationService.notifyNewAssignment(pull_request);
        } else if (pull_request.user_is_requested_reviewer) {
          await NotificationService.notifyNewReviewRequest(pull_request);
        }
      } else if (prExists) {
        console.log('🔕 PR already exists in frontend, skipping notification:', pull_request.number);
      } else {
        console.log('🔕 PR does not require user attention, skipping notification:', pull_request.number);
      }
      
      // Update team PR data if we're tracking this team
      if (allTeamPullRequests[teamKey]) {
        const existingPRs = allTeamPullRequests[teamKey];
        const prIndex = existingPRs.findIndex((pr: any) => pr.id === pull_request.id);
        
        if (update_type === 'closed') {
          // Remove closed PRs
          if (prIndex >= 0) {
            const newPRs = [...existingPRs];
            newPRs.splice(prIndex, 1);
            setAllTeamPullRequests(prev => ({
              ...prev,
              [teamKey]: newPRs
            }));
          }
        } else {
          // Add or update PR
          if (prIndex >= 0) {
            const newPRs = [...existingPRs];
            newPRs[prIndex] = pull_request;
            setAllTeamPullRequests(prev => ({
              ...prev,
              [teamKey]: newPRs
            }));
          } else if (update_type === 'new_pr') {
            setAllTeamPullRequests(prev => ({
              ...prev,
              [teamKey]: [...existingPRs, pull_request]
            }));
          }
        }
      }
    }, [allTeamPullRequests])
  );

  // Track when initial data is loaded after authentication
  useEffect(() => {
    if (isAuthenticated && !initialDataLoaded) {
      // Mark as loaded when teams data is loaded
      if (!teamsLoading && teams.length > 0) {
        setInitialDataLoaded(true);
      }
    }
  }, [isAuthenticated, initialDataLoaded, teamsLoading, teams.length]);

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

  // Repository polling removed - teams only

  // Load user-relevant PRs for notifications on app start and when teams change
  useEffect(() => {
    if (teams.length > 0 && !teamsLoading) {
      fetchUserRelevantPullRequests();
    }
  }, [teams, teamsLoading, fetchUserRelevantPullRequests]);

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
    console.log('🔍 Checking for new PRs via polling. Current:', userRelevantPRs.length, 'Previous:', previousUserPRs.length);
    
    if (userRelevantPRs.length === 0) return;

    // Skip on first load to avoid notifications for existing PRs
    if (previousUserPRs.length === 0) {
      console.log('📋 First load - setting initial PR list without notifications');
      setPreviousUserPRs(userRelevantPRs);
      return;
    }

    const newPRs = userRelevantPRs.filter(currentPR => 
      !previousUserPRs.some(prevPR => prevPR.id === currentPR.id)
    );
    console.log(userRelevantPRs)
    
    console.log('🆕 Found new PRs:', newPRs.map(pr => ({id: pr.id, number: pr.number, title: pr.title, repo: pr.repository?.full_name})));

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
    if (newPRs.length > 0) {
      console.log('🔔 Polling detected new PRs, sending notifications:', newPRs.map(pr => ({id: pr.id, number: pr.number, title: pr.title})));
    }
    newPRs.forEach(async (pr) => {
      const { NotificationService } = await import('./services/notifications');
      if (pr.user_is_assigned) {
        console.log('📢 Sending new assignment notification for PR:', pr.number);
        await NotificationService.notifyNewAssignment(pr);
      } else if (pr.user_is_requested_reviewer) {
        console.log('📢 Sending new review request notification for PR:', pr.number);
        await NotificationService.notifyNewReviewRequest(pr);
      }
    });

    // Send notifications for updated PRs
    updatedPRs.forEach(async (pr) => {
      const { NotificationService } = await import('./services/notifications');
      const prevPR = previousUserPRs.find(prev => prev.id === pr.id);
      if (!prevPR) return;

      if (!prevPR.user_is_assigned && pr.user_is_assigned) {
        console.log('📢 Sending new assignment notification for PR:', pr.number);
        await NotificationService.notifyNewAssignment(pr);
      } else if (!prevPR.user_is_requested_reviewer && pr.user_is_requested_reviewer) {
        console.log('📢 Sending new review request notification for PR:', pr.number);
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
          
          setAllTeamPullRequests(prev => {
            const newPRs = data.pull_requests || [];
            const existingPRs = prev[teamKey] || [];
            
            // Only update if data has actually changed
            if (JSON.stringify(existingPRs) === JSON.stringify(newPRs)) {
              return prev;
            }
            
            return {
              ...prev,
              [teamKey]: newPRs
            };
          });
        })
        .catch(error => {
          console.error('Failed to fetch team PRs:', error);
        });
    });
  }, [teams, isAuthenticated, allTeamPullRequests]);

  // Repository subscription removed - teams only

  // Team subscription removed - teams are auto-discovered

  // Repository removal removed - teams only

  const handleRepositoryClick = useCallback(async (nodeId: string, repositoryName: string) => {
    // Repository clicking still supported for viewing PRs from teams
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
    
    // Check if we have PR data for this repository from teams
    const hasPRData = Object.values(allTeamPullRequests).some(teamPRs => 
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
    }
  }, [expandedRepositoryNodes, allPullRequests, allTeamPullRequests, addPullRequest, toggleRepositoryExpansion]);

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

  // Get all unique PRs from both repositories and teams, filtered by date range
  const allPRs = useMemo(() => {
    const repoPRs = Object.values(allPullRequests).flat();
    const teamPRs = Object.values(allTeamPullRequests).flat();
    const allPRsArray = [...repoPRs, ...teamPRs];
    
    // First filter by date range
    const dateFilteredPRs = allPRsArray.filter(pr => {
      const prDate = new Date(pr.created_at);
      const afterStart = !dateFilter.startDate || prDate >= dateFilter.startDate;
      const beforeEnd = !dateFilter.endDate || prDate <= dateFilter.endDate;
      return afterStart && beforeEnd;
    });
    
    // Then deduplicate by repository + PR number
    const uniquePRsMap = new Map();
    dateFilteredPRs.forEach(pr => {
      const key = `${pr.repository.full_name}#${pr.number}`;
      if (!uniquePRsMap.has(key)) {
        uniquePRsMap.set(key, pr);
      }
    });
    
    return Array.from(uniquePRsMap.values());
  }, [allPullRequests, allTeamPullRequests, dateFilter]);

  // For direct repository subscriptions (currently unused since you only have team subscriptions)
  const filteredPullRequests = useMemo(() => {
    // Since you only use team subscriptions, just return empty object
    return {};
  }, []);

  // Filter team PRs based on date, status, and author filters
  const filteredTeamPullRequests = useMemo(() => {
    console.log('🧮 Computing filteredTeamPullRequests with filters:', {
      statusFilter: Array.from(statusFilter),
      includeDrafts,
      authorFilter: Array.from(authorFilter),
      totalTeamPRsCount: Object.values(allTeamPullRequests).flat().length
    });
    
    const filtered: Record<string, any[]> = {};
    Object.entries(allTeamPullRequests).forEach(([team, prs]) => {
      // First deduplicate PRs by repository + PR number to prevent duplicate React keys
      const uniquePRs = prs.filter((pr, index, array) => {
        const firstIndex = array.findIndex(p => 
          p.repository.full_name === pr.repository.full_name && 
          p.number === pr.number
        );
        if (firstIndex !== index) {
          console.log(`🔄 Removing duplicate PR: ${pr.repository.full_name}#${pr.number} (keeping first occurrence)`);
        }
        return firstIndex === index;
      });
      
      const filteredPRs = uniquePRs.filter(pr => {
        // Date filter
        const prDate = new Date(pr.created_at);
        const afterStart = !dateFilter.startDate || prDate >= dateFilter.startDate;
        const beforeEnd = !dateFilter.endDate || prDate <= dateFilter.endDate;
        const passesDateFilter = afterStart && beforeEnd;
        
        // Status and PR Status filtering logic
        const isDraft = pr.state === PRState.OPEN && pr.draft;
        
        // Draft filter (only applies to open draft PRs)
        const passesDraftFilter = !isDraft || includeDrafts;
        
        // Combined state and status filter logic - must match at least one active filter
        const hasStateFilter = statusFilter.size > 0;
        const hasPrStatusFilter = prStatusFilter.size > 0;
        
        let passesStateOrStatusFilter = false;
        
        if (hasStateFilter || hasPrStatusFilter) {
          const passesStateFilter = isDraft ? true : statusFilter.has(pr.state);
          const passesPrStatusFilter = prStatusFilter.has(pr.status);
          
          if (hasStateFilter && hasPrStatusFilter) {
            // If both filters are active, PR must match at least one
            passesStateOrStatusFilter = passesStateFilter || passesPrStatusFilter;
          } else if (hasStateFilter) {
            // Only state filter active
            passesStateOrStatusFilter = passesStateFilter;
          } else {
            // Only PR status filter active
            passesStateOrStatusFilter = passesPrStatusFilter;
          }
        }
        // If no filters active, don't show anything (passesStateOrStatusFilter stays false)
        
        // Author filter (empty set means show all authors)
        const passesAuthorFilter = authorFilter.size === 0 || (pr.user && authorFilter.has(pr.user.login));
        
        return passesDateFilter && passesStateOrStatusFilter && passesDraftFilter && passesAuthorFilter;
      });
      // Always include the team, even if no PRs pass the filters (empty array)
      filtered[team] = filteredPRs;
    });
    
    console.log('🧮 Filtered team result:', {
      teamsWithPRs: Object.keys(filtered).length,
      totalFilteredTeamPRs: Object.values(filtered).flat().length
    });
    
    return filtered;
  }, [allTeamPullRequests, dateFilter, statusFilter, includeDrafts, prStatusFilter, authorFilter]);

  // Compute status counts from PRs that would be visible as nodes in the mind map
  const statusCounts = useMemo(() => {
    const visiblePRs = new Map();
    
    // Only count PRs from expanded repository nodes (same logic as visiblePRNodeCount)
    expandedRepositoryNodes.forEach(nodeId => {
      // For team repositories (format: "teamkey-repo-reponame")
      if (nodeId.includes('-repo-')) {
        const parts = nodeId.split('-repo-');
        const teamKey = parts[0];
        const repoName = parts[1];
        
        const teamPRs = filteredTeamPullRequests[teamKey] || [];
        teamPRs.forEach(pr => {
          if (pr.repository.full_name === repoName) {
            const key = `${pr.repository.full_name}#${pr.number}`;
            if (!visiblePRs.has(key)) {
              visiblePRs.set(key, pr);
            }
          }
        });
      }
      // For direct repositories (format: "repo-<repoName>")  
      else if (nodeId.startsWith('repo-')) {
        const repoName = nodeId.substring(5);
        // Find PRs for this repository in filteredTeamPullRequests
        Object.values(filteredTeamPullRequests).forEach(teamPRs => {
          teamPRs.forEach(pr => {
            if (pr.repository.full_name === repoName) {
              const key = `${pr.repository.full_name}#${pr.number}`;
              if (!visiblePRs.has(key)) {
                visiblePRs.set(key, pr);
              }
            }
          });
        });
      }
    });
    
    // Get the visible PRs as an array
    const visiblePRsArray = Array.from(visiblePRs.values());
    
    // Count by status, excluding drafts from open count
    const counts: Record<string, number> = {};
    Object.values(PRState).forEach(state => {
      if (state === PRState.OPEN) {
        // Open count should exclude draft PRs
        counts[state] = visiblePRsArray.filter(pr => pr.state === state && !pr.draft).length;
      } else {
        counts[state] = visiblePRsArray.filter(pr => pr.state === state).length;
      }
    });
    
    // Count drafts separately (only from OPEN PRs)
    counts.drafts = visiblePRsArray.filter(pr => pr.state === PRState.OPEN && pr.draft).length;
    
    // Count needs review PRs
    counts.needs_review = visiblePRsArray.filter(pr => pr.status === 'needs_review').length;
    
    return counts;
  }, [expandedRepositoryNodes, filteredTeamPullRequests]);

  // Count PRs that would be visible as nodes in the mind map (only when repository nodes are expanded)
  const visiblePRNodeCount = useMemo(() => {
    const visiblePRs = new Map();
    
    // Only count PRs from expanded repository nodes (not just expanded teams)
    // PR nodes are only shown when their repository node is expanded
    expandedRepositoryNodes.forEach(nodeId => {
      // For team repositories (format: "teamkey-repo-reponame")
      if (nodeId.includes('-repo-')) {
        const parts = nodeId.split('-repo-');
        const teamKey = parts[0];
        const repoName = parts[1];
        
        const teamPRs = filteredTeamPullRequests[teamKey] || [];
        teamPRs.forEach(pr => {
          if (pr.repository.full_name === repoName) {
            const key = `${pr.repository.full_name}#${pr.number}`;
            if (!visiblePRs.has(key)) {
              visiblePRs.set(key, pr);
            }
          }
        });
      }
      // For direct repositories (format: "repo-<repoName>")  
      else if (nodeId.startsWith('repo-')) {
        const repoName = nodeId.substring(5);
        // Find PRs for this repository in filteredTeamPullRequests or direct repo PRs
        Object.values(filteredTeamPullRequests).forEach(teamPRs => {
          teamPRs.forEach(pr => {
            if (pr.repository.full_name === repoName) {
              const key = `${pr.repository.full_name}#${pr.number}`;
              if (!visiblePRs.has(key)) {
                visiblePRs.set(key, pr);
              }
            }
          });
        });
      }
    });
    
    return visiblePRs.size;
  }, [expandedRepositoryNodes, filteredTeamPullRequests]);

  // Since you only use team subscriptions, no direct repository subscriptions to show
  const visibleRepositories = useMemo(() => {
    return [];
  }, []);

  // Create teams with filtered PR counts based on date filter
  const teamsWithFilteredCounts = useMemo(() => {
    // First deduplicate teams by organization/team_name to prevent React key conflicts
    const uniqueTeams = teams.filter((team, index, array) => 
      array.findIndex(t => t.organization === team.organization && t.team_name === team.team_name) === index
    );
    
    const processedTeams = uniqueTeams.map(team => {
      const teamKey = `${team.organization}/${team.team_name}`;
      const teamPRs = filteredTeamPullRequests[teamKey];
      
      console.log(`Team ${teamKey}: original count=${team.total_open_prs}, has fetched PRs=${!!teamPRs}, filtered count=${teamPRs?.length || 0}`);
      
      // If we have fetched PRs for this team, use the filtered count (even if 0)
      // Otherwise, return the team with a flag indicating we need to fetch PRs
      if (teamPRs !== undefined) {
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
    
    // Note: Team filtering by content is now handled in ReactFlowMindMap based on actual PR data
    return processedTeams;
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
  if (isAuthenticated && !initialDataLoaded && teamsLoading) {
    return (
      <>
        <GlobalStyle />
        <AppContainer style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>Loading your data...</div>
            <div style={{ color: '#586069' }}>Fetching teams</div>
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
                filteredPullRequests={Object.values(filteredTeamPullRequests).flat()}
                visiblePRCount={visiblePRNodeCount}
                onDateChange={(startDate, endDate) => {
                  setDateFilter({ startDate, endDate });
                  // Let ReactFlowMindMap handle intelligent updates - don't reset expanded states
                }}
              />
              
              {/* Author Filter */}
              <AuthorFilter
                pullRequests={allPRs}
                filteredPullRequests={Object.values(filteredTeamPullRequests).flat()}
                visiblePRCount={visiblePRNodeCount}
                onAuthorsChange={(selectedAuthors) => {
                  console.log('🎯 Author filter changed:', Array.from(selectedAuthors));
                  setAuthorFilter(selectedAuthors);
                  // Let ReactFlowMindMap handle intelligent updates - don't reset expanded states
                }}
              />
              
              {/* Status Filter */}
              <StatusFilterContainer>
                <StatusFilterTitle>PR Status</StatusFilterTitle>
                <StatusFilterButtons>
                  {Object.values(PRState).map(state => {
                    const isActive = statusFilter.has(state);
                    const color = PR_STATE_COLORS[state];
                    const count = statusCounts[state] || 0;
                    
                    return (
                      <StatusFilterButton
                        key={state}
                        $active={isActive}
                        $stateColor={color}
                        onMouseDown={() => console.log(`🔥 MOUSE DOWN on ${state} button`)}
                        onMouseUp={() => console.log(`🔥 MOUSE UP on ${state} button`)}
                        onClick={(e) => {
                          console.log(`🔥 CLICK EVENT on ${state} button`, e);
                          console.log(`🎯 Clicked ${state} filter button, currently active: ${isActive}`);
                          e.preventDefault();
                          e.stopPropagation();
                          setStatusFilter(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(state)) {
                              newSet.delete(state);
                              console.log(`🎯 Removed ${state} from filter`);
                            } else {
                              newSet.add(state);
                              console.log(`🎯 Added ${state} to filter`);
                            }
                            console.log(`🎯 New filter set:`, Array.from(newSet));
                            return newSet;
                          });
                          // Let ReactFlowMindMap handle intelligent updates - don't reset expanded states
                        }}
                      >
                        {state} ({count})
                      </StatusFilterButton>
                    );
                  })}
                  
                  {/* Draft Filter Toggle */}
                  <StatusFilterButton
                    $active={includeDrafts}
                    $stateColor="#6b7280"
                    onClick={() => {
                      console.log(`🎯 Clicked drafts filter button, currently active: ${includeDrafts}`);
                      setIncludeDrafts(!includeDrafts);
                      console.log(`🎯 Set includeDrafts to: ${!includeDrafts}`);
                      // Let ReactFlowMindMap handle intelligent updates - don't reset expanded states
                    }}
                  >
                    drafts ({statusCounts.drafts || 0})
                  </StatusFilterButton>
                  
                  {/* Needs Review Filter Button */}
                  <StatusFilterButton
                    $active={prStatusFilter.has('needs_review')}
                    $stateColor="#f1c21b"
                    onClick={() => {
                      console.log('🎯 Clicked needs review filter button');
                      setPrStatusFilter(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has('needs_review')) {
                          newSet.delete('needs_review');
                          console.log('🎯 Removed needs_review from filter');
                        } else {
                          newSet.add('needs_review');
                          console.log('🎯 Added needs_review to filter');
                        }
                        console.log('🎯 New PR status filter set:', Array.from(newSet));
                        return newSet;
                      });
                    }}
                  >
                    needs review ({statusCounts.needs_review || 0})
                  </StatusFilterButton>
                </StatusFilterButtons>
                <PRCount>
                  Showing <strong>{visiblePRNodeCount}</strong> of <strong>{allPRs.length}</strong> PRs
                </PRCount>
              </StatusFilterContainer>
            </>
          )}
          
          {/* Subscriptions Section */}
          <SectionTitle>Subscriptions</SectionTitle>
          
          {teamsError && (
            <ErrorMessage>
              {teamsError}
            </ErrorMessage>
          )}
          
          {teamsLoading && teams.length === 0 ? (
            <EmptyState>
              <h3>Loading subscriptions...</h3>
              <p>Fetching your subscribed teams from GitHub.</p>
            </EmptyState>
          ) : (
            <SubscriptionList
              repositories={[]}
              teams={teamsWithFilteredCounts}
              onRemoveTeam={unsubscribeFromTeam}
              onRefreshTeam={refreshTeam}
              loading={teamsLoading}
            />
          )}
          
          {/* Add button removed - teams are auto-discovered */}
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
              teamsLoading && teams.length === 0 ? (
                <EmptyState>
                  <h3>Loading...</h3>
                  <p>Setting up your teams dashboard.</p>
                </EmptyState>
              ) : teamsWithFilteredCounts.length > 0 ? (
                <ReactFlowMindMap
                  key={`mindmap-${dateFilter.startDate?.getTime() || 0}-${dateFilter.endDate?.getTime() || 0}-${Array.from(statusFilter).sort().join(',')}-${includeDrafts}-${Array.from(prStatusFilter).sort().join(',')}-${Array.from(authorFilter).sort().join(',')}`}
                  repositories={[]}
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
                  <p>Teams are automatically discovered from your GitHub account. If you don't see any teams, make sure you're a member of GitHub teams in your organizations.</p>
                </EmptyState>
              )
            ) : (
              expandedRepositories.size > 0 && (
                <PRDirectedGraph
                  pullRequests={Object.values(filteredTeamPullRequests).flat()}
                  repositoryName={Array.from(expandedRepositories)[0]}
                  onPRClick={handlePRClick}
                />
              )
            )}
          </ContentArea>
        </Main>

        {/* AddSubscriptionForm removed - teams are auto-discovered */}
      </AppContainer>
    </>
  );
}

export default App;
