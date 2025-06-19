import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import styled from 'styled-components';
import { PullRequest, PR_STATUS_COLORS } from '../../../types';

interface PRNodeData {
  pullRequest: PullRequest;
  onClick?: (pr: PullRequest) => void;
}

const NodeContainer = styled.div<{ $color: string }>`
  width: 80px;
  height: 80px;
  padding: 8px;
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
  
  &:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  }
`;

const PRNumber = styled.div`
  font-weight: bold;
  font-size: 12px;
  color: white;
  margin-bottom: 2px;
`;

const PRTitle = styled.div`
  font-size: 9px;
  color: white;
  opacity: 0.9;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const getPRColor = (pr: PullRequest): string => {
  switch (pr.status) {
    case 'needs_review':
      return PR_STATUS_COLORS.needs_review;
    case 'reviewed':
      return PR_STATUS_COLORS.reviewed;
    case 'waiting_for_changes':
      return PR_STATUS_COLORS.waiting_for_changes;
    default:
      return '#6a737d';
  }
};

export const PRNode: React.FC<NodeProps<PRNodeData>> = ({ data }) => {
  const { pullRequest, onClick } = data;
  const color = getPRColor(pullRequest);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(pullRequest);
    }
  };

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <NodeContainer 
        $color={color}
        onClick={handleClick}
      >
        <PRNumber>#{pullRequest.number}</PRNumber>
        <PRTitle>{pullRequest.title}</PRTitle>
      </NodeContainer>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
};