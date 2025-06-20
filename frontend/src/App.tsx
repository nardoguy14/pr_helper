import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { Plus, ArrowLeft, ChevronLeft, ChevronRight, Bell } from 'lucide-react';

import { ReactFlowMindMap } from './components/visualization/ReactFlowMindMap';
import { PRDirectedGraph } from './components/visualization/PRDirectedGraph';
import { AddSubscriptionForm } from './components/ui/AddSubscriptionForm';
import { SubscriptionList } from './components/ui/SubscriptionList';
import { ConnectionStatus } from './components/ui/ConnectionStatus';
import { NotificationsPanel as NotificationsPanelComponent } from './components/ui/NotificationsPanel';
import { DateRangeFilter } from './components/ui/DateRangeFilter';

import { useWebSocket } from './hooks/useWebSocket';
import { useRepositories } from './hooks/useRepositories';
import { useTeams } from './hooks/useTeams';
import { usePullRequests } from './hooks/usePullRequests';

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [expandedRepositoryNodes, setExpandedRepositoryNodes] = useState<Set<string>>(new Set());
  const [allTeamPullRequests, setAllTeamPullRequests] = useState<Record<string, any[]>>({});
  const [teamRepositories, setTeamRepositories] = useState<Record<string, string[]>>({});
  const [fetchingTeams, setFetchingTeams] = useState<Set<string>>(new Set());
  // Initialize with last week
  const getDefaultDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    return { startDate, endDate };
  };
  
  const [dateFilter, setDateFilter] = useState<{ startDate: Date | null; endDate: Date | null }>(getDefaultDateRange());
  const notificationsRef = useRef<HTMLButtonElement>(null);

  // Hooks
  const {
    repositories,
    loading: reposLoading,
    error: reposError,
    subscribeToRepository,
    unsubscribeFromRepository,
    refreshRepository,
    updateRepositoryStats
  } = useRepositories();

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
  } = useTeams();

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
  } = usePullRequests();

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
    }, [updateRepositoryStats])
  );

  // Preload PR data for all repositories when they change
  useEffect(() => {
    if (repositories.length > 0 && !reposLoading) {
      const repositoryNames = repositories.map(repo => repo.repository.full_name);
      fetchPullRequestsForAllRepositories(repositoryNames);
    }
  }, [repositories, reposLoading, fetchPullRequestsForAllRepositories]);

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

  // Auto-fetch team PRs when teams load to get accurate counts
  useEffect(() => {
    if (teams.length === 0) return;
    
    // Fetch PRs for all teams to get accurate filtered counts
    teams.forEach(team => {
      const teamKey = `${team.organization}/${team.team_name}`;
      
      // Skip if already fetching or already have data
      if (fetchingTeams.has(teamKey) || allTeamPullRequests[teamKey]) return;
      
      console.log('Auto-fetching PRs for team:', teamKey);
      
      // Mark as fetching
      setFetchingTeams(prev => new Set(prev).add(teamKey));
      
      fetch(`http://localhost:8000/api/v1/teams/${team.organization}/${team.team_name}/pull-requests`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to fetch team PRs: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('Auto-fetched PRs for team:', teamKey, data.pull_requests?.length || 0);
          
          // Store the PRs
          setAllTeamPullRequests(prev => ({
            ...prev,
            [teamKey]: data.pull_requests || []
          }));
          
          // Extract and store repository names
          const repoNames = Array.from(new Set(data.pull_requests?.map((pr: any) => pr.repository.full_name) || [])) as string[];
          if (repoNames.length > 0) {
            setTeamRepositories(prev => ({
              ...prev,
              [teamKey]: repoNames
            }));
          }
        })
        .catch(error => {
          console.error('Failed to auto-fetch team PRs:', error);
        })
        .finally(() => {
          setFetchingTeams(prev => {
            const newSet = new Set(prev);
            newSet.delete(teamKey);
            return newSet;
          });
        });
    });
  }, [teams]); // Only trigger when teams load

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
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
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
    
    // Use a ref or state update to determine if we should expand or collapse
    let wasExpanded = false;
    setExpandedTeams(prev => {
      console.log('Current expandedTeams (from setter):', Array.from(prev));
      console.log('Checking if expanded:', teamKey);
      wasExpanded = prev.has(teamKey);
      console.log('wasExpanded:', wasExpanded);
      
      if (wasExpanded) {
        // If expanded, collapse it
        console.log('Collapsing team:', teamKey);
        const newSet = new Set(prev);
        newSet.delete(teamKey);
        return newSet;
      } else {
        // Don't change yet - we'll expand after fetching data
        return prev;
      }
    });
    
    // If it was expanded, we already collapsed it above, so return
    if (wasExpanded) {
      console.log('Team was collapsed, returning');
      return;
    }
    
    // Otherwise, expand the team
    console.log('Expanding team:', teamKey);
    
    // Fetch team repositories if we don't have them and not already fetching
    if (!teamRepositories[teamKey] && !fetchingTeams.has(teamKey)) {
        console.log('Fetching repositories for team:', teamKey);
        console.log('Making API call to GitHub...');
        
        // Mark as fetching to prevent concurrent requests
        setFetchingTeams(prev => new Set(prev).add(teamKey));
        
        try {
          const response = await fetch(`http://localhost:8000/api/v1/teams/${organization}/${teamName}/pull-requests`);
          
          // Check if we're rate limited
          if (response.status === 403 || response.status === 429) {
            console.error('GitHub API rate limit exceeded');
            alert('GitHub API rate limit exceeded. Please wait a few minutes and try again.');
            return;
          }
          
          if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          console.log('Team PRs fetched:', data.pull_requests?.length || 0, 'PRs');
          console.log('Raw API response:', data);
          
          // Extract unique repository names from the PRs
          let repoNames = Array.from(new Set(data.pull_requests?.map((pr: any) => pr.repository.full_name) || [])) as string[];
          console.log('Team repositories:', repoNames, 'from', data.pull_requests?.length || 0, 'PRs');
          
          
          // Store the repositories - but don't overwrite with empty data
          if (repoNames.length > 0) {
            setTeamRepositories(prev => {
              // Double-check we're not overwriting good data
              if (prev[teamKey] && prev[teamKey].length > 0 && repoNames.length === 0) {
                console.warn('Preventing overwrite of existing team data with empty data');
                return prev;
              }
              
              const newState: Record<string, string[]> = {
                ...prev,
                [teamKey]: repoNames
              };
              return newState;
            });
            
            // Also store the PRs for later use
            setAllTeamPullRequests(prev => ({
              ...prev,
              [teamKey]: data.pull_requests || []
            }));
          } else {
            console.warn('Received empty repository list for team', teamKey);
          }
          
          // Then expand the team
          setExpandedTeams(prev => {
            const newSet = new Set(prev);
            newSet.add(teamKey);
            console.log('Team expanded with repositories:', Array.from(newSet));
            return newSet;
          });
          
        } catch (error) {
          console.error('Failed to fetch team pull requests:', error);
        } finally {
          // Remove from fetching set
          setFetchingTeams(prev => {
            const newSet = new Set(prev);
            newSet.delete(teamKey);
            return newSet;
          });
        }
      } else if (fetchingTeams.has(teamKey)) {
        console.log('Already fetching team:', teamKey, '- skipping duplicate request');
      } else {
        console.log('Team repositories already cached:', teamRepositories[teamKey]?.length || 0, 'repos');
        console.log('NOT making API call - using cached data');
        // Repositories already exist, just expand
        setExpandedTeams(prev => {
          const newSet = new Set(prev);
          newSet.add(teamKey);
          return newSet;
        });
      }
  }, [teamRepositories, fetchingTeams, teams, allTeamPullRequests]); // Removed expandedTeams to avoid stale closure

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

  return (
    <>
      <GlobalStyle />
      <AppContainer>
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
