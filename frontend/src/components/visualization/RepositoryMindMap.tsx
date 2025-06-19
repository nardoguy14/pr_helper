import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import styled from 'styled-components';
import { RepositoryStats, PullRequest, PR_STATUS_COLORS } from '../../types';

interface RepositoryMindMapProps {
  repositories: RepositoryStats[];
  onRepositoryClick: (repositoryName: string) => void;
  onPRClick?: (pr: PullRequest) => void;
  expandedRepositories: Set<string>;
  allPullRequests: Record<string, PullRequest[]>;
  width?: number;
  height?: number;
}

interface NodeData extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  fullName?: string;
  type: 'repository' | 'pr';
  stats?: RepositoryStats;
  pr?: PullRequest;
  radius: number;
  color: string;
  parentId?: string;
}

interface LinkData extends d3.SimulationLinkDatum<NodeData> {
  source: string | NodeData;
  target: string | NodeData;
}

const Container = styled.div<{ width: number; height: number }>`
  width: ${props => props.width}px;
  height: ${props => props.height}px;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fafbfc;
  position: relative;

  svg {
    display: block;
  }

  .repository-node {
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    
    &:hover {
      stroke-width: 3px;
    }
    
    &.selected {
      stroke: #0366d6;
      stroke-width: 4px;
    }
  }

  .repository-text {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 12px;
    font-weight: 600;
    fill: #24292e;
    text-anchor: middle;
    pointer-events: none;
    user-select: none;
  }

  .stats-text {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 10px;
    fill: #586069;
    text-anchor: middle;
    pointer-events: none;
    user-select: none;
  }

  .tooltip {
    position: absolute;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    max-width: 250px;
  }

  .zoom-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 100;
  }

  .zoom-button {
    background: white;
    border: 1px solid #d0d7de;
    border-radius: 4px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    color: #24292e;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    
    &:hover {
      background: #f6f8fa;
    }
  }
`;

