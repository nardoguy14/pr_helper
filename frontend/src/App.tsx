import React, { useState, useCallback, useEffect } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { Plus, ArrowLeft } from 'lucide-react';

import { ReactFlowMindMap } from './components/visualization/ReactFlowMindMap';
import { PRDirectedGraph } from './components/visualization/PRDirectedGraph';
import { AddRepositoryForm } from './components/ui/AddRepositoryForm';
import { RepositoryList } from './components/ui/RepositoryList';
import { ConnectionStatus } from './components/ui/ConnectionStatus';

import { useWebSocket } from './hooks/useWebSocket';
import { useRepositories } from './hooks/useRepositories';
import { usePullRequests } from './hooks/usePullRequests';

import { SubscribeRepositoryRequest, PullRequest } from './types';

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

const Main = styled.main`
  flex: 1;
  padding: 24px;
  display: flex;
  gap: 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
`;

const LeftPanel = styled.div`
  flex: 0 0 400px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const RightPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 600px;
`;

const ViewToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
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

  const handleAddRepository = async (request: SubscribeRepositoryRequest) => {
    try {
      await subscribeToRepository(request);
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add repository:', error);
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

  const handleRepositoryClick = async (repositoryName: string) => {
    // Since PR data is preloaded, we can just toggle expansion immediately
    toggleRepositoryExpansion(repositoryName);
    
    // If we somehow don't have PR data, fetch it as a fallback
    if (!allPullRequests[repositoryName]) {
      try {
        await fetchPullRequestsForRepository(repositoryName);
      } catch (error) {
        console.error('Failed to fetch pull requests:', error);
      }
    }
  };

  const handleBackToMindMap = () => {
    clearAllPullRequests();
    setCurrentView('mindmap');
  };

  const handlePRClick = (pr: PullRequest) => {
    window.open(pr.html_url, '_blank');
  };

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
            <Button 
              $variant="primary" 
              onClick={() => setShowAddForm(true)}
            >
              <Plus size={16} />
              Add Repository
            </Button>
          </HeaderRight>
        </Header>

        <Main>
          <LeftPanel>
            {reposError && (
              <ErrorMessage>
                {reposError}
              </ErrorMessage>
            )}
            
            {reposLoading && repositories.length === 0 ? (
              <EmptyState>
                <h3>Loading repositories...</h3>
                <p>Fetching your subscribed repositories from GitHub.</p>
              </EmptyState>
            ) : (
              <RepositoryList
                repositories={repositories}
                onRemove={handleRemoveRepository}
                onRefresh={refreshRepository}
                loading={reposLoading}
              />
            )}
          </LeftPanel>

          <RightPanel>
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
              ) : repositories.length > 0 ? (
                <ReactFlowMindMap
                  repositories={repositories}
                  onRepositoryClick={handleRepositoryClick}
                  onPRClick={handlePRClick}
                  expandedRepositories={expandedRepositories}
                  allPullRequests={allPullRequests}
                />
              ) : (
                <EmptyState>
                  <h3>Welcome to PR Monitor</h3>
                  <p>Add repositories to start monitoring pull requests in a visual mind map.</p>
                  <Button 
                    $variant="primary" 
                    onClick={() => setShowAddForm(true)}
                    style={{ marginTop: '16px' }}
                  >
                    <Plus size={16} />
                    Add Your First Repository
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
          </RightPanel>
        </Main>

        <AddRepositoryForm
          isVisible={showAddForm}
          onSubmit={handleAddRepository}
          onCancel={() => setShowAddForm(false)}
        />
      </AppContainer>
    </>
  );
}

export default App;
