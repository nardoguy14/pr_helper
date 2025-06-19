import React, { useCallback, useMemo, useEffect, useRef } from 'react';
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

import { RepositoryStats, PullRequest } from '../../types';
import { RepositoryNode } from './nodes/RepositoryNode';
import { PRNode } from './nodes/PRNode';

interface ReactFlowMindMapProps {
  repositories: RepositoryStats[];
  onRepositoryClick: (repositoryName: string) => void;
  onPRClick?: (pr: PullRequest) => void;
  expandedRepositories: Set<string>;
  allPullRequests: Record<string, PullRequest[]>;
  width?: number;
  height?: number;
}

const Container = styled.div<{ width: number; height: number }>`
  width: ${props => props.width}px;
  height: ${props => props.height}px;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
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

  /* Custom fade animation for edges */
  @keyframes fadeInOut {
    0% { stroke-opacity: 0.3; }
    50% { stroke-opacity: 0.9; }
    100% { stroke-opacity: 0.3; }
  }

  .react-flow__edge path {
    stroke-dasharray: 5,5;
    animation: fadeInOut 2s ease-in-out infinite;
  }
`;

const nodeTypes: NodeTypes = {
  repository: RepositoryNode,
  pr: PRNode,
};

export const ReactFlowMindMap: React.FC<ReactFlowMindMapProps> = ({
  repositories,
  onRepositoryClick,
  onPRClick,
  expandedRepositories,
  allPullRequests,
  width = 800,
  height = 600
}) => {
  const [reactFlowNodes, setNodes, onNodesChange] = useNodesState([]);
  const [reactFlowEdges, setEdges, onEdgesChange] = useEdgesState([]);
  const animationTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      animationTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  // Convert data to React Flow format
  const { nodes, edges } = useMemo(() => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Create repository nodes
    repositories.forEach((repo, index) => {
      const angle = (index / repositories.length) * 2 * Math.PI;
      const radius = Math.min(width, height) * 0.2;
      const centerX = width / 2;
      const centerY = height / 2;

      flowNodes.push({
        id: repo.repository.full_name,
        type: 'repository',
        position: {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        },
        data: {
          repository: repo,
          isExpanded: expandedRepositories.has(repo.repository.full_name),
          onClick: onRepositoryClick,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        className: 'node-visible',
      });

      // Create PR nodes if repository is expanded
      if (expandedRepositories.has(repo.repository.full_name)) {
        const pullRequests = allPullRequests[repo.repository.full_name] || [];
        
        pullRequests.forEach((pr, prIndex) => {
          // Create a fan pattern around the repository
          const fanAngle = (prIndex / Math.max(pullRequests.length - 1, 1)) * Math.PI - Math.PI / 2;
          const prRadius = 180;
          
          // Position PR nodes in a semicircle around the repository
          const repoX = centerX + Math.cos(angle) * radius;
          const repoY = centerY + Math.sin(angle) * radius;
          
          flowNodes.push({
            id: `pr-${repo.repository.full_name}-${pr.number}`,
            type: 'pr',
            position: {
              x: repoX + Math.cos(angle + fanAngle) * prRadius,
              y: repoY + Math.sin(angle + fanAngle) * prRadius,
            },
            data: {
              pullRequest: pr,
              onClick: onPRClick,
            },
            sourcePosition: Position.Left,
            targetPosition: Position.Right,
            className: 'node-entering',
          });

          // Create edge between repository and PR with fade animation
          flowEdges.push({
            id: `edge-${repo.repository.full_name}-${pr.number}`,
            source: repo.repository.full_name,
            target: `pr-${repo.repository.full_name}-${pr.number}`,
            type: 'straight',
            animated: true,
            className: 'edge-entering',
            style: {
              stroke: '#999',
              strokeWidth: 2,
            },
          });
        });
      }
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [repositories, expandedRepositories, allPullRequests, onRepositoryClick, onPRClick, width, height]);

  // Handle smooth animations when nodes/edges change
  useEffect(() => {
    // Clear existing timeouts
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current.clear();

    // Set nodes immediately (some with entering class)
    setNodes(nodes);
    setEdges(edges);

    // Create staggered animations for PR nodes
    const prNodes = nodes.filter(node => node.id.startsWith('pr-'));
    const prEdges = edges.filter(edge => edge.id.startsWith('edge-'));

    if (prNodes.length > 0) {
      // Animate PR nodes in sequence
      prNodes.forEach((node, index) => {
        const timeout = setTimeout(() => {
          setNodes(currentNodes => 
            currentNodes.map(n => 
              n.id === node.id 
                ? { ...n, className: 'node-visible' }
                : n
            )
          );
        }, 100 + (index * 150)); // Stagger by 150ms each

        animationTimeouts.current.add(timeout);
      });

      // Animate edges after nodes with proper timing
      prEdges.forEach((edge, index) => {
        const timeout = setTimeout(() => {
          setEdges(currentEdges => 
            currentEdges.map(e => 
              e.id === edge.id 
                ? { ...e, className: 'edge-visible' }
                : e
            )
          );
        }, 250 + (index * 150)); // Start after nodes finish, same stagger as nodes

        animationTimeouts.current.add(timeout);
      });
    }
  }, [nodes, edges, setNodes, setEdges]);

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
    <Container width={width} height={height}>
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
            return '#999';
          }}
          nodeColor={(node) => {
            if (node.type === 'repository') {
              return '#fff';
            }
            if (node.type === 'pr') {
              const pr = node.data?.pullRequest;
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