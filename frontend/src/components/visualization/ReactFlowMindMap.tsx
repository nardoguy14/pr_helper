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
  onRepositoryClick: (nodeId: string, repositoryName: string) => void;
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

  // Initialize and update nodes (teams and direct repositories)
  useEffect(() => {
    const centerX = width / 2;
    const centerY = height / 2;
    const teamRadius = Math.min(width, height) * 0.35; // Increased to give more space between teams
    const repoRadius = Math.min(width, height) * 0.5; // Further increased to prevent overlap
    
    setNodes(currentNodes => {
      const nodeMap = new Map(currentNodes.map(node => [node.id, node]));
      const updatedNodes: Node[] = [];
      
      // Update or add team nodes
      teams.forEach((team, teamIndex) => {
        const teamKey = `${team.organization}/${team.team_name}`;
        const existingNode = nodeMap.get(teamKey);
        
        if (existingNode) {
          // Update existing node data
          updatedNodes.push({
            ...existingNode,
            data: {
              ...existingNode.data,
              team: team,
              isExpanded: expandedTeams.has(teamKey),
            },
          });
        } else {
          // Create new node
          const teamAngle = (teamIndex / teams.length) * 2 * Math.PI;
          const teamX = centerX + Math.cos(teamAngle) * teamRadius;
          const teamY = centerY + Math.sin(teamAngle) * teamRadius;
          
          updatedNodes.push({
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
          });
        }
      });
      
      // Update or add direct repository nodes (not from teams)
      repositories.forEach((repo, repoIndex) => {
        const repoId = repo.repository.full_name;
        const existingNode = nodeMap.get(repoId);
        
        if (existingNode) {
          // Update existing node data
          updatedNodes.push({
            ...existingNode,
            data: {
              ...existingNode.data,
              repository: repo,
              isExpanded: expandedRepositories.has(repoId),
            },
          });
        } else {
          // Create new node
          const startAngle = teams.length > 0 ? Math.PI * 0.25 : 0;
          const angleRange = Math.PI * 1.5;
          const repoAngle = repositories.length === 1 
            ? startAngle + angleRange / 2 
            : startAngle + (repoIndex / (repositories.length - 1)) * angleRange;
          const repoX = centerX + Math.cos(repoAngle) * repoRadius;
          const repoY = centerY + Math.sin(repoAngle) * repoRadius;
          
          updatedNodes.push({
            id: repoId,
            type: 'repository',
            position: { x: repoX, y: repoY },
            data: {
              repository: repo,
              isExpanded: expandedRepositories.has(repoId),
              onClick: onRepositoryClick,
            },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            className: 'node-visible',
          });
        }
      });
      
      // Preserve other nodes (team repos, PRs) that aren't being updated
      currentNodes.forEach(node => {
        if (node.type !== 'team' && !repositories.some(r => r.repository.full_name === node.id)) {
          // This is a team repository node or PR node, preserve it
          if (node.id.includes('-repo-') || node.id.includes('-pr-')) {
            updatedNodes.push(node);
          }
        }
      });
      
      console.log('Updating nodes:', updatedNodes.length, 'teams:', teams.length, 'direct repos:', repositories.length);
      return updatedNodes;
    });
  }, [teams, repositories, width, height, onTeamClick, onRepositoryClick, expandedTeams, expandedRepositories]);

  // Track previous expanded teams to detect actual collapses
  const [prevExpandedTeams, setPrevExpandedTeams] = useState<Set<string>>(new Set());

  // Handle team expansion/collapse by adding/removing repository nodes from teams
  useEffect(() => {
    console.log('=== TEAM EXPANSION USEEFFECT START ===');
    console.log('expandedTeams:', Array.from(expandedTeams));
    console.log('prevExpandedTeams:', Array.from(prevExpandedTeams));

    // Find teams that were just expanded (not in prev but in current)
    const newlyExpandedTeams = Array.from(expandedTeams).filter(team => !prevExpandedTeams.has(team));
    
    // Find teams that were just collapsed (in prev but not in current)
    const newlyCollapsedTeams = Array.from(prevExpandedTeams).filter(team => !expandedTeams.has(team));

    console.log('Team expansion change - Newly expanded:', newlyExpandedTeams, 'Newly collapsed:', newlyCollapsedTeams);

    // Add repository nodes for newly expanded teams
    newlyExpandedTeams.forEach(teamKey => {
      const team = teams.find(t => `${t.organization}/${t.team_name}` === teamKey);
      if (!team) return;

      const teamRepos = teamRepositories[teamKey] || [];
      console.log('Team repositories for', teamKey, ':', teamRepos);
      
      // Add repository nodes for this team
      setNodes(currentNodes => {
        const teamNode = currentNodes.find(node => node.id === teamKey && node.type === 'team');
        if (!teamNode) {
          console.warn('Could not find team node for:', teamKey);
          return currentNodes;
        }
        
        const hasRepoNodes = currentNodes.some(node => node.id.includes(`${teamKey}-repo-`));
        if (hasRepoNodes) return currentNodes; // Already have repo nodes for this team
        
        // Get team position from the existing node
        const teamX = teamNode.position.x;
        const teamY = teamNode.position.y;
        const baseRepoRadius = 250; // Increased base radius
        
        // Calculate center of visualization
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Calculate angle from center to this team to determine outward direction
        const teamAngleFromCenter = Math.atan2(teamY - centerY, teamX - centerX);
        
        // Find other team nodes to avoid collision
        const otherTeamNodes = currentNodes.filter(node => 
          node.type === 'team' && node.id !== teamKey
        );
        
        // Calculate angles to avoid other teams
        const anglesToAvoid = otherTeamNodes.map(otherTeam => {
          const angleToOther = Math.atan2(
            otherTeam.position.y - teamY,
            otherTeam.position.x - teamX
          );
          return angleToOther;
        });

        const validRepoNodes = teamRepos
          .map((repoName, repoIndex) => {
            // Calculate optimal spread angle based on number of repos
            const minAnglePerRepo = Math.PI / 6; // 30 degrees minimum per repo
            const desiredSpread = minAnglePerRepo * teamRepos.length;
            const maxSpread = Math.PI * 1.2; // 216 degrees max (reduced from 270)
            const spreadAngle = Math.min(desiredSpread, maxSpread);
            
            // Start branching outward from center (away from other teams)
            const baseAngle = teamAngleFromCenter;
            const angleStep = teamRepos.length > 1 ? spreadAngle / (teamRepos.length - 1) : 0;
            const repoAngle = baseAngle - spreadAngle/2 + (repoIndex * angleStep);
            
            // Dynamic radius based on number of repos - more repos = larger radius
            const radiusMultiplier = 1 + (teamRepos.length * 0.1); // 10% increase per repo
            const dynamicRepoRadius = baseRepoRadius * radiusMultiplier;
            
            // Check if this angle would collide with other teams
            let finalAngle = repoAngle;
            const minSafeDistance = Math.PI / 4; // 45 degrees minimum from other teams
            
            for (const avoidAngle of anglesToAvoid) {
              const angleDiff = Math.abs((finalAngle - avoidAngle + Math.PI) % (2 * Math.PI) - Math.PI);
              if (angleDiff < minSafeDistance) {
                // Adjust angle to avoid collision
                const adjustment = minSafeDistance - angleDiff;
                // Move away from the conflicting angle
                if (finalAngle > avoidAngle) {
                  finalAngle += adjustment;
                } else {
                  finalAngle -= adjustment;
                }
              }
            }
            
            const repoX = teamX + Math.cos(finalAngle) * dynamicRepoRadius;
            const repoY = teamY + Math.sin(finalAngle) * dynamicRepoRadius;
            const repoNodeId = `${teamKey}-repo-${repoName}`;

            // Create repository stats from team PR data  
            const teamPRs = allTeamPullRequests[teamKey] || [];
            const repoPRs = teamPRs.filter((pr: any) => pr.repository.full_name === repoName);
            const samplePR = repoPRs[0];
            
            if (!samplePR) {
              console.warn('No PR data found for repository:', repoName);
              return null;
            }
            
            // Use the filtered PRs that were passed in (already filtered by date in App.tsx)
            const filteredRepoPRs = allTeamPullRequests[teamKey]?.filter((pr: any) => pr.repository.full_name === repoName) || repoPRs;
            
            const repoStats = {
              repository: samplePR.repository,
              total_open_prs: filteredRepoPRs.length,
              assigned_to_user: filteredRepoPRs.filter((pr: any) => pr.user_is_assigned).length,
              review_requests: filteredRepoPRs.filter((pr: any) => pr.user_is_requested_reviewer).length,
              code_owner_prs: 0,
              last_updated: new Date().toISOString()
            };

            return {
              id: repoNodeId,
              type: 'repository',
              position: { x: repoX, y: repoY },
              data: {
                repository: repoStats,
                isExpanded: expandedRepositories.has(repoNodeId),
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
          // Check if this is a team repo node
          if (node.id.includes('-repo-')) {
            const teamKey = node.id.split('-repo-')[0];
            const isCollapsedTeam = newlyCollapsedTeams.includes(teamKey);
            
            if (isCollapsedTeam) {
              console.log('Removing repository node:', node.id, 'because team', teamKey, 'was just collapsed');
            }
            
            return !isCollapsedTeam; // Remove if team was just collapsed
          }
          
          // Check if this is a PR node belonging to a team repo
          if (node.id.includes('-pr-')) {
            // Check if this PR belongs to a team repository
            for (const teamKey of newlyCollapsedTeams) {
              // Check if any repo of this team contains this PR
              const teamRepos = teamRepositories[teamKey] || [];
              for (const repoName of teamRepos) {
                if (node.id.startsWith(`${repoName}-pr-`)) {
                  console.log('Removing PR node:', node.id, 'because it belongs to collapsed team', teamKey);
                  return false; // Remove this PR node
                }
              }
            }
          }
          
          return true; // Keep all other nodes
        });
        
        if (filteredNodes.length !== currentNodes.length) {
          console.log('Removed repository nodes for collapsed teams:', currentNodes.length - filteredNodes.length);
          console.log('Remaining nodes:', filteredNodes.map(n => n.id));
        }
        
        return filteredNodes;
      });

      setEdges(currentEdges => {
        return currentEdges.filter(edge => {
          // Check if this is a team repo edge
          if (edge.id.startsWith('edge-') && edge.id.includes('-repo-')) {
            const teamKey = edge.source;
            return !newlyCollapsedTeams.includes(teamKey); // Remove if team was just collapsed
          }
          
          // Check if this is a PR edge belonging to a team repo
          if (edge.id.includes('-pr-')) {
            // Check if this PR edge belongs to a collapsed team's repository
            for (const teamKey of newlyCollapsedTeams) {
              const teamRepos = teamRepositories[teamKey] || [];
              for (const repoName of teamRepos) {
                if (edge.id.includes(`${repoName}-pr-`)) {
                  return false; // Remove this PR edge
                }
              }
            }
          }
          
          return true; // Keep all other edges
        });
      });
    } else {
      console.log('No teams were collapsed, not removing any nodes');
    }

    // Update previous expanded teams state
    setPrevExpandedTeams(new Set(expandedTeams));
  }, [expandedTeams, teamRepositories, teams, allTeamPullRequests, onRepositoryClick, expandedRepositories, width, height]);

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

      // Check each expanded repository node
      expandedRepositories.forEach(nodeId => {
        // Find the repository node
        const repoNode = currentNodes.find(node => node.id === nodeId && node.type === 'repository');
        if (!repoNode) {
          console.log('Could not find repository node:', nodeId);
          return;
        }
        
        // Extract repository name from the node
        let repositoryName = '';
        if (nodeId.includes('-repo-')) {
          // Team repository node: teamKey-repo-repoName
          repositoryName = nodeId.split('-repo-')[1];
        } else {
          // Direct repository node: repoName
          repositoryName = nodeId;
        }
        
        const prs = allPullRequests[repositoryName] || [];
        if (prs.length === 0) return;
        
        // Check if this specific repo node already has PR nodes
        const nodePrefix = repoNode.id.includes('-repo-') ? repoNode.id : repositoryName;
        const hasPRNodes = currentNodes.some(node => node.id.startsWith(`${nodePrefix}-pr-`));
        if (hasPRNodes) return; // Already have PR nodes for this specific repo node

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
          // Increased base radius and scaling factor
          const basePRRadius = 200; // Increased from 150
          const prRadius = basePRRadius + (prs.length * 25); // Increased from 15 to 25 per PR
          
          // Calculate optimal spread for PRs
          const minAnglePerPR = Math.PI / 12; // 15 degrees minimum per PR
          const desiredPRSpread = minAnglePerPR * prs.length;
          const maxSpread = Math.PI * 0.8; // 144 degrees max spread (increased from 108)
          const spreadAngle = Math.min(desiredPRSpread, maxSpread);
          const startAngle = baseAngle - spreadAngle / 2;
          
          const newPRNodes = prs.map((pr, prIndex) => {
            const angleStep = prs.length > 1 ? spreadAngle / (prs.length - 1) : 0;
            const prAngle = startAngle + (prIndex * angleStep);
            const prX = repoNode.position.x + Math.cos(prAngle) * prRadius;
            const prY = repoNode.position.y + Math.sin(prAngle) * prRadius;

            return {
              id: `${nodePrefix}-pr-${pr.number}`,
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

          console.log('Adding PR nodes for repository node:', repoNode.id, newPRNodes.length, 'PRs');
          nodesToAdd.push(...newPRNodes);
      });

      // Check for repositories that are no longer expanded
      currentNodes.forEach(node => {
        if (node.id.includes('-pr-')) {
          // Extract the repository name from the PR node ID
          let repositoryName = '';
          if (node.id.includes('-repo-')) {
            // This is a team repo PR node: teamKey-repo-repoName-pr-number
            const parts = node.id.split('-pr-')[0].split('-repo-');
            repositoryName = parts[1];
          } else {
            // This is a direct repo PR node: repoName-pr-number
            repositoryName = node.id.split('-pr-')[0];
          }
          
          // Check if the parent repository node is expanded
          let parentNodeId = '';
          if (node.id.includes('-repo-')) {
            // Extract parent node ID: teamKey-repo-repoName
            parentNodeId = node.id.split('-pr-')[0];
          } else {
            // For direct repos, parent node ID is just the repo name
            parentNodeId = repositoryName;
          }
          
          if (!expandedRepositories.has(parentNodeId)) {
            console.log('Removing PR node:', node.id, 'because parent node', parentNodeId, 'is not expanded');
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
      setEdges(currentEdges => {
          let edgesToAdd: any[] = [];
          let edgesToRemove: string[] = [];

          expandedRepositories.forEach(nodeId => {
            // Find the repository node
            const repoNode = reactFlowNodes.find(node => node.id === nodeId && node.type === 'repository');
            if (!repoNode) {
              console.log('Could not find repository node for edges:', nodeId);
              return;
            }
            
            // Extract repository name
            let repositoryName = '';
            if (nodeId.includes('-repo-')) {
              repositoryName = nodeId.split('-repo-')[1];
            } else {
              repositoryName = nodeId;
            }
            
            const prs = allPullRequests[repositoryName] || [];
            if (prs.length === 0) return;
              const nodePrefix = repoNode.id.includes('-repo-') ? repoNode.id : repositoryName;
              const hasPREdges = currentEdges.some(edge => edge.source === repoNode.id && edge.id.includes('-pr-'));
              if (hasPREdges) return;
              
              const newPREdges = prs.map(pr => ({
                id: `edge-${nodePrefix}-pr-${pr.number}`,
                source: repoNode.id,
                target: `${nodePrefix}-pr-${pr.number}`,
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
              // Extract repository name from edge
              let repositoryName = '';
              if (edge.id.includes('-repo-')) {
                // Team repo edge
                const parts = edge.id.split('-pr-')[0].split('-repo-');
                repositoryName = parts[1];
              } else {
                // Direct repo edge
                repositoryName = edge.id.split('-pr-')[0].replace('edge-', '');
              }
              
              // Extract parent node ID from edge
              let parentNodeId = '';
              if (edge.id.includes('-repo-')) {
                // Team repo edge: edge-teamKey-repo-repoName-pr-number
                parentNodeId = edge.id.split('-pr-')[0].replace('edge-', '');
              } else {
                // Direct repo edge: edge-repoName-pr-number
                parentNodeId = repositoryName;
              }
              
              if (!expandedRepositories.has(parentNodeId)) {
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
    }, 100);
  }, [expandedRepositories, allPullRequests, onPRClick, reactFlowNodes]);


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