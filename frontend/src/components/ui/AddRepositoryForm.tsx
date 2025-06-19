import React, { useState } from 'react';
import styled from 'styled-components';
import { Plus, X, Loader2 } from 'lucide-react';
import { SubscribeRepositoryRequest } from '../../types';

interface AddRepositoryFormProps {
  onSubmit: (request: SubscribeRepositoryRequest) => Promise<void>;
  onCancel: () => void;
  isVisible: boolean;
}

const Overlay = styled.div<{ isVisible: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: ${props => props.isVisible ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 500px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #24292e;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  
  &:hover {
    background: #f6f8fa;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-weight: 600;
  color: #24292e;
  font-size: 14px;
`;

const Input = styled.input`
  padding: 8px 12px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: #0969da;
    box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
`;

const CheckboxItem = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #24292e;
`;

const Checkbox = styled.input`
  margin: 0;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid;
  display: flex;
  align-items: center;
  gap: 6px;
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .spinner {
    animation: spin 1s linear infinite;
  }
  
  ${props => props.$variant === 'primary' ? `
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
    background: #f6f8fa;
    color: #24292e;
    border-color: #d0d7de;
    
    &:hover {
      background: #f3f4f6;
    }
  `}
`;

const Description = styled.p`
  margin: 0;
  font-size: 12px;
  color: #656d76;
`;

export const AddRepositoryForm: React.FC<AddRepositoryFormProps> = ({
  onSubmit,
  onCancel,
  isVisible
}) => {
  const [formData, setFormData] = useState({
    repository_name: '',
    watch_all_prs: false,
    watch_assigned_prs: true,
    watch_review_requests: true,
    watch_code_owner_prs: false,
    teams: [] as string[]
  });

  const [teamsInput, setTeamsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return; // Prevent double submission
    
    setIsSubmitting(true);
    
    try {
      const teams = teamsInput
        .split(',')
        .map(team => team.trim())
        .filter(team => team.length > 0);

      await onSubmit({
        ...formData,
        teams
      });

      // Reset form only on success
      setFormData({
        repository_name: '',
        watch_all_prs: false,
        watch_assigned_prs: true,
        watch_review_requests: true,
        watch_code_owner_prs: false,
        teams: []
      });
      setTeamsInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!isVisible) return null;

  return (
    <Overlay isVisible={isVisible} onClick={onCancel}>
      <Modal onClick={e => e.stopPropagation()}>
        <Header>
          <Title>Subscribe to Repository</Title>
          <CloseButton onClick={onCancel}>
            <X size={20} />
          </CloseButton>
        </Header>

        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label htmlFor="repository_name">Repository Name</Label>
            <Input
              id="repository_name"
              type="text"
              placeholder="owner/repository (e.g., facebook/react)"
              value={formData.repository_name}
              onChange={e => handleInputChange('repository_name', e.target.value)}
              required
            />
            <Description>
              Enter the full repository name including the owner (e.g., "facebook/react")
            </Description>
          </FormGroup>

          <FormGroup>
            <Label>Watch Options</Label>
            <CheckboxGroup>
              <CheckboxItem>
                <Checkbox
                  type="checkbox"
                  checked={formData.watch_all_prs}
                  onChange={e => handleInputChange('watch_all_prs', e.target.checked)}
                />
                Watch all pull requests
              </CheckboxItem>
              
              <CheckboxItem>
                <Checkbox
                  type="checkbox"
                  checked={formData.watch_assigned_prs}
                  onChange={e => handleInputChange('watch_assigned_prs', e.target.checked)}
                />
                Watch PRs assigned to me
              </CheckboxItem>
              
              <CheckboxItem>
                <Checkbox
                  type="checkbox"
                  checked={formData.watch_review_requests}
                  onChange={e => handleInputChange('watch_review_requests', e.target.checked)}
                />
                Watch PRs where I'm requested as reviewer
              </CheckboxItem>
              
              <CheckboxItem>
                <Checkbox
                  type="checkbox"
                  checked={formData.watch_code_owner_prs}
                  onChange={e => handleInputChange('watch_code_owner_prs', e.target.checked)}
                />
                Watch PRs where my team is a code owner
              </CheckboxItem>
            </CheckboxGroup>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="teams">Teams (optional)</Label>
            <Input
              id="teams"
              type="text"
              placeholder="team1, team2, team3"
              value={teamsInput}
              onChange={e => setTeamsInput(e.target.value)}
            />
            <Description>
              Comma-separated list of team names for code owner notifications
            </Description>
          </FormGroup>

          <ButtonGroup>
            <Button type="button" $variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={isSubmitting || !formData.repository_name}>
              {isSubmitting ? <Loader2 size={16} className="spinner" /> : <Plus size={16} />}
              {isSubmitting ? 'Adding...' : 'Add Repository'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
};