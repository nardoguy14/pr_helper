import React from 'react';
import { Handle, Position } from 'reactflow';
import styled from 'styled-components';

interface RepositoryNodeProps {
  data: {
    id?: string;
    repositoryName?: string;
    prCount?: number;
    reviewRequests?: number;
    assignedToUser?: number;
    isExpanded?: boolean;
    onClick?: () => void;
  };
}

// Fixed radius to match other nodes (between TeamNode 60px and PRNode 45px)
const getNodeRadius = () => {
  return 50; // Fixed radius for consistency with TeamNode (120px = 60px radius) and PRNode (90px = 45px radius)
};

// Get border color based on repository status (consistent with other nodes)
const getRepositoryBorderColor = (reviewRequests: number = 0, assignedToUser: number = 0, prCount: number = 0) => {
  if (reviewRequests > 0) {
    return '#f1c21b'; // Yellow for review requests
  } else if (assignedToUser > 0) {
    return '#0366d6'; // Blue for assignments
  } else if (prCount > 0) {
    return '#28a745'; // Green for open PRs
  } else {
    return '#d0d7de'; // Gray for no activity
  }
};

const NodeCircle = styled.div<{ 
  $radius: number; 
  $borderColor: string; 
  $isExpanded: boolean;
}>`
  width: ${props => props.$radius * 2}px;
  height: ${props => props.$radius * 2}px;
  border-radius: 50%;
  background: white;
  border: 3px solid ${props => props.$isExpanded ? '#6f42c1' : props.$borderColor};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  
  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
`;

const RepositoryText = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #24292e;
  text-align: center;
  pointer-events: none;
  user-select: none;
  margin-bottom: 2px;
  line-height: 1.2;
`;

const StatsText = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
  font-size: 11px;
  color: #586069;
  text-align: center;
  pointer-events: none;
  user-select: none;
  line-height: 1.3;
`;

const ReviewText = styled.div<{ $show: boolean }>`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
  font-size: 10px;
  color: #d73a49;
  text-align: center;
  pointer-events: none;
  user-select: none;
  margin-top: 2px;
  display: ${props => props.$show ? 'block' : 'none'};
  font-weight: bold;
`;

export function RepositoryNode({ data }: RepositoryNodeProps) {
  const { 
    repositoryName = '', 
    prCount = 0, 
    reviewRequests = 0,
    assignedToUser = 0,
    isExpanded = false, 
    onClick 
  } = data;

  const radius = getNodeRadius();
  const borderColor = getRepositoryBorderColor(reviewRequests, assignedToUser, prCount);
  const displayName = repositoryName ? (repositoryName.split('/').pop() || repositoryName) : 'Unknown';
  const showReviews = reviewRequests > 0;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ 
          background: '#d1d5da', 
          opacity: 0,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}
      />
      
      <NodeCircle 
        $radius={radius}
        $borderColor={borderColor}
        $isExpanded={isExpanded}
        onClick={onClick || (() => {})}
      >
        <RepositoryText>
          {displayName}
        </RepositoryText>
        
        <StatsText>
          {prCount} PR{prCount !== 1 ? 's' : ''}
        </StatsText>
        
        <ReviewText $show={showReviews}>
          {reviewRequests} review{reviewRequests !== 1 ? 's' : ''}
        </ReviewText>
      </NodeCircle>
      
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ 
          background: '#d1d5da', 
          opacity: 0,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}
      />
    </>
  );
}