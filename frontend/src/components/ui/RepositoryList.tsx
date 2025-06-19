import React from 'react';
import styled from 'styled-components';
import { Trash2, RefreshCw, ExternalLink, GitBranch, Eye, Users } from 'lucide-react';
import { RepositoryStats } from '../../types';

interface RepositoryListProps {
  repositories: RepositoryStats[];
  onRemove: (repositoryName: string) => Promise<void>;
  onRefresh: (repositoryName: string) => Promise<void>;
  loading?: boolean;
  className?: string;
}

const Container = styled.div`
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 16px;
  background: #f6f8fa;
  border-bottom: 1px solid #e1e4e8;
  font-weight: 600;
  color: #24292e;
  font-size: 16px;
`;

const EmptyState = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: #656d76;
`;

const EmptyStateIcon = styled.div`
  margin-bottom: 16px;
  color: #8c959f;
`;

const RepositoryItem = styled.div`
  padding: 16px;
  border-bottom: 1px solid #e1e4e8;
  transition: background-color 0.2s ease;
  
  &:hover {
    background: #f6f8fa;
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const RepositoryHeader = styled.div`
  display: flex;
  justify-content: between;
  align-items: center;
  margin-bottom: 8px;
`;

const RepositoryName = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
`;

const RepositoryTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0969da;
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
`;

const RepositoryDescription = styled.p`
  margin: 4px 0 0 0;
  font-size: 14px;
  color: #656d76;
  line-height: 1.4;
`;

const StatsContainer = styled.div`
  display: flex;
  gap: 16px;
  margin-top: 12px;
  flex-wrap: wrap;
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #656d76;
`;

const StatNumber = styled.span`
  font-weight: 600;
  color: #24292e;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
  margin-left: auto;
`;

const ActionButton = styled.button<{ variant?: 'danger' | 'default' }>`
  background: none;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  color: #656d76;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  
  &:hover:not(:disabled) {
    ${props => props.variant === 'danger' ? `
      background: #fff5f5;
      border-color: #feb2b2;
      color: #c53030;
    ` : `
      background: #f6f8fa;
      border-color: #d0d7de;
      color: #24292e;
    `}
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LastUpdated = styled.div`
  font-size: 12px;
  color: #8c959f;
  margin-top: 8px;
`;

const PrivateBadge = styled.span`
  background: #fff8e1;
  color: #f57c00;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 12px;
  border: 1px solid #ffcc02;
`;

export const RepositoryList: React.FC<RepositoryListProps> = ({
  repositories,
  onRemove,
  onRefresh,
  loading = false,
  className
}) => {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    
    return date.toLocaleDateString();
  };

  if (repositories.length === 0) {
    return (
      <Container className={className}>
        <Header>Subscribed Repositories</Header>
        <EmptyState>
          <EmptyStateIcon>
            <GitBranch size={48} />
          </EmptyStateIcon>
          <h3>No repositories subscribed</h3>
          <p>Add a repository to start monitoring pull requests.</p>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container className={className}>
      <Header>
        Subscribed Repositories ({repositories.length})
      </Header>
      
      {repositories.map(repo => (
        <RepositoryItem key={repo.repository.full_name}>
          <RepositoryHeader>
            <RepositoryName>
              <GitBranch size={16} />
              <div>
                <RepositoryTitle
                  as="a"
                  href={repo.repository.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {repo.repository.full_name}
                </RepositoryTitle>
                {repo.repository.private && <PrivateBadge>Private</PrivateBadge>}
                {repo.repository.description && (
                  <RepositoryDescription>
                    {repo.repository.description}
                  </RepositoryDescription>
                )}
              </div>
            </RepositoryName>
            
            <ActionButtons>
              <ActionButton
                onClick={() => onRefresh(repo.repository.full_name)}
                disabled={loading}
                title="Refresh repository data"
              >
                <RefreshCw size={14} />
                Refresh
              </ActionButton>
              
              <ActionButton
                as="a"
                href={repo.repository.html_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in GitHub"
              >
                <ExternalLink size={14} />
              </ActionButton>
              
              <ActionButton
                variant="danger"
                onClick={() => onRemove(repo.repository.full_name)}
                disabled={loading}
                title="Unsubscribe from repository"
              >
                <Trash2 size={14} />
              </ActionButton>
            </ActionButtons>
          </RepositoryHeader>
          
          <StatsContainer>
            <StatItem>
              <GitBranch size={14} />
              <StatNumber>{repo.total_open_prs}</StatNumber>
              open PRs
            </StatItem>
            
            <StatItem>
              <Eye size={14} />
              <StatNumber>{repo.review_requests}</StatNumber>
              review requests
            </StatItem>
            
            <StatItem>
              <Users size={14} />
              <StatNumber>{repo.assigned_to_user}</StatNumber>
              assigned to you
            </StatItem>
            
            {repo.code_owner_prs > 0 && (
              <StatItem>
                <Users size={14} />
                <StatNumber>{repo.code_owner_prs}</StatNumber>
                code owner PRs
              </StatItem>
            )}
          </StatsContainer>
          
          <LastUpdated>
            Last updated: {formatTime(repo.last_updated)}
          </LastUpdated>
        </RepositoryItem>
      ))}
    </Container>
  );
};