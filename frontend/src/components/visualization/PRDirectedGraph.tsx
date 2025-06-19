import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import styled from 'styled-components';
import { PullRequest, PR_STATUS_COLORS, PR_STATE_COLORS, PRStatus, PRState } from '../../types';

interface PRDirectedGraphProps {
  pullRequests: PullRequest[];
  repositoryName: string;
  onPRClick?: (pr: PullRequest) => void;
  width?: number;
  height?: number;
}

interface PRNodeData extends d3.SimulationNodeDatum {
  id: string;
  pr: PullRequest;
  radius: number;
  color: string;
  textColor: string;
}

interface PRLinkData extends d3.SimulationLinkDatum<PRNodeData> {
  source: PRNodeData;
  target: PRNodeData;
  type: 'reviews' | 'assigns' | 'related';
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

  .pr-node {
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    
    &:hover {
      stroke-width: 3px;
      filter: brightness(1.1);
    }
  }

  .pr-text {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 10px;
    font-weight: 500;
    text-anchor: middle;
    pointer-events: none;
    user-select: none;
  }

  .pr-number {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    font-weight: 600;
    text-anchor: middle;
    pointer-events: none;
    user-select: none;
  }

  .pr-link {
    stroke: #d0d7de;
    stroke-width: 1;
    fill: none;
    opacity: 0.6;
  }

  .tooltip {
    position: absolute;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 12px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    max-width: 300px;
    line-height: 1.4;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .header {
    padding: 16px;
    background: white;
    border-bottom: 1px solid #e1e4e8;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
  }

  .header h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: #24292e;
  }

  .header p {
    margin: 0;
    font-size: 14px;
    color: #586069;
  }
`;

export const PRDirectedGraph: React.FC<PRDirectedGraphProps> = ({
  pullRequests,
  repositoryName,
  onPRClick,
  width = 800,
  height = 600
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  useEffect(() => {
    if (!svgRef.current || pullRequests.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    // Create node data
    const nodes: PRNodeData[] = pullRequests.map(pr => ({
      id: pr.number.toString(),
      pr,
      radius: calculateNodeRadius(pr),
      color: getPRColor(pr),
      textColor: getTextColor(pr)
    }));

    // Create link data (simplified - you can expand this to show actual relationships)
    const links: PRLinkData[] = [];
    
    // Add links between PRs that share reviewers
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const pr1 = nodes[i].pr;
        const pr2 = nodes[j].pr;
        
        // Check if they share reviewers
        const sharedReviewers = pr1.requested_reviewers.filter(reviewer1 =>
          pr2.requested_reviewers.some(reviewer2 => reviewer1.id === reviewer2.id)
        );
        
        if (sharedReviewers.length > 0) {
          links.push({
            source: nodes[i],
            target: nodes[j],
            type: 'reviews'
          });
        }
      }
    }

    // Create simulation
    const simulation = d3.forceSimulation<PRNodeData>(nodes)
      .force('link', d3.forceLink<PRNodeData, PRLinkData>(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<PRNodeData>().radius(d => d.radius + 5));

    // Create links
    const linkElements = svg.selectAll('.pr-link')
      .data(links)
      .join('line')
      .attr('class', 'pr-link')
      .attr('stroke-dasharray', d => d.type === 'reviews' ? '3,3' : 'none');

    // Create node groups
    const nodeGroups = svg.selectAll('.pr-group')
      .data(nodes)
      .join('g')
      .attr('class', 'pr-group')
      .style('cursor', 'pointer');

    // Add circles
    nodeGroups.append('circle')
      .attr('class', 'pr-node')
      .attr('r', d => d.radius)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add PR numbers
    nodeGroups.append('text')
      .attr('class', 'pr-number')
      .attr('dy', '-0.2em')
      .attr('fill', d => d.textColor)
      .text(d => `#${d.pr.number}`);

    // Add status indicators
    nodeGroups.filter(d => d.pr.draft)
      .append('text')
      .attr('class', 'pr-text')
      .attr('dy', '1.5em')
      .attr('fill', d => d.textColor)
      .text('DRAFT');

