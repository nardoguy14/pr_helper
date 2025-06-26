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
  ReactFlowInstance,
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

const ReactFlowMindMapInner: React.FC<ReactFlowMindMapProps> = ({
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
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  // Debug: Log whenever nodes change
  // useEffect(() => {
  //   console.log('NODES CHANGED:', reactFlowNodes.length, 'nodes:', reactFlowNodes.map(n => n.id));
  // }, [reactFlowNodes]);
  
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
    const teamRadius = Math.min(width, height) * 0.4; // Increased for better team spacing
    const repoRadius = Math.min(width, height) * 0.6; // Increased for better repository spacing
    
    setNodes(currentNodes => {
      const nodeMap = new Map(currentNodes.map(node => [node.id, node]));
      const processedNodeIds = new Set<string>(); // Track processed nodes to prevent duplicates
      const updatedNodes: Node[] = [];
      
      // FIRST: Filter teams to only those that actually have content to show
      const visibleTeams = teams.filter(team => {
        const teamKey = `${team.organization}/${team.team_name}`;
        const teamPRs = allTeamPullRequests[teamKey];
        // Only show teams that have PRs or are still loading
        return !teamPRs || teamPRs.length > 0;
      });
      
      // NOW calculate positions based on the FILTERED/VISIBLE teams, not the full input set
      const currentTeamIds = visibleTeams.map(t => `${t.organization}/${t.team_name}`).sort();
      const existingTeamIds = Array.from(nodeMap.keys()).filter(id => 
        visibleTeams.some(t => `${t.organization}/${t.team_name}` === id)
      ).sort();
      
      // Check if the set of VISIBLE teams has changed
      const teamSetChanged = currentTeamIds.length !== existingTeamIds.length || 
                            !currentTeamIds.every((id, index) => id === existingTeamIds[index]);
      
      console.log('🎯 ReactFlowMindMap positioning based on VISIBLE teams:', {
        inputTeams: teams.length,
        visibleTeams: visibleTeams.length,
        currentTeamIds,
        teamSetChanged
      });
      
      // Update or add team nodes based on VISIBLE teams only
      visibleTeams.forEach((team, teamIndex) => {
        const teamKey = `${team.organization}/${team.team_name}`;
        
        // Skip if already processed
        if (processedNodeIds.has(teamKey)) return;
        processedNodeIds.add(teamKey);
        
        const existingNode = nodeMap.get(teamKey);
        
        if (existingNode) {
          // Only recalculate position if team set changed, otherwise preserve position
          let position = existingNode.position;
          if (teamSetChanged) {
            const teamAngle = (teamIndex / visibleTeams.length) * 2 * Math.PI;
            const teamX = centerX + Math.cos(teamAngle) * teamRadius;
            const teamY = centerY + Math.sin(teamAngle) * teamRadius;
            position = { x: teamX, y: teamY };
          }
          
          updatedNodes.push({
            ...existingNode,
            position: position,
            data: {
              ...existingNode.data,
              team: team,
              isExpanded: expandedTeams.has(teamKey),
            },
          });
        } else {
          // Create new node with calculated position
          const teamAngle = (teamIndex / visibleTeams.length) * 2 * Math.PI;
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
      
      // FIRST: Filter repositories to only those that actually have content to show
      const visibleRepositories = repositories.filter(repo => {
        const repoPRs = allPullRequests[repo.repository.full_name];
        // Only show repositories that have PRs or are still loading
        return !repoPRs || repoPRs.length > 0;
      });
      
      // NOW calculate positions based on VISIBLE repositories
      const currentRepoIds = visibleRepositories.map(r => r.repository.full_name).sort();
      const existingRepoIds = Array.from(nodeMap.keys()).filter(id => 
        visibleRepositories.some(r => r.repository.full_name === id)
      ).sort();
      
      // Check if the set of VISIBLE repositories has changed
      const repoSetChanged = currentRepoIds.length !== existingRepoIds.length || 
                            !currentRepoIds.every((id, index) => id === existingRepoIds[index]);
      
      console.log('🎯 ReactFlowMindMap positioning based on VISIBLE repositories:', {
        inputRepos: repositories.length,
        visibleRepos: visibleRepositories.length,
        repoSetChanged
      });
      
      visibleRepositories.forEach((repo, repoIndex) => {
        const repoId = repo.repository.full_name;
        
        // Skip if already processed
        if (processedNodeIds.has(repoId)) return;
        processedNodeIds.add(repoId);
        
        const existingNode = nodeMap.get(repoId);
        const isExpanded = expandedRepositories.has(repoId);
        
        if (existingNode) {
          // Only recalculate position if repo set changed, otherwise preserve position
          let position = existingNode.position;
          if (repoSetChanged) {
            const startAngle = visibleTeams.length > 0 ? Math.PI * 0.25 : 0;
            const angleRange = Math.PI * 1.5;
            const repoAngle = visibleRepositories.length === 1 
              ? startAngle + angleRange / 2 
              : startAngle + (repoIndex / (visibleRepositories.length - 1)) * angleRange;
            const repoX = centerX + Math.cos(repoAngle) * repoRadius;
            const repoY = centerY + Math.sin(repoAngle) * repoRadius;
            position = { x: repoX, y: repoY };
          }
          
          updatedNodes.push({
            ...existingNode,
            position: position,
            data: {
              ...existingNode.data,
              repository: repo,
              isExpanded: isExpanded,
            },
          });
        } else {
          // Create new node with calculated position
          const startAngle = visibleTeams.length > 0 ? Math.PI * 0.25 : 0;
          const angleRange = Math.PI * 1.5;
          const repoAngle = visibleRepositories.length === 1 
            ? startAngle + angleRange / 2 
            : startAngle + (repoIndex / (visibleRepositories.length - 1)) * angleRange;
          const repoX = centerX + Math.cos(repoAngle) * repoRadius;
          const repoY = centerY + Math.sin(repoAngle) * repoRadius;
          
          updatedNodes.push({
            id: repoId,
            type: 'repository',
            position: { x: repoX, y: repoY },
            data: {
              repository: repo,
              isExpanded: isExpanded,
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
            // Skip if already processed
            if (processedNodeIds.has(node.id)) return;
            processedNodeIds.add(node.id);
            
            updatedNodes.push(node);
          }
        }
      });
      
      return updatedNodes;
    });
  }, [teams, repositories, width, height, onTeamClick, onRepositoryClick, expandedTeams, expandedRepositories, allTeamPullRequests, allPullRequests]);

  // Track previous expanded teams to detect actual collapses
  const [prevExpandedTeams, setPrevExpandedTeams] = useState<Set<string>>(new Set());

  // Handle team expansion/collapse by adding/removing repository nodes from teams
  useEffect(() => {
    // console.log('=== TEAM EXPANSION USEEFFECT START ===');
    // console.log('expandedTeams:', Array.from(expandedTeams));
    // console.log('prevExpandedTeams:', Array.from(prevExpandedTeams));

    // Find teams that were just expanded (not in prev but in current)
    const newlyExpandedTeams = Array.from(expandedTeams).filter(team => !prevExpandedTeams.has(team));
    
    // Find teams that were just collapsed (in prev but not in current)
    const newlyCollapsedTeams = Array.from(prevExpandedTeams).filter(team => !expandedTeams.has(team));

    // console.log('Team expansion change - Newly expanded:', newlyExpandedTeams, 'Newly collapsed:', newlyCollapsedTeams);

    // Add repository nodes for newly expanded teams
    newlyExpandedTeams.forEach(teamKey => {
      const team = teams.find(t => `${t.organization}/${t.team_name}` === teamKey);
      if (!team) return;

      const allTeamRepos = teamRepositories[teamKey] || [];
      
      // FILTER: Only include repositories that have PRs after filtering
      const teamPRs = allTeamPullRequests[teamKey] || [];
      const visibleTeamRepos = allTeamRepos.filter(repoName => {
        const repoPRs = teamPRs.filter((pr: any) => pr.repository.full_name === repoName);
        return repoPRs.length > 0; // Only show repos with PRs
      });
      
      console.log(`🎯 Team ${teamKey}: ${allTeamRepos.length} total repos → ${visibleTeamRepos.length} visible repos with PRs`);
      
      // Skip if no visible repositories
      if (visibleTeamRepos.length === 0) {
        console.log(`🎯 Skipping ${teamKey} - no repositories with PRs after filtering`);
        return;
      }
      
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
        // Calculate radius based on VISIBLE repos, not all repos
        const baseRepoRadius = Math.min(350, 200 + (visibleTeamRepos.length * 15));
        
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

        const validRepoNodes = visibleTeamRepos
          .map((repoName, repoIndex) => {
            // Calculate optimal spread angle based on VISIBLE repos count
            const minAnglePerRepo = Math.PI / 5; // 36 degrees minimum per repo (increased)
            const desiredSpread = minAnglePerRepo * visibleTeamRepos.length;
            const maxSpread = Math.PI * 1.4; // 252 degrees max (increased spread)
            const spreadAngle = Math.min(desiredSpread, maxSpread);
            
            // Start branching outward from center (away from other teams)
            const baseAngle = teamAngleFromCenter;
            const angleStep = visibleTeamRepos.length > 1 ? spreadAngle / (visibleTeamRepos.length - 1) : 0;
            const repoAngle = baseAngle - spreadAngle/2 + (repoIndex * angleStep);
            
            // Dynamic radius - vary radius slightly to create more organic spacing
            const radiusVariation = 30 * Math.sin(repoIndex * 0.7); // Small variation
            const dynamicRepoRadius = baseRepoRadius + radiusVariation;
            
            // Check if this angle would collide with other teams
            let finalAngle = repoAngle;
            const minSafeDistance = Math.PI / 3; // 60 degrees minimum from other teams (increased)
            
            for (const avoidAngle of anglesToAvoid) {
              const angleDiff = Math.abs((finalAngle - avoidAngle + Math.PI) % (2 * Math.PI) - Math.PI);
              if (angleDiff < minSafeDistance) {
                // Adjust angle to avoid collision with larger adjustment
                const adjustment = (minSafeDistance - angleDiff) * 1.5; // Increased adjustment factor
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
              // console.warn('No PR data found for repository:', repoName);
              return null;
            }
            
            // Use the filtered PRs that were passed in (already filtered by date/status/author in App.tsx)
            const filteredRepoPRs = teamPRs.filter((pr: any) => pr.repository.full_name === repoName);
            
            const repoStats = {
              repository: samplePR.repository,
              total_open_prs: filteredRepoPRs.length,
              assigned_to_user: filteredRepoPRs.filter((pr: any) => pr.user_is_assigned).length,
              review_requests: filteredRepoPRs.filter((pr: any) => pr.user_is_requested_reviewer).length,
              code_owner_prs: 0,
              last_updated: new Date().toISOString()
            };

            const isExpanded = expandedRepositories.has(repoNodeId);
            // console.log(`Creating team repo node ${repoNodeId}: isExpanded=${isExpanded}, expandedRepos=`, Array.from(expandedRepositories));
            return {
              id: repoNodeId,
              type: 'repository',
              position: { x: repoX, y: repoY },
              data: {
                repository: repoStats,
                isExpanded: isExpanded,
                onClick: onRepositoryClick,
              },
              sourcePosition: Position.Bottom,
              targetPosition: Position.Top,
              className: 'node-entering',
            };
          })
          .filter((node): node is NonNullable<typeof node> => node !== null);

        // console.log('Adding repository nodes for team:', teamKey, 'Nodes to add:', validRepoNodes.length);
        const newNodes = [...currentNodes, ...validRepoNodes];
        // console.log('Total nodes after adding repos:', newNodes.length, newNodes.map(n => n.id));
        return newNodes;
      });

      // Add edges for the new repository nodes
      setEdges(currentEdges => {
        const hasRepoEdges = currentEdges.some(edge => edge.id.includes(`edge-${teamKey}-`));
        if (hasRepoEdges) return currentEdges; // Already have edges for this team

        const newRepoEdges = visibleTeamRepos.map(repoName => ({
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
    // console.log('Repository expansion useEffect triggered, expandedRepositories:', Array.from(expandedRepositories));
    
    // Only process changes, not recreate everything
    setNodes(currentNodes => {
      // console.log('Current nodes before repo expansion processing:', currentNodes.length, currentNodes.map(n => n.id));
      
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
        
        // For team repository nodes, use team-specific PRs filtered by repository
        // For direct repository nodes, use allPullRequests
        let prs = [];
        if (repoNode.id.includes('-repo-')) {
          // This is a team repository node - use team PRs
          const teamNodeId = repoNode.id.split('-repo-')[0];
          const teamPRs = allTeamPullRequests[teamNodeId] || [];
          prs = teamPRs.filter((pr: any) => pr.repository.full_name === repositoryName);
        } else {
          // This is a direct repository node - use direct repo PRs
          prs = allPullRequests[repositoryName] || [];
        }
        
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

          // Dynamic radius based on number of PRs - more compact for fewer PRs
          const basePRRadius = Math.min(200, 120 + (prs.length * 15));
          const prRadius = basePRRadius;
          
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
        // console.log('No changes needed in repository expansion');
        return currentNodes; // No changes needed
      }

      const finalNodes = [
        ...currentNodes.filter(node => !nodesToRemove.includes(node.id)),
        ...nodesToAdd
      ];
      
      // console.log('Repository expansion: Final nodes:', finalNodes.length, 'added:', nodesToAdd.length, 'removed:', nodesToRemove.length);
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
            
            // For team repository nodes, use team-specific PRs filtered by repository
            // For direct repository nodes, use allPullRequests
            let prs = [];
            if (nodeId.includes('-repo-')) {
              // This is a team repository node - use team PRs
              const teamNodeId = nodeId.split('-repo-')[0];
              const teamPRs = allTeamPullRequests[teamNodeId] || [];
              prs = teamPRs.filter((pr: any) => pr.repository.full_name === repositoryName);
            } else {
              // This is a direct repository node - use direct repo PRs
              prs = allPullRequests[repositoryName] || [];
            }
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

  // Update repository node colors when expandedRepositories changes
  useEffect(() => {
    console.log('Updating repository node colors, expandedRepositories:', Array.from(expandedRepositories));
    
    setNodes(currentNodes => {
      const updatedNodes = currentNodes.map(node => {
        if (node.type === 'repository') {
          const isExpanded = expandedRepositories.has(node.id);
          const currentIsExpanded = node.data.isExpanded;
          
          if (isExpanded !== currentIsExpanded) {
            console.log(`Updating repository node ${node.id}: isExpanded ${currentIsExpanded} -> ${isExpanded}`);
            return {
              ...node,
              data: {
                ...node.data,
                isExpanded: isExpanded,
              }
            };
          }
        }
        return node;
      });
      
      return updatedNodes;
    });
  }, [expandedRepositories, setNodes]);

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

  // Handle ReactFlow initialization
  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
  }, []);

  // Fit view whenever nodes change significantly
  useEffect(() => {
    if (!reactFlowInstance || reactFlowNodes.length === 0) return;
    
    // Small delay to ensure nodes are rendered
    const timeoutId = setTimeout(() => {
      reactFlowInstance.fitView({
        padding: 0.15,
        duration: 800,
        minZoom: 0.3,
        maxZoom: 1.5,
      });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [reactFlowInstance, reactFlowNodes.length]);

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
        onInit={onInit}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.1,
          minZoom: 0.3,
          maxZoom: 2.0,
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
              // Yellow if user needs to take action
              if (pr?.user_is_requested_reviewer || (pr?.status === 'needs_review' && !pr?.user_has_reviewed)) {
                return '#f1c21b';
              }
              // Green for everything else (reviewed or open/not involved)
              return '#198038';
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

// Export the component
export const ReactFlowMindMap = ReactFlowMindMapInner;