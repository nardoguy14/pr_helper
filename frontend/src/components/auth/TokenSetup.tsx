import React, { useState } from 'react';
import styled from 'styled-components';
import { Eye, EyeOff, ExternalLink, Check, AlertCircle, Loader } from 'lucide-react';

interface TokenSetupProps {
  onTokenSet: (token: string, userInfo: any) => void;
  isVisible: boolean;
  setToken: (token: string) => Promise<{ success: boolean; user?: any; error?: string }>;
}

const Overlay = styled.div<{ $visible: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: ${props => props.$visible ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
`;

const Title = styled.h2`
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: #24292e;
`;

const Description = styled.p`
  margin: 0 0 24px 0;
  color: #586069;
  line-height: 1.5;
`;

const TokenInput = styled.div`
  position: relative;
  margin-bottom: 16px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 48px 12px 16px;
  border: 1px solid #d1d5da;
  border-radius: 6px;
  font-size: 14px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
  
  &:focus {
    outline: none;
    border-color: #0366d6;
    box-shadow: 0 0 0 3px rgba(3, 102, 214, 0.1);
  }
  
  &::placeholder {
    color: #a0a9b8;
  }
`;

const ToggleButton = styled.button`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #586069;
  padding: 4px;
  
  &:hover {
    color: #24292e;
  }
`;

const InstructionsLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #0366d6;
  text-decoration: none;
  font-size: 14px;
  margin-bottom: 24px;
  
  &:hover {
    text-decoration: underline;
  }
`;

const RequiredScopes = styled.div`
  background: #f6f8fa;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 24px;
`;

const ScopesTitle = styled.h4`
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: #24292e;
`;

const ScopesList = styled.ul`
  margin: 0;
  padding-left: 20px;
  color: #586069;
  font-size: 14px;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const Button = styled.button<{ $primary?: boolean; $disabled?: boolean }>`
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
  
  ${props => props.$primary ? `
    background: #2da44e;
    color: white;
    border-color: #2da44e;
    
    &:hover:not(:disabled) {
      background: #2c974b;
    }
    
    &:disabled {
      background: #94d3a2;
      cursor: not-allowed;
    }
  ` : `
    background: white;
    color: #24292e;
    border-color: #d1d5da;
    
    &:hover:not(:disabled) {
      background: #f6f8fa;
    }
    
    &:disabled {
      background: #f6f8fa;
      color: #959da5;
      cursor: not-allowed;
    }
  `}
`;

const StatusMessage = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  
  ${props => {
    switch (props.$type) {
      case 'success':
        return `
          background: #dcfce7;
          color: #166534;
          border: 1px solid #bbf7d0;
        `;
      case 'error':
        return `
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        `;
      case 'info':
        return `
          background: #dbeafe;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
        `;
    }
  }}
`;

export const TokenSetup: React.FC<TokenSetupProps> = ({ onTokenSet, isVisible, setToken: authSetToken }) => {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      setStatus({ type: 'error', message: 'Please enter a GitHub token' });
      return;
    }

    setIsValidating(true);
    setStatus(null);

    try {
      console.log('TokenSetup: Starting token validation...');
      const result = await authSetToken(token.trim());
      console.log('TokenSetup: Auth result:', result);
      
      if (result.success) {
        console.log('TokenSetup: Token validation successful, user:', result.user);
        setStatus({ type: 'success', message: `Welcome, ${result.user?.login || 'User'}!` });
        onTokenSet(token.trim(), result.user);
      } else {
        console.error('TokenSetup: Token validation failed:', result.error);
        setStatus({ type: 'error', message: result.error || 'Token validation failed' });
      }
    } catch (error) {
      console.error('TokenSetup: Exception during token validation:', error);
      setStatus({ type: 'error', message: 'Network error. Please check your connection and try again.' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleCancel = () => {
    setToken('');
    setShowToken(false);
    setStatus(null);
  };

  return (
    <Overlay $visible={isVisible}>
      <Modal>
        <Title>GitHub Authentication Required</Title>
        <Description>
          To monitor pull requests, you need to provide a GitHub personal access token.
          This token is stored securely and only used to access GitHub's API.
        </Description>

        <InstructionsLink 
          href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
          target="_blank"
          rel="noopener noreferrer"
        >
          How to create a GitHub token <ExternalLink size={14} />
        </InstructionsLink>

        <RequiredScopes>
          <ScopesTitle>Required Token Scopes:</ScopesTitle>
          <ScopesList>
            <li><strong>repo</strong> - Access to repository data and pull requests</li>
            <li><strong>user</strong> - Access to user profile information</li>
          </ScopesList>
        </RequiredScopes>

        <form onSubmit={handleSubmit}>
          {status && (
            <StatusMessage $type={status.type}>
              {status.type === 'success' && <Check size={16} />}
              {status.type === 'error' && <AlertCircle size={16} />}
              {status.type === 'info' && <AlertCircle size={16} />}
              {status.message}
            </StatusMessage>
          )}

          <TokenInput>
            <Input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              disabled={isValidating}
            />
            <ToggleButton
              type="button"
              onClick={() => setShowToken(!showToken)}
              disabled={isValidating}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </ToggleButton>
          </TokenInput>

          <ButtonGroup>
            <Button type="button" onClick={handleCancel} $disabled={isValidating}>
              Cancel
            </Button>
            <Button type="submit" $primary $disabled={isValidating || !token.trim()}>
              {isValidating && <Loader size={16} className="animate-spin" />}
              {isValidating ? 'Validating...' : 'Authenticate'}
            </Button>
          </ButtonGroup>
        </form>
      </Modal>
    </Overlay>
  );
};