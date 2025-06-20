import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import styled from 'styled-components';
import { RepositoryStats, PR_STATUS_COLORS } from '../../../types';

interface RepositoryNodeData {
  repository: RepositoryStats;
  isExpanded: boolean;
  onClick: (nodeId: string, repositoryName: string) => void;
}

const NodeContainer = styled.div<{ $isExpanded: boolean; $color: string }>`
  width: 120px;
  height: 120px;
  padding: 12px;
  background: white;
  border: 3px solid ${props => props.$color};
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
`;

const RepoIcon = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  background: #0366d6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
  font-weight: bold;
`;

const RepoName = styled.div`
  font-weight: bold;
  font-size: 13px;
  color: #24292e;
  margin-bottom: 4px;
  line-height: 1.2;
`;

const Stats = styled.div`
  font-size: 11px;
  color: #586069;
  line-height: 1.3;
`;

const ReviewCount = styled.div`
  font-size: 10px;
  color: #d73a49;
  font-weight: bold;
  margin-top: 2px;
`;

const getRepositoryColor = (repo: RepositoryStats, isExpanded: boolean): string => {
  // Dark colors when expanded, light colors when not expanded
  if (repo.review_requests > 0) {
    return isExpanded ? PR_STATUS_COLORS.needs_review : '#ffcccb'; // Dark orange -> Light orange
  } else if (repo.assigned_to_user > 0) {
    return isExpanded ? '#0366d6' : '#87ceeb'; // Dark blue -> Light blue
  } else if (repo.total_open_prs > 0) {
    return isExpanded ? '#28a745' : '#90ee90'; // Dark green -> Light green
  } else {
    return isExpanded ? '#6a737d' : '#d3d3d3'; // Dark gray -> Light gray
  }
};

export const RepositoryNode: React.FC<NodeProps<RepositoryNodeData>> = ({ data, id }) => {
  const { repository, isExpanded, onClick } = data;
  const color = getRepositoryColor(repository, isExpanded);
  
  console.log(`RepositoryNode ${id} (${repository.repository.name}): isExpanded=${isExpanded}, color=${color}`);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(id, repository.repository.full_name);
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
        $isExpanded={isExpanded} 
        $color={color}
        onClick={handleClick}
      >
        <RepoIcon>R</RepoIcon>
        <RepoName>{repository.repository.name}</RepoName>
        <Stats>
          {repository.total_open_prs} PRs
        </Stats>
        {repository.review_requests > 0 && (
          <ReviewCount>
            {repository.review_requests} reviews
          </ReviewCount>
        )}
      </NodeContainer>
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