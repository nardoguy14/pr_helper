import React from 'react';
import styled from 'styled-components';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  error?: string | null;
  className?: string;
}

const StatusContainer = styled.div<{ $isConnected: boolean; $hasError: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  
  ${props => {
    if (props.$hasError) {
      return `
        background: #fff5f5;
        color: #c53030;
        border: 1px solid #fed7d7;
      `;
    }
    
    if (props.$isConnected) {
      return `
        background: #f0fff4;
        color: #2f855a;
        border: 1px solid #c6f6d5;
      `;
    }
    
    return `
      background: #fffbf0;
      color: #d69e2e;
      border: 1px solid #feebc8;
    `;
  }}
`;

const StatusIcon = styled.div`
  display: flex;
  align-items: center;
`;

const StatusText = styled.span`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
`;

const PulsingDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
  margin-left: 4px;
  
  @keyframes pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      opacity: 1;
    }
  }
`;

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  error,
  className
}) => {
  const hasError = Boolean(error);
  
  const getIcon = () => {
    if (hasError) {
      return <AlertCircle size={16} />;
    }
    
    if (isConnected) {
      return <Wifi size={16} />;
    }
    
    return <WifiOff size={16} />;
  };
  
  const getText = () => {
    if (hasError) {
      return `Connection Error: ${error}`;
    }
    
    if (isConnected) {
      return 'Connected';
    }
    
    return 'Connecting...';
  };
  
  return (
    <StatusContainer 
      $isConnected={isConnected} 
      $hasError={hasError}
      className={className}
    >
      <StatusIcon>
        {getIcon()}
      </StatusIcon>
      <StatusText>
        {getText()}
      </StatusText>
      {!isConnected && !hasError && <PulsingDot />}
    </StatusContainer>
  );
};