export const RepositoryMindMap: React.FC<RepositoryMindMapProps> = ({
  repositories,
  onRepositoryClick,
  onPRClick,
  expandedRepositories,
  allPullRequests,
  width = 800,
  height = 600
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const getRepositoryColor = (repo: RepositoryStats): string => {
    if (repo.review_requests > 0) {
      return PR_STATUS_COLORS.needs_review;
    } else if (repo.assigned_to_user > 0) {
      return '#0366d6';
    } else if (repo.total_open_prs > 0) {
      return '#28a745';
    } else {
      return '#6a737d';
    }
  };

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

  const createRepositoryTooltipContent = (stats: RepositoryStats): string => {
    return `
      <strong>${stats.repository.full_name}</strong><br/>
      Total PRs: ${stats.total_open_prs}<br/>
      Review Requests: ${stats.review_requests}<br/>
      Assigned to You: ${stats.assigned_to_user}<br/>
      Code Owner PRs: ${stats.code_owner_prs}<br/>
      Last Updated: ${new Date(stats.last_updated).toLocaleTimeString()}
    `;
  };

  const createPRTooltipContent = (pr: PullRequest): string => {
    return `
      <strong>PR #${pr.number}</strong><br/>
      ${pr.title}<br/>
      Status: ${pr.status}<br/>
      Author: ${pr.user.login}<br/>
      Created: ${new Date(pr.created_at).toLocaleDateString()}
    `;
  };

  const handleZoomIn = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 1.5);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 0.67);
    }
  };

  const handleResetZoom = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(500)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  };

  // Split into separate effects for better performance
  
  // Initial setup effect - only runs when repositories change
  useEffect(() => {
    if (!svgRef.current || repositories.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    // Add zoom behavior (only once)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        svg.select('.main-group').attr('transform', event.transform);
      });

    zoomRef.current = zoom;
    svg.call(zoom as any);

    // Create main group for all elements
    svg.append('g').attr('class', 'main-group');
  }, [repositories, width, height]);

  // Data update effect - runs when PR data or expansion state changes
  useEffect(() => {
    if (!svgRef.current || repositories.length === 0) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select('.main-group');

    // Calculate node radius based on total PRs
    const maxPRs = d3.max(repositories, d => d.total_open_prs) || 1;
    const minRepoRadius = 30;
    const maxRepoRadius = 80;
    const prRadius = 20;
    
    const radiusScale = d3.scaleSqrt()
      .domain([0, maxPRs])
      .range([minRepoRadius, maxRepoRadius]);

    // Create repository nodes
    const repoNodes: NodeData[] = repositories.map(repo => ({
      id: repo.repository.full_name,
      name: repo.repository.name,
      fullName: repo.repository.full_name,
      type: 'repository' as const,
      stats: repo,
      radius: radiusScale(repo.total_open_prs),
      color: getRepositoryColor(repo)
    }));

    // Create PR nodes for all expanded repositories
    const prNodes: NodeData[] = [];
    expandedRepositories.forEach(repoName => {
      const repoFull = repositories.find(r => r.repository.full_name === repoName);
      if (repoFull && allPullRequests[repoName]) {
        const pullRequests = allPullRequests[repoName];
        pullRequests.forEach(pr => {
          prNodes.push({
            id: `pr-${repoName}-${pr.number}`,
            name: `#${pr.number}`,
            type: 'pr' as const,
            pr: pr,
            radius: prRadius,
            color: getPRColor(pr),
            parentId: repoName
          });
        });
      }
    });

    // Combine all nodes and set initial positions
    const nodes: NodeData[] = [...repoNodes, ...prNodes];
    
    // Set initial positions for new nodes
    nodes.forEach(node => {
      if (!node.x && !node.y) {
        if (node.type === 'repository') {
          // Position repositories randomly around center
          const angle = Math.random() * 2 * Math.PI;
          const radius = 50 + Math.random() * 100;
          node.x = width / 2 + Math.cos(angle) * radius;
          node.y = height / 2 + Math.sin(angle) * radius;
        } else if (node.type === 'pr' && node.parentId) {
          // Position PR nodes near their parent repository
          const parentNode = nodes.find(n => n.id === node.parentId);
          if (parentNode && parentNode.x && parentNode.y) {
            const angle = Math.random() * 2 * Math.PI;
            const radius = 80 + Math.random() * 40;
            node.x = parentNode.x + Math.cos(angle) * radius;
            node.y = parentNode.y + Math.sin(angle) * radius;
          } else {
            node.x = width / 2;
            node.y = height / 2;
          }
        }
      }
    });

    // Create links between repositories and their PRs
    const links: LinkData[] = prNodes.map(prNode => ({
      source: prNode.parentId!,
      target: prNode.id
    }));

    // Update links with enter/exit pattern
    const linksSelection = g.selectAll('.link')
      .data(links, (d: any) => `${d.source}-${d.target}`);

    // Remove exiting links
    linksSelection.exit()
      .transition()
      .duration(300)
      .attr('stroke-opacity', 0)
      .remove();

    // Add new links
    linksSelection.enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', '#999')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0)
      .transition()
      .duration(300)
      .attr('stroke-opacity', 0.6);

    // Update node groups with enter/exit pattern
    const nodeGroups = g.selectAll('.node-group')
      .data(nodes, (d: any) => d.id);

    // Remove exiting nodes
    const exitingNodes = nodeGroups.exit();
    exitingNodes.transition()
      .duration(300)
      .attr('transform', 'scale(0)')
      .style('opacity', 0)
      .remove();

    // Add new node groups
    const enteringNodes = nodeGroups.enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .attr('transform', d => `translate(${d.x || width/2},${d.y || height/2}) scale(0)`)
      .style('opacity', 0);

    // Merge entering and existing nodes
    const allNodes = enteringNodes.merge(nodeGroups as any);

    // Animate new nodes in
    enteringNodes.transition()
      .duration(300)
      .attr('transform', d => `translate(${d.x || width/2},${d.y || height/2}) scale(1)`)
      .style('opacity', 1);

    // Create or update simulation
    const simulation = d3.forceSimulation<NodeData>(nodes)
      .force('charge', d3.forceManyBody().strength((d: any) => {
        if (d.type === 'repository') return -1000;
        return -300; // PR nodes
      }))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<NodeData>().radius(d => d.radius + 20))
      .force('link', links.length > 0 ? d3.forceLink<NodeData, LinkData>(links)
        .id(d => d.id)
        .distance(120)
        .strength(0.5) : null)
      .force('x', d3.forceX().strength(0.1))
      .force('y', d3.forceY().strength(0.1));

    // Add circles only for new nodes
    enteringNodes.append('circle')
      .attr('class', d => `${d.type}-node`)
      .attr('r', d => d.radius)
      .attr('fill', d => d.color)
      .attr('stroke', d => d.type === 'repository' && d.fullName && expandedRepositories.has(d.fullName) ? '#0366d6' : '#fff')
      .attr('stroke-width', d => d.type === 'repository' && d.fullName && expandedRepositories.has(d.fullName) ? 4 : 2);

    // Add text labels only for new nodes
    enteringNodes.append('text')
      .attr('class', 'node-text')
      .attr('dy', d => d.type === 'repository' ? '-0.3em' : '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.type === 'repository' ? '12px' : '10px')
      .attr('font-weight', d => d.type === 'repository' ? 'bold' : 'normal')
      .attr('fill', d => d.type === 'repository' ? '#24292e' : '#fff')
      .text(d => d.name);

    // Add stats text for new repository nodes only
    enteringNodes.filter(d => d.type === 'repository')
      .append('text')
      .attr('class', 'stats-text')
      .attr('dy', '1.2em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#586069')
      .text(d => d.stats ? `${d.stats.total_open_prs} PRs` : '');

    // Add review count for new repository nodes with reviews > 0
    enteringNodes.filter((d: NodeData) => {
      return d.type === 'repository' && d.stats !== undefined && (d.stats.review_requests || 0) > 0;
    })
      .append('text')
      .attr('class', 'review-text')
      .attr('dy', '2.4em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#d73a49')
      .text((d: NodeData) => d.stats ? `${d.stats.review_requests || 0} reviews` : '');

    // Update existing nodes' stroke to reflect expansion state
    allNodes.select('circle')
      .transition()
      .duration(200)
      .attr('stroke', d => d.type === 'repository' && d.fullName && expandedRepositories.has(d.fullName) ? '#0366d6' : '#fff')
      .attr('stroke-width', d => d.type === 'repository' && d.fullName && expandedRepositories.has(d.fullName) ? 4 : 2);

    // Add drag behavior
    const drag = d3.drag<any, NodeData>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    // Add interaction handlers to all nodes (new and existing)
    allNodes
      .call(drag as any)
      .on('click', (event, d) => {
        // Prevent click during drag
        if (event.defaultPrevented) return;
        
        if (d.type === 'repository' && d.fullName) {
          onRepositoryClick(d.fullName);
        } else if (d.type === 'pr' && d.pr && onPRClick) {
          onPRClick(d.pr);
        }
      })
      .on('mouseover', (event, d) => {
        const tooltipContent = d.type === 'repository' && d.stats 
          ? createRepositoryTooltipContent(d.stats)
          : d.type === 'pr' && d.pr 
          ? createPRTooltipContent(d.pr)
          : '';
        
        if (tooltipContent && containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          setTooltip({
            x: event.clientX - containerRect.left,
            y: event.clientY - containerRect.top,
            content: tooltipContent
          });
        }
      })
      .on('mousemove', (event) => {
        if (tooltip && containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          setTooltip(prev => prev ? { 
            ...prev, 
            x: event.clientX - containerRect.left, 
            y: event.clientY - containerRect.top 
          } : null);
        }
      })
      .on('mouseout', () => {
        setTooltip(null);
      });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      // Update node positions for all nodes
      allNodes
        .attr('transform', d => `translate(${d.x},${d.y})`);
      
      // Update link positions
      g.selectAll('.link')
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
    });

    return () => {
      if (simulation) {
        simulation.stop();
      }
    };
  }, [expandedRepositories, allPullRequests, onRepositoryClick, onPRClick]);

  return (
    <Container ref={containerRef} width={width} height={height}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
      />
      <div className="zoom-controls">
        <button className="zoom-button" onClick={handleZoomIn} title="Zoom In">
          +
        </button>
        <button className="zoom-button" onClick={handleZoomOut} title="Zoom Out">
          −
        </button>
        <button className="zoom-button" onClick={handleResetZoom} title="Reset Zoom" style={{ fontSize: '14px' }}>
          ⌂
        </button>
      </div>
      {tooltip && (
        <div
          className="tooltip"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y - 10
          }}
          dangerouslySetInnerHTML={{ __html: tooltip.content }}
        />
      )}
    </Container>
  );
};