    // Add interaction handlers
    nodeGroups
      .on('click', (event, d) => {
        if (onPRClick) {
          onPRClick(d.pr);
        } else {
          window.open(d.pr.html_url, '_blank');
        }
      })
      .on('mouseover', (event, d) => {
        const tooltipContent = createTooltipContent(d.pr);
        setTooltip({
          x: event.pageX,
          y: event.pageY,
          content: tooltipContent
        });
      })
      .on('mousemove', (event) => {
        if (tooltip) {
          setTooltip(prev => prev ? { ...prev, x: event.pageX, y: event.pageY } : null);
        }
      })
      .on('mouseout', () => {
        setTooltip(null);
      });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      linkElements
        .attr('x1', d => (d.source as PRNodeData).x!)
        .attr('y1', d => (d.source as PRNodeData).y!)
        .attr('x2', d => (d.target as PRNodeData).x!)
        .attr('y2', d => (d.target as PRNodeData).y!);

      nodeGroups
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [pullRequests, repositoryName, onPRClick, width, height]);

  const calculateNodeRadius = (pr: PullRequest): number => {
    let baseRadius = 25;
    
    // Increase radius for PRs that need attention
    if (pr.user_is_requested_reviewer) baseRadius += 10;
    if (pr.user_is_assigned) baseRadius += 8;
    if (pr.reviews.length > 3) baseRadius += 5;
    
    return Math.min(baseRadius, 50); // Cap at 50px
  };

  const getPRColor = (pr: PullRequest): string => {
    if (pr.state === PRState.MERGED) return PR_STATE_COLORS[PRState.MERGED];
    if (pr.state === PRState.CLOSED) return PR_STATE_COLORS[PRState.CLOSED];
    
    // For open PRs, use status colors
    return PR_STATUS_COLORS[pr.status] || PR_STATE_COLORS[PRState.OPEN];
  };

  const getTextColor = (pr: PullRequest): string => {
    const color = getPRColor(pr);
    // Use white text for darker colors
    const darkColors = [PR_STATUS_COLORS.reviewed, PR_STATE_COLORS.merged];
    return darkColors.includes(color as any) ? '#ffffff' : '#000000';
  };

  const createTooltipContent = (pr: PullRequest): string => {
    const reviewStatus = pr.reviews.length > 0 ? 
      pr.reviews.map(r => `${r.user.login}: ${r.state}`).join('<br/>') : 
      'No reviews yet';

    return `
      <strong>PR #${pr.number}: ${pr.title}</strong><br/>
      <strong>Author:</strong> ${pr.user.login}<br/>
      <strong>Status:</strong> ${pr.status.replace('_', ' ').toUpperCase()}<br/>
      <strong>State:</strong> ${pr.state.toUpperCase()}<br/>
      <strong>Created:</strong> ${new Date(pr.created_at).toLocaleDateString()}<br/>
      <strong>Updated:</strong> ${new Date(pr.updated_at).toLocaleDateString()}<br/>
      ${pr.assignees.length > 0 ? `<strong>Assignees:</strong> ${pr.assignees.map(a => a.login).join(', ')}<br/>` : ''}
      ${pr.requested_reviewers.length > 0 ? `<strong>Reviewers:</strong> ${pr.requested_reviewers.map(r => r.login).join(', ')}<br/>` : ''}
      <strong>Reviews:</strong><br/>${reviewStatus}<br/>
      ${pr.draft ? '<strong>⚠️ DRAFT</strong><br/>' : ''}
      <em>Click to open in GitHub</em>
    `;
  };

  if (pullRequests.length === 0) {
    return (
      <Container width={width} height={height}>
        <div className="header">
          <h3>{repositoryName}</h3>
          <p>No open pull requests found.</p>
        </div>
      </Container>
    );
  }

  return (
    <Container ref={containerRef} width={width} height={height}>
      <div className="header">
        <h3>{repositoryName}</h3>
        <p>{pullRequests.length} open pull request{pullRequests.length !== 1 ? 's' : ''}</p>
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height - 80}
        style={{ marginTop: 0 }}
      />
      {tooltip && (
        <div
          className="tooltip"
          style={{
            left: Math.min(tooltip.x + 10, width - 320),
            top: Math.max(tooltip.y - 10, 10)
          }}
          dangerouslySetInnerHTML={{ __html: tooltip.content }}
        />
      )}
    </Container>
  );
};