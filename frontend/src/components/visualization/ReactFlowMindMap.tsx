import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styled from 'styled-components';

import { RepositoryStats, TeamStats, PullRequest } from '../../types';
import { RepositoryNode } from './nodes/RepositoryNode';
import { TeamNode } from './nodes/TeamNode';
import { PRNode } from './nodes/PRNode';

interface ReactFlowMindMapProps {
  repositories: RepositoryStats[];
  teams: TeamStats[];
  onRepositoryClick: (repositoryName: string) => void;
  onTeamClick: (organization: string, teamName: string) => void;
  onPRClick?: (pr: PullRequest) => void;
  expandedRepositories: Set<string>;
  expandedTeams: Set<string>;
  allPullRequests: Record<string, PullRequest[]>;
  allTeamPullRequests: Record<string, PullRequest[]>;
  teamRepositories: Record<string, string[]>; // teamKey -> repository names
  width?: number;
  height?: number;
}

const Container = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #fafbfc;

  .react-flow__controls {
    background: white;
    border: 1px solid #e1e4e8;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .react-flow__controls-button {
    background: white;
    border: none;
    border-bottom: 1px solid #e1e4e8;
    
    &:hover {
      background: #f6f8fa;
    }
    
    &:last-child {
      border-bottom: none;
    }
  }

  .react-flow__minimap {
    background: white;
    border: 1px solid #e1e4e8;
    border-radius: 8px;
  }

  .react-flow__node {
    transition: opacity 0.8s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.8s cubic-bezier(0.25, 0.8, 0.25, 1);
  }

  .react-flow__node.dragging {
    transition: none !important;
  }

  .react-flow__edge {
    transition: opacity 0.8s cubic-bezier(0.25, 0.8, 0.25, 1);
  }

  .node-entering {
    opacity: 0;
    transform: scale(0.1);
  }

  .node-visible {
    opacity: 1;
    transform: scale(1);
  }

  .edge-entering {
    opacity: 0;
  }

  .edge-visible {
    opacity: 1;
  }

  /* Let React Flow handle the flowing animation */
  .react-flow__edge.edge-visible path {
    stroke-dasharray: 5,5;
  }
`;

const nodeTypes: NodeTypes = {
  repository: RepositoryNode,
  team: TeamNode,
  pr: PRNode,
};

export const ReactFlowMindMap: React.FC<ReactFlowMindMapProps> = ({
  repositories,
  teams,
  onRepositoryClick,
  onTeamClick,
  onPRClick,
  expandedRepositories,
  expandedTeams,
  allPullRequests,
  allTeamPullRequests,
  teamRepositories,
  width = 800,
  height = 600
}) => {
  const [reactFlowNodes, setNodes, onNodesChange] = useNodesState([]);
  const [reactFlowEdges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Debug: Log whenever nodes change
  useEffect(() => {
    console.log('NODES CHANGED:', reactFlowNodes.length, 'nodes:', reactFlowNodes.map(n => n.id));
  }, [reactFlowNodes]);
  
  // Track which teams have been initialized to avoid recreating base team nodes
  const [initializedTeams, setInitializedTeams] = useState<Set<string>>(new Set());
  const processedRepositories = useRef<Set<string>>(new Set());
  const animationTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      animationTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  // Initialize team nodes only once
  useEffect(() => {
    // Only create team nodes if team nodes don't already exist
    if (reactFlowNodes.some(node => node.type === 'team')) {
      console.log('Team nodes already exist, skipping initialization');
      return;
    }
    
    const centerX = width / 2;
    const centerY = height / 2;
    const teamRadius = Math.min(width, height) * 0.3;
    
    const newTeamNodes = teams.map((team, teamIndex) => {
      const teamKey = `${team.organization}/${team.team_name}`;
      const teamAngle = (teamIndex / teams.length) * 2 * Math.PI;
      const teamX = centerX + Math.cos(teamAngle) * teamRadius;
      const teamY = centerY + Math.sin(teamAngle) * teamRadius;

      return {
        id: teamKey,
        type: 'team',
        position: { x: teamX, y: teamY },
        data: {
          team: team,
          isExpanded: expandedTeams.has(teamKey),
          onClick: onTeamClick,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        className: 'node-visible',
      };
    });
    
    console.log('Initializing team nodes:', newTeamNodes.length);
    setNodes(newTeamNodes);
    setInitializedTeams(new Set(teams.map(t => `${t.organization}/${t.team_name}`)));
  }, [teams, width, height, onTeamClick]); // Removed reactFlowNodes from deps to avoid circular dependency

  // Track previous expanded teams to detect actual collapses
  const [prevExpandedTeams, setPrevExpandedTeams] = useState<Set<string>>(new Set());

  // Handle team expansion/collapse by adding/removing nodes incrementally
  useEffect(() => {
    console.log('=== TEAM EXPANSION USEEFFECT START ===');
    console.log('expandedTeams:', Array.from(expandedTeams));
    console.log('prevExpandedTeams:', Array.from(prevExpandedTeams));
    
    const centerX = width / 2;
    const centerY = height / 2;
    const teamRadius = Math.min(width, height) * 0.3;
    // Dynamic radius for repository nodes to prevent overlap
    const repoRadius = 200;

    // Find teams that were just expanded (not in prev but in current)
    const newlyExpandedTeams = Array.from(expandedTeams).filter(team => !prevExpandedTeams.has(team));
    
    // Find teams that were just collapsed (in prev but not in current)
    const newlyCollapsedTeams = Array.from(prevExpandedTeams).filter(team => !expandedTeams.has(team));

    console.log('Team expansion change - Newly expanded:', newlyExpandedTeams, 'Newly collapsed:', newlyCollapsedTeams);

    // Add repository nodes for newly expanded teams
    newlyExpandedTeams.forEach(teamKey => {
      const team = teams.find(t => `${t.organization}/${t.team_name}` === teamKey);
      if (!team) return;

      const teamIndex = teams.findIndex(t => `${t.organization}/${t.team_name}` === teamKey);
      const teamAngle = (teamIndex / teams.length) * 2 * Math.PI;
      const teamX = centerX + Math.cos(teamAngle) * teamRadius;
      const teamY = centerY + Math.sin(teamAngle) * teamRadius;

      const teamRepos = teamRepositories[teamKey] || [];
      console.log('Team repositories for', teamKey, ':', teamRepos);
      
      // Add repository nodes for this team
      setNodes(currentNodes => {
        const hasRepoNodes = currentNodes.some(node => node.id.includes(`${teamKey}-repo-`));
        if (hasRepoNodes) return currentNodes; // Already have repo nodes for this team

        const validRepoNodes = teamRepos
          .map((repoName, repoIndex) => {
            // Spread repositories in a wider arc to prevent overlap
            const spreadAngle = Math.min(Math.PI * 1.5, Math.PI * 0.15 * teamRepos.length); // Max 270 degrees
            const startAngle = teamAngle - spreadAngle / 2;
            const angleStep = teamRepos.length > 1 ? spreadAngle / (teamRepos.length - 1) : 0;
            const repoAngle = startAngle + (repoIndex * angleStep);
            
            // Dynamic radius based on number of repos
            const dynamicRepoRadius = Math.max(repoRadius, repoRadius + (teamRepos.length * 10));
            
            const repoX = teamX + Math.cos(repoAngle) * dynamicRepoRadius;
            const repoY = teamY + Math.sin(repoAngle) * dynamicRepoRadius;
            const repoNodeId = `${teamKey}-repo-${repoName}`;

            // Create repository stats from team PR data  
            const teamPRs = allTeamPullRequests[teamKey] || [];
            const repoPRs = teamPRs.filter((pr: any) => pr.repository.full_name === repoName);
            const samplePR = repoPRs[0];
            
            if (!samplePR) {
              console.warn('No PR data found for repository:', repoName);
              return null;
            }
            
            const repoStats = {
              repository: samplePR.repository,
              total_open_prs: repoPRs.length,
              assigned_to_user: repoPRs.filter((pr: any) => pr.user_is_assigned).length,
              review_requests: repoPRs.filter((pr: any) => pr.user_is_requested_reviewer).length,
              code_owner_prs: 0,
              last_updated: new Date().toISOString()
            };

            return {
              id: repoNodeId,
              type: 'repository',
              position: { x: repoX, y: repoY },
              data: {
                repository: repoStats,
                isExpanded: expandedRepositories.has(repoName),
                onClick: onRepositoryClick,
              },
              sourcePosition: Position.Bottom,
              targetPosition: Position.Top,
              className: 'node-entering',
            };
          })
          .filter((node): node is NonNullable<typeof node> => node !== null);

        console.log('Adding repository nodes for team:', teamKey, 'Nodes to add:', validRepoNodes.length);
        const newNodes = [...currentNodes, ...validRepoNodes];
        console.log('Total nodes after adding repos:', newNodes.length, newNodes.map(n => n.id));
        return newNodes;
      });

      // Add edges for the new repository nodes
      setEdges(currentEdges => {
        const hasRepoEdges = currentEdges.some(edge => edge.id.includes(`edge-${teamKey}-`));
        if (hasRepoEdges) return currentEdges; // Already have edges for this team

        const newRepoEdges = teamRepos.map(repoName => ({
          id: `edge-${teamKey}-${repoName}`,
          source: teamKey,
          target: `${teamKey}-repo-${repoName}`,
          type: 'straight',
          animated: true,
          className: 'edge-entering',
          style: {
            stroke: '#6f42c1',
            strokeWidth: 2,
          },
        }));

        return [...currentEdges, ...newRepoEdges];
      });
    });

    // Remove repository nodes ONLY for teams that were just collapsed
    if (newlyCollapsedTeams.length > 0) {
      console.log('Removing nodes for collapsed teams:', newlyCollapsedTeams);
      setNodes(currentNodes => {
        console.log('Current nodes before removal:', currentNodes.length, currentNodes.map(n => n.id));
        const filteredNodes = currentNodes.filter(node => {
          if (!node.id.includes('-repo-')) return true; // Keep non-repo nodes
          
          const teamKey = node.id.split('-repo-')[0];
          const isCollapsedTeam = newlyCollapsedTeams.includes(teamKey);
          
          if (isCollapsedTeam) {
            console.log('Removing repository node:', node.id, 'because team', teamKey, 'was just collapsed');
          }
          
          return !isCollapsedTeam; // Remove only if team was just collapsed
        });
        
        if (filteredNodes.length !== currentNodes.length) {
          console.log('Removed repository nodes for collapsed teams:', currentNodes.length - filteredNodes.length);
          console.log('Remaining nodes:', filteredNodes.map(n => n.id));
        }
        
        return filteredNodes;
      });

      setEdges(currentEdges => {
        return currentEdges.filter(edge => {
          if (!edge.id.startsWith('edge-') || !edge.id.includes('-repo-')) return true; // Keep non-repo edges
          
          const teamKey = edge.source;
          return !newlyCollapsedTeams.includes(teamKey); // Remove only if team was just collapsed
        });
      });
    } else {
      console.log('No teams were collapsed, not removing any nodes');
    }

    // Update previous expanded teams state
    setPrevExpandedTeams(new Set(expandedTeams));
  }, [expandedTeams, teamRepositories, teams, allTeamPullRequests, onRepositoryClick]);

  // Handle animations for newly added repository nodes
  useEffect(() => {
    // Clear existing timeouts
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current.clear();

    // Find repository nodes that need animation
    setNodes(currentNodes => {
      const updatedNodes = currentNodes.map(node => {
        if (node.className === 'node-entering' && node.id.includes('-repo-')) {
          // Animate repository nodes to visible after a delay
          const timeout = setTimeout(() => {
            setNodes(nodes => 
              nodes.map(n => 
                n.id === node.id 
                  ? { ...n, className: 'node-visible' }
                  : n
              )
            );
          }, 150);
          
          animationTimeouts.current.add(timeout);
        }
        return node;
      });
      return updatedNodes;
    });

    // Animate edges
    setEdges(currentEdges => {
      const updatedEdges = currentEdges.map(edge => {
        if (edge.className === 'edge-entering') {
          const timeout = setTimeout(() => {
            setEdges(edges => 
              edges.map(e => 
                e.id === edge.id 
                  ? { ...e, className: 'edge-visible' }
                  : e
              )
            );
          }, 300);
          
          animationTimeouts.current.add(timeout);
        }
        return edge;
      });
      return updatedEdges;
    });
  }, [expandedTeams, setNodes, setEdges]); // Trigger when teams expand

  // Handle repository expansion to show PR nodes
  useEffect(() => {
    console.log('Repository expansion useEffect triggered, expandedRepositories:', Array.from(expandedRepositories));
    
    // Only process changes, not recreate everything
    setNodes(currentNodes => {
      console.log('Current nodes before repo expansion processing:', currentNodes.length, currentNodes.map(n => n.id));
      
      let nodesToAdd: any[] = [];
      let nodesToRemove: string[] = [];

      // Check each expanded repository
      expandedRepositories.forEach(repositoryName => {
        const prs = allPullRequests[repositoryName] || [];
        if (prs.length === 0) return;

        const hasPRNodes = currentNodes.some(node => node.id.includes(`${repositoryName}-pr-`));
        if (hasPRNodes) return; // Already have PR nodes

        // Find the repository node
        const repoNode = currentNodes.find(node => 
          (node.id === repositoryName || node.id.endsWith(`-repo-${repositoryName}`)) && 
          node.type === 'repository'
        );
        
        if (!repoNode) {
          console.log('Could not find repository node for:', repositoryName);
          console.log('Available nodes:', currentNodes.map(n => ({ id: n.id, type: n.type })));
          return;
        }

        // Find the team node this repo belongs to
        const teamNodeId = repoNode.id.split('-repo-')[0];
        const teamNode = currentNodes.find(node => node.id === teamNodeId && node.type === 'team');
        
        // Calculate angle from team center to repo
        let baseAngle = 0;
        if (teamNode) {
          const dx = repoNode.position.x - teamNode.position.x;
          const dy = repoNode.position.y - teamNode.position.y;
          baseAngle = Math.atan2(dy, dx);
        }

        // Dynamic radius based on number of PRs to prevent overlap
        // Minimum radius of 150, increases by 15 for each PR to ensure spacing
        const prRadius = Math.max(150, 100 + (prs.length * 15));
        
        // Spread PRs in a limited arc on the opposite side of the team
        const maxSpread = Math.PI * 0.6; // 108 degrees max spread
        const spreadAngle = Math.min(maxSpread, Math.PI * 0.1 * prs.length);
        const startAngle = baseAngle - spreadAngle / 2;
        
        const newPRNodes = prs.map((pr, prIndex) => {
          const angleStep = prs.length > 1 ? spreadAngle / (prs.length - 1) : 0;
          const prAngle = startAngle + (prIndex * angleStep);
          const prX = repoNode.position.x + Math.cos(prAngle) * prRadius;
          const prY = repoNode.position.y + Math.sin(prAngle) * prRadius;

          return {
            id: `${repositoryName}-pr-${pr.number}`,
            type: 'pr',
            position: { x: prX, y: prY },
            data: {
              pullRequest: pr,
              onClick: onPRClick,
            },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            className: 'node-visible',
          };
        });

        console.log('Adding PR nodes for repository:', repositoryName, newPRNodes.length, 'PRs');
        nodesToAdd.push(...newPRNodes);
      });

      // Check for repositories that are no longer expanded
      currentNodes.forEach(node => {
        if (node.id.includes('-pr-')) {
          const repositoryName = node.id.split('-pr-')[0];
          if (!expandedRepositories.has(repositoryName)) {
            console.log('Removing PR node:', node.id, 'because repo', repositoryName, 'is not expanded');
            nodesToRemove.push(node.id);
          }
        }
      });

      if (nodesToAdd.length === 0 && nodesToRemove.length === 0) {
        console.log('No changes needed in repository expansion');
        return currentNodes; // No changes needed
      }

      const finalNodes = [
        ...currentNodes.filter(node => !nodesToRemove.includes(node.id)),
        ...nodesToAdd
      ];
      
      console.log('Repository expansion: Final nodes:', finalNodes.length, 'added:', nodesToAdd.length, 'removed:', nodesToRemove.length);
      return finalNodes;
    });

    // Handle edges separately with a slight delay to ensure nodes are created first
    setTimeout(() => {
      setNodes(currentNodes => {
        setEdges(currentEdges => {
          let edgesToAdd: any[] = [];
          let edgesToRemove: string[] = [];

          expandedRepositories.forEach(repositoryName => {
            const prs = allPullRequests[repositoryName] || [];
            if (prs.length === 0) return;

            const hasPREdges = currentEdges.some(edge => edge.id.includes(`edge-${repositoryName}-pr-`));
            if (hasPREdges) return;

            // Find the actual repository node ID from current nodes
            const repoNode = currentNodes.find(node => 
              (node.id === repositoryName || node.id.endsWith(`-repo-${repositoryName}`)) && 
              node.type === 'repository'
            );
            
            if (!repoNode) {
              console.log('Could not find repository node for edges:', repositoryName);
              return;
            }
            
            const newPREdges = prs.map(pr => ({
              id: `edge-${repositoryName}-pr-${pr.number}`,
              source: repoNode.id,
              target: `${repositoryName}-pr-${pr.number}`,
              type: 'straight',
              animated: true,
              style: {
                stroke: '#0366d6',
                strokeWidth: 2,
              },
            }));

            edgesToAdd.push(...newPREdges);
          });

          // Remove edges for collapsed repositories
          currentEdges.forEach(edge => {
            if (edge.id.includes('-pr-')) {
              const repositoryName = edge.id.split('-pr-')[0].replace('edge-', '');
              if (!expandedRepositories.has(repositoryName)) {
                edgesToRemove.push(edge.id);
              }
            }
          });

          if (edgesToAdd.length === 0 && edgesToRemove.length === 0) {
            return currentEdges;
          }

          return [
            ...currentEdges.filter(edge => !edgesToRemove.includes(edge.id)),
            ...edgesToAdd
          ];
        });
        
        return currentNodes; // Don't modify nodes here
      });
    }, 100);
  }, [expandedRepositories, allPullRequests, onPRClick]);


  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeDragStart = useCallback((event: any, node: any) => {
    setNodes(nodes => 
      nodes.map(n => 
        n.id === node.id 
          ? { ...n, className: `${n.className || ''} dragging`.trim() }
          : n
      )
    );
  }, [setNodes]);

  const onNodeDragStop = useCallback((event: any, node: any) => {
    setNodes(nodes => 
      nodes.map(n => 
        n.id === node.id 
          ? { ...n, className: (n.className || '').replace('dragging', '').trim() }
          : n
      )
    );
  }, [setNodes]);

  return (
    <Container>
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 100,
          minZoom: 1.2,
          maxZoom: 3.0,
        }}
        attributionPosition="bottom-left"
      >
        <Controls />
        <MiniMap 
          nodeStrokeColor={(node) => {
            if (node.type === 'repository') {
              return node.data?.repository ? '#0366d6' : '#999';
            }
            if (node.type === 'team') {
              return '#6f42c1';
            }
            return '#999';
          }}
          nodeColor={(node) => {
            if (node.type === 'repository') {
              return '#fff';
            }
            if (node.type === 'team') {
              return '#fff';
            }
            if (node.type === 'pr') {
              const pr = node.data?.pullRequest;
              // Check if PR needs user review - mark as yellow
              if (pr?.user_is_requested_reviewer || (pr?.status === 'needs_review' && !pr?.user_has_reviewed)) {
                return '#f1c21b';
              }
              if (pr?.status === 'needs_review') return '#d73a49';
              if (pr?.status === 'reviewed') return '#28a745';
              if (pr?.status === 'waiting_for_changes') return '#fb8500';
              return '#6a737d';
            }
            return '#fff';
          }}
          maskColor="rgba(255, 255, 255, 0.7)"
          position="top-right"
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>
    </Container>
  );
};