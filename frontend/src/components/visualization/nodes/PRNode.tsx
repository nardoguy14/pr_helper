import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import styled from 'styled-components';
import { createPortal } from 'react-dom';
import { PullRequest } from '../../../types';

interface PRNodeData {
  pullRequest: PullRequest;
  onClick?: (pr: PullRequest) => void;
}

const NodeContainer = styled.div<{ $color: string }>`
  width: 90px;
  height: 90px;
  padding: 12px;
  background: ${props => props.$color};
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-sizing: border-box;
  position: relative;
  
  &:hover {
    transform: scale(1.15);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    z-index: 1000;
  }
`;

const PRNumber = styled.div<{ $textColor: string }>`
  font-weight: bold;
  font-size: 7px;
  color: ${props => props.$textColor};
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const PRTitle = styled.div<{ $textColor: string }>`
  font-size: 9px;
  color: ${props => props.$textColor};
  opacity: 0.9;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
  text-align: center;
`;

const TooltipContainer = styled.div<{ $visible: boolean; $x: number; $y: number }>`
  position: fixed;
  top: ${props => props.$y}px;
  left: ${props => props.$x}px;
  transform: translateX(-50%) translateY(-100%);
  margin-top: -10px;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 12px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.3;
  z-index: 999999;
  opacity: ${props => props.$visible ? 1 : 0};
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transition: opacity 0.2s ease, visibility 0.2s ease;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-width: 400px;
  
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.9);
  }
`;

const TooltipContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 200px;
`;

const TooltipRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TooltipLabel = styled.span`
  font-weight: 600;
  color: #ccc;
`;

const TooltipValue = styled.span`
  color: white;
  word-wrap: break-word;
  text-align: right;
  max-width: 280px;
  overflow-wrap: break-word;
`;

const ReviewerRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
`;

const ReviewerName = styled.span`
  color: white;
  font-size: 11px;
`;

const ReviewStatus = styled.span<{ $status: 'approved' | 'needs_review' | 'changes_requested' }>`
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  color: ${props => 
    props.$status === 'approved' ? '#fff' :
    props.$status === 'needs_review' ? '#000' :
    '#fff'
  };
  background-color: ${props => 
    props.$status === 'approved' ? '#28a745' :
    props.$status === 'needs_review' ? '#ffc107' :
    '#dc3545'
  };
`;

const ReviewersSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
`;

const PRIcon = styled.div`
  position: absolute;
  top: 6px;
  right: 6px;
  background: #e36209;
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: bold;
  z-index: 1;
`;

const getPRColor = (pr: PullRequest): string => {
  // Yellow if user needs to take action (requested as reviewer or assigned)
  if (pr.user_is_requested_reviewer || (pr.status === 'needs_review' && !pr.user_has_reviewed)) {
    return '#f1c21b'; // Yellow for user review needed
  }
  
  // Green for everything else (reviewed or open/not involved)
  return '#198038';
};

const getTextColor = (pr: PullRequest): string => {
  // Use black text for yellow background (user review needed)
  if (pr.user_is_requested_reviewer || (pr.status === 'needs_review' && !pr.user_has_reviewed)) {
    return '#000';
  }
  // Use white text for most backgrounds, but consider OPEN status might need adjustment
  return '#fff';
};

interface ReviewerStatus {
  login: string;
  status: 'approved' | 'needs_review' | 'changes_requested';
  isTeam?: boolean;
}

const getReviewerStatuses = (pullRequest: PullRequest): ReviewerStatus[] => {
  const reviewerMap = new Map<string, ReviewerStatus>();
  
  // First, add all requested reviewers with 'needs_review' status
  pullRequest.requested_reviewers.forEach(reviewer => {
    reviewerMap.set(reviewer.login, {
      login: reviewer.login,
      status: 'needs_review',
      isTeam: false
    });
  });
  
  // Add requested teams with 'needs_review' status
  if (pullRequest.requested_teams) {
    pullRequest.requested_teams.forEach(team => {
      reviewerMap.set(team.name, {
        login: team.name,
        status: 'needs_review',
        isTeam: true
      });
    });
  }
  
  // Then, add anyone who has actually reviewed (even if not originally requested)
  // This handles team reviewers and other contributors
  pullRequest.reviews.forEach(review => {
    const status = review.state === 'approved' ? 'approved' : 
                   review.state === 'changes_requested' ? 'changes_requested' : 
                   'needs_review';
    
    reviewerMap.set(review.user.login, {
      login: review.user.login,
      status: status as 'approved' | 'needs_review' | 'changes_requested',
      isTeam: false
    });
  });
  
  return Array.from(reviewerMap.values()).sort((a, b) => a.login.localeCompare(b.login));
};

export const PRNode: React.FC<NodeProps<PRNodeData>> = ({ data }) => {
  const { pullRequest, onClick } = data;
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const nodeRef = useRef<HTMLDivElement>(null);
  const color = getPRColor(pullRequest);
  const textColor = getTextColor(pullRequest);
  const reviewerStatuses = getReviewerStatuses(pullRequest);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(pullRequest);
    }
  };

  const handleMouseEnter = () => {
    if (nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top
      });
    }
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <>
      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ 
          opacity: 0,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }} 
      />
      <NodeContainer 
        ref={nodeRef}
        $color={color}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <PRIcon>PR</PRIcon>
        <PRNumber $textColor={textColor}>{pullRequest.user.login}</PRNumber>
        <PRTitle $textColor={textColor}>{pullRequest.title}</PRTitle>
      </NodeContainer>
      
      {createPortal(
        <TooltipContainer $visible={showTooltip} $x={tooltipPosition.x} $y={tooltipPosition.y}>
          <TooltipContent>
            <TooltipRow>
              <TooltipLabel>PR #:</TooltipLabel>
              <TooltipValue>{pullRequest.number}</TooltipValue>
            </TooltipRow>
            <TooltipRow>
              <TooltipLabel>Title:</TooltipLabel>
              <TooltipValue>{pullRequest.title}</TooltipValue>
            </TooltipRow>
            <TooltipRow>
              <TooltipLabel>Author:</TooltipLabel>
              <TooltipValue>{pullRequest.user.login}</TooltipValue>
            </TooltipRow>
            {reviewerStatuses.length > 0 ? (
              <>
                <TooltipRow>
                  <TooltipLabel>Reviewers:</TooltipLabel>
                  <TooltipValue></TooltipValue>
                </TooltipRow>
                <ReviewersSection>
                  {reviewerStatuses.map(reviewer => (
                    <ReviewerRow key={reviewer.login}>
                      <ReviewerName>
                        {reviewer.isTeam ? '👥 ' : ''}{reviewer.login}
                      </ReviewerName>
                      <ReviewStatus $status={reviewer.status}>
                        {reviewer.status === 'approved' ? '✓ Approved' :
                         reviewer.status === 'changes_requested' ? '✗ Changes' :
                         '⏳ Pending'}
                      </ReviewStatus>
                    </ReviewerRow>
                  ))}
                </ReviewersSection>
              </>
            ) : (
              <TooltipRow>
                <TooltipLabel>Reviewers:</TooltipLabel>
                <TooltipValue>None</TooltipValue>
              </TooltipRow>
            )}
            <TooltipRow>
              <TooltipLabel>Status:</TooltipLabel>
              <TooltipValue style={{ textTransform: 'capitalize' }}>
                {pullRequest.status.replace('_', ' ')}
              </TooltipValue>
            </TooltipRow>
            <TooltipRow>
              <TooltipLabel>State:</TooltipLabel>
              <TooltipValue style={{ textTransform: 'capitalize' }}>
                {pullRequest.state}
              </TooltipValue>
            </TooltipRow>
          </TooltipContent>
        </TooltipContainer>,
        document.body
      )}
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ 
          opacity: 0,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }} 
      />
    </>
  );
};