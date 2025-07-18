import React from 'react';
import styled from 'styled-components';
import { Trash2, RefreshCw, ExternalLink, GitBranch, Eye, Users, UserCheck } from 'lucide-react';
import { TeamStats, SubscriptionType } from '../../types';

interface SubscriptionListProps {
  repositories: any[]; // Empty array - no direct repository subscriptions
  teams: TeamStats[];
  onRemoveTeam: (organization: string, teamName: string) => Promise<void>;
  onRefreshTeam: (organization: string, teamName: string) => Promise<void>;
  loading?: boolean;
  className?: string;
}

const Container = styled.div`
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 600px; /* Limit height to ensure scrollability */
`;

const Header = styled.div`
  padding: 16px;
  background: #f6f8fa;
  border-bottom: 1px solid #e1e4e8;
  font-weight: 600;
  color: #24292e;
  font-size: 16px;
  flex-shrink: 0; /* Prevent header from shrinking */
`;

const ScrollableContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
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

const SubscriptionItem = styled.div`
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

const SubscriptionHeader = styled.div`
  display: flex;
  justify-content: between;
  align-items: center;
  margin-bottom: 8px;
`;

const SubscriptionName = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
`;

const SubscriptionTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0969da;
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
`;

const SubscriptionMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
`;

const TypeBadge = styled.span<{ $type: SubscriptionType }>`
  background: ${props => props.$type === 'repository' ? '#dbeafe' : '#f0fdf4'};
  color: ${props => props.$type === 'repository' ? '#1e40af' : '#166534'};
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid ${props => props.$type === 'repository' ? '#93c5fd' : '#a7f3d0'};
`;

const SubscriptionDescription = styled.p`
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

export const SubscriptionList: React.FC<SubscriptionListProps> = ({
  repositories,
  teams,
  onRemoveTeam,
  onRefreshTeam,
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

  const totalCount = teams.length;

  if (totalCount === 0) {
    return (
      <Container className={className}>
        <Header>Subscriptions</Header>
        <EmptyState>
          <EmptyStateIcon>
            <GitBranch size={48} />
          </EmptyStateIcon>
          <h3>No subscriptions</h3>
          <p>Add teams to start monitoring pull requests.</p>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container className={className}>
      <Header>
        Subscriptions ({totalCount})
      </Header>
      
      <ScrollableContent>
        {/* Repository Subscriptions */}
        {/* Repository subscriptions removed - teams only */}

      {/* Team Subscriptions */}
      {teams.map(team => (
        <SubscriptionItem key={`team-${team.organization}-${team.team_name}`}>
          <SubscriptionHeader>
            <SubscriptionName>
              <UserCheck size={16} />
              <div>
                <SubscriptionMeta>
                  <SubscriptionTitle>
                    {team.organization}/{team.team_name}
                  </SubscriptionTitle>
                  <TypeBadge $type="team">Team</TypeBadge>
                </SubscriptionMeta>
              </div>
            </SubscriptionName>
            
            <ActionButtons>
              <ActionButton
                onClick={() => onRefreshTeam(team.organization, team.team_name)}
                disabled={loading}
                title="Refresh team data"
              >
                <RefreshCw size={14} />
                Refresh
              </ActionButton>
              
              <ActionButton
                as="a"
                href={`https://github.com/orgs/${team.organization}/teams/${team.team_name}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open team in GitHub"
              >
                <ExternalLink size={14} />
              </ActionButton>
              
              <ActionButton
                variant="danger"
                onClick={() => onRemoveTeam(team.organization, team.team_name)}
                disabled={loading}
                title="Unsubscribe from team"
              >
                <Trash2 size={14} />
              </ActionButton>
            </ActionButtons>
          </SubscriptionHeader>
          
          <StatsContainer>
            <StatItem>
              <GitBranch size={14} />
              <StatNumber>{team.total_open_prs}</StatNumber>
              team PRs
            </StatItem>
            
            <StatItem>
              <Eye size={14} />
              <StatNumber>{team.review_requests}</StatNumber>
              review requests
            </StatItem>
            
            <StatItem>
              <Users size={14} />
              <StatNumber>{team.assigned_to_user}</StatNumber>
              assigned to you
            </StatItem>
          </StatsContainer>
          
          <LastUpdated>
            Last updated: {formatTime(team.last_updated)}
          </LastUpdated>
        </SubscriptionItem>
      ))}
      </ScrollableContent>
    </Container>
  );
};