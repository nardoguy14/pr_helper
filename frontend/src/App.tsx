import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { Plus, ArrowLeft, ChevronLeft, ChevronRight, Bell } from 'lucide-react';

import { ReactFlowMindMap } from './components/visualization/ReactFlowMindMap';
import { PRDirectedGraph } from './components/visualization/PRDirectedGraph';
import { AddSubscriptionForm } from './components/ui/AddSubscriptionForm';
import { SubscriptionList } from './components/ui/SubscriptionList';
import { ConnectionStatus } from './components/ui/ConnectionStatus';
import { NotificationsPanel as NotificationsPanelComponent } from './components/ui/NotificationsPanel';

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

function App() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentView, setCurrentView] = useState<'mindmap' | 'pr-graph'>('mindmap');
  const [repositoriesCollapsed, setRepositoriesCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [allTeamPullRequests, setAllTeamPullRequests] = useState<Record<string, any[]>>({});
  const [teamRepositories, setTeamRepositories] = useState<Record<string, string[]>>({});
  const [fetchingTeams, setFetchingTeams] = useState<Set<string>>(new Set());
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
    expandedRepositories,
    loading: prsLoading,
    error: prsError,
    fetchPullRequestsForRepository,
    fetchPullRequestsForAllRepositories,
    toggleRepositoryExpansion,
    updatePullRequest,
    addPullRequest,
    clearAllPullRequests,
    getPullRequestsForRepository
  } = usePullRequests();

  const { isConnected, error: wsError } = useWebSocket(
    // Handle PR updates
    useCallback((data: any) => {
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

  const handleRepositoryClick = useCallback(async (repositoryName: string) => {
    console.log('handleRepositoryClick called:', repositoryName);
    console.log('Current expandedRepositories before toggle:', Array.from(expandedRepositories));
    
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
      
      // Toggle expansion - this should work in React Flow
      console.log('Toggling repository expansion for:', repositoryName);
      toggleRepositoryExpansion(repositoryName);
      console.log('expandedRepositories will be updated to:', expandedRepositories.has(repositoryName) ? 'collapsed' : 'expanded');
    } else {
      // Fetch PR data if we don't have it
      try {
        await fetchPullRequestsForRepository(repositoryName);
        toggleRepositoryExpansion(repositoryName);
      } catch (error) {
        console.error('Failed to fetch pull requests:', error);
      }
    }
  }, [expandedRepositories, allPullRequests, allTeamPullRequests, addPullRequest, toggleRepositoryExpansion, fetchPullRequestsForRepository]);

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

  const handlePRClick = useCallback((pr: PullRequest) => {
    window.open(pr.html_url, '_blank');
  }, []);

  // Get PRs that need review from the current user
  const reviewPRs = Object.entries(allPullRequests).flatMap(([repoName, prs]) =>
    prs
      .filter(pr => 
        pr.user_is_requested_reviewer || 
        (pr.status === 'needs_review' && !pr.user_has_reviewed)
      )
      .map(pr => ({ ...pr, repositoryName: repoName }))
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
                  allPullRequests={allPullRequests}
                  onPRClick={handlePRClick}
                />
              </NotificationsDropdown>
            </NotificationsButton>
          </HeaderRight>
        </Header>

        <RepositoriesPanel $collapsed={repositoriesCollapsed}>
          <Button 
            $variant="primary" 
            onClick={() => setShowAddForm(true)}
            style={{ marginBottom: '8px' }}
          >
            <Plus size={16} />
            Add Subscription
          </Button>
          
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
              repositories={repositories}
              teams={teams}
              onRemoveRepository={handleRemoveRepository}
              onRefreshRepository={refreshRepository}
              onRemoveTeam={unsubscribeFromTeam}
              onRefreshTeam={refreshTeam}
              loading={reposLoading || teamsLoading}
            />
          )}
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
              ) : repositories.length > 0 || teams.length > 0 ? (
                <ReactFlowMindMap
                  repositories={repositories}
                  teams={teams}
                  onRepositoryClick={handleRepositoryClick}
                  onTeamClick={handleTeamClick}
                  onPRClick={handlePRClick}
                  expandedRepositories={expandedRepositories}
                  expandedTeams={expandedTeams}
                  allPullRequests={allPullRequests}
                  allTeamPullRequests={allTeamPullRequests}
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
                  pullRequests={Object.values(allPullRequests).flat()}
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
