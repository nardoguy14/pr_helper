import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import styled from 'styled-components';
import { TeamStats } from '../../../types';

interface TeamNodeData {
  team: TeamStats;
  isExpanded: boolean;
  onClick: (organization: string, teamName: string) => void;
}

const NodeContainer = styled.div<{ $isExpanded: boolean; $isEnabled: boolean }>`
  width: 120px;
  height: 120px;
  padding: 12px;
  background: white;
  border: 3px solid ${props => 
    props.$isExpanded ? '#28a745' : 
    props.$isEnabled ? '#6f42c1' : '#d0d7de'
  };
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
  opacity: ${props => props.$isEnabled ? 1 : 0.6};
  
  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
`;

const TeamIcon = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  background: #6f42c1;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
  font-weight: bold;
`;

const TeamName = styled.div`
  font-weight: bold;
  font-size: 12px;
  color: #24292e;
  margin-bottom: 4px;
  line-height: 1.2;
`;

const Organization = styled.div`
  font-size: 10px;
  color: #6f42c1;
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

export const TeamNode: React.FC<NodeProps<TeamNodeData>> = ({ data }) => {
  const { team, isExpanded, onClick } = data;
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('TeamNode clicked:', team.organization, team.team_name, 'enabled:', team.enabled);
    onClick(team.organization, team.team_name);
  };

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <NodeContainer
        $isExpanded={isExpanded}
        $isEnabled={team.enabled}
        onClick={handleClick}
      >
        <TeamIcon>T</TeamIcon>
        <Organization>{team.organization}</Organization>
        <TeamName>{team.team_name}</TeamName>
        <Stats>
          {team.total_open_prs} PRs {team.total_open_prs === 0 && <span style={{ fontSize: '9px', color: '#0366d6' }}>(using mock data)</span>}
          {!team.enabled && <div style={{ fontSize: '9px', color: '#d73a49', marginTop: '2px' }}>DISABLED</div>}
        </Stats>
        {(team.assigned_to_user > 0 || team.review_requests > 0) && (
          <ReviewCount>
            {team.review_requests > 0 && `${team.review_requests} reviews`}
            {team.assigned_to_user > 0 && team.review_requests > 0 && ' • '}
            {team.assigned_to_user > 0 && `${team.assigned_to_user} assigned`}
          </ReviewCount>
        )}
      </NodeContainer>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
};