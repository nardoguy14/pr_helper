import React from 'react';
import styled from 'styled-components';
import { Bell, GitPullRequest } from 'lucide-react';
import { PullRequest } from '../../types';

interface NotificationsPanelProps {
  userRelevantPRs: PullRequest[];
  onPRClick?: (pr: PullRequest) => void;
}

const NotificationsContainer = styled.div`
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  margin-bottom: 24px;
  overflow: hidden;
`;

const NotificationsHeader = styled.div`
  padding: 16px;
  background: #f6f8fa;
  border-bottom: 1px solid #e1e4e8;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const NotificationsTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #24292e;
  flex: 1;
`;

const NotificationCount = styled.span`
  background: #d73a49;
  color: white;
  font-size: 12px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
`;

const NotificationsList = styled.div`
  max-height: 200px;
  overflow-y: auto;
`;

const NotificationItem = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #f6f8fa;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  &:hover {
    background: #f6f8fa;
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const NotificationContent = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const NotificationIcon = styled.div`
  flex-shrink: 0;
  color: #d73a49;
  margin-top: 2px;
`;

const NotificationDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const NotificationTitle = styled.div`
  font-weight: 500;
  font-size: 14px;
  color: #24292e;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const TimeAgo = styled.span`
  font-size: 12px;
  color: #586069;
  font-weight: normal;
  flex-shrink: 0;
`;

const NotificationMeta = styled.div`
  font-size: 12px;
  color: #586069;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RepositoryName = styled.span`
  font-weight: 500;
`;

const EmptyState = styled.div`
  padding: 24px 16px;
  text-align: center;
  color: #586069;
  font-size: 14px;
`;

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  userRelevantPRs,
  onPRClick
}) => {
  // User-relevant PRs are already filtered by the backend/hook
  // They include: assigned PRs, review requests, and PRs needing review
  const reviewPRs = userRelevantPRs;

  const handlePRClick = (pr: PullRequest) => {
    if (onPRClick) {
      onPRClick(pr);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <NotificationsContainer>
      <NotificationsHeader>
        <Bell size={16} />
        <NotificationsTitle>Review Requests</NotificationsTitle>
      </NotificationsHeader>
      
      <NotificationsList>
        {reviewPRs.length === 0 ? (
          <EmptyState>
            🎉 All caught up! No PRs waiting for your review.
          </EmptyState>
        ) : (
          reviewPRs.map((pr) => (
            <NotificationItem
              key={`${pr.repository.full_name}-${pr.number}`}
              onClick={() => handlePRClick(pr)}
            >
              <NotificationContent>
                <NotificationIcon>
                  <GitPullRequest size={16} />
                </NotificationIcon>
                <NotificationDetails>
                  <NotificationTitle>
                    <span>#{pr.number}: {pr.title}</span>
                    <TimeAgo>{formatTimeAgo(pr.created_at)}</TimeAgo>
                  </NotificationTitle>
                  <NotificationMeta>
                    <RepositoryName>{pr.repository.full_name}</RepositoryName>
                    <span>•</span>
                    <span>by {pr.user.login}</span>
                  </NotificationMeta>
                </NotificationDetails>
              </NotificationContent>
            </NotificationItem>
          ))
        )}
      </NotificationsList>
    </NotificationsContainer>
  );
};