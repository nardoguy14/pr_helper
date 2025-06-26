import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { Users } from 'lucide-react';
import { User, PullRequest } from '../../types';

interface AuthorFilterProps {
  pullRequests: PullRequest[];
  onAuthorsChange: (selectedAuthors: Set<string>) => void;
}

const FilterContainer = styled.div`
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
`;

const FilterHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const FilterTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #24292e;
`;

const QuickButtons = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  justify-content: center;
  flex-wrap: wrap;
`;

const QuickButton = styled.button<{ $active?: boolean }>`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid ${props => props.$active ? '#0366d6' : '#e1e4e8'};
  background: ${props => props.$active ? '#0366d6' : 'white'};
  color: ${props => props.$active ? 'white' : '#24292e'};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    ${props => !props.$active && `
      background: #f6f8fa;
      border-color: #d0d7de;
    `}
  }
`;

const AuthorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 12px;
`;

const AuthorItem = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid ${props => props.$selected ? '#0366d6' : 'transparent'};
  background: ${props => props.$selected ? '#f1f8ff' : 'white'};
  
  &:hover {
    background: ${props => props.$selected ? '#e3f2fd' : '#f6f8fa'};
    border-color: ${props => props.$selected ? '#0366d6' : '#e1e4e8'};
  }
`;

const AuthorAvatar = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #e1e4e8;
`;

const AuthorInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const AuthorLogin = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: #24292e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PRCount = styled.div`
  font-size: 11px;
  color: #586069;
`;

const SearchContainer = styled.div`
  margin-bottom: 12px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 13px;
  color: #24292e;
  background: white;
  
  &:focus {
    outline: none;
    border-color: #0366d6;
    box-shadow: 0 0 0 3px rgba(3, 102, 214, 0.1);
  }
  
  &::placeholder {
    color: #86909c;
  }
`;

const ResetButton = styled.button`
  background: none;
  border: none;
  color: #0366d6;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #f6f8fa;
  }
`;

const FilterSummary = styled.div`
  text-align: center;
  margin-top: 12px;
  font-size: 13px;
  color: #586069;

  strong {
    color: #24292e;
    font-weight: 600;
  }
`;

export const AuthorFilter: React.FC<AuthorFilterProps> = ({ 
  pullRequests, 
  onAuthorsChange 
}) => {
  const [selectedAuthors, setSelectedAuthors] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Extract unique authors with PR counts
  const authors = useMemo(() => {
    const authorMap = new Map<string, { user: User; prCount: number }>();
    
    pullRequests.forEach(pr => {
      if (pr.user) {
        const login = pr.user.login;
        if (authorMap.has(login)) {
          authorMap.get(login)!.prCount++;
        } else {
          authorMap.set(login, { user: pr.user, prCount: 1 });
        }
      }
    });
    
    return Array.from(authorMap.values())
      .sort((a, b) => b.prCount - a.prCount); // Sort by PR count descending
  }, [pullRequests]);

  // Filter authors based on search query
  const filteredAuthors = useMemo(() => {
    if (!searchQuery.trim()) return authors;
    
    const query = searchQuery.toLowerCase();
    return authors.filter(author => 
      author.user.login.toLowerCase().includes(query)
    );
  }, [authors, searchQuery]);

  // Get top authors by PR count
  const topAuthors = useMemo(() => {
    return authors.slice(0, 5).map(a => a.user.login);
  }, [authors]);

  const handleAuthorToggle = (login: string) => {
    const newSelected = new Set(selectedAuthors);
    if (newSelected.has(login)) {
      newSelected.delete(login);
    } else {
      newSelected.add(login);
    }
    setSelectedAuthors(newSelected);
    onAuthorsChange(newSelected);
  };

  const handleSelectAll = () => {
    const allAuthors = new Set(authors.map(a => a.user.login));
    setSelectedAuthors(allAuthors);
    onAuthorsChange(allAuthors);
  };

  const handleSelectNone = () => {
    setSelectedAuthors(new Set());
    onAuthorsChange(new Set());
  };

  const handleSelectTop = () => {
    const topSet = new Set(topAuthors);
    setSelectedAuthors(topSet);
    onAuthorsChange(topSet);
  };

  // Count visible PRs based on selected authors
  const visiblePRCount = useMemo(() => {
    if (selectedAuthors.size === 0) return pullRequests.length; // No filter = show all
    
    return pullRequests.filter(pr => 
      pr.user && selectedAuthors.has(pr.user.login)
    ).length;
  }, [pullRequests, selectedAuthors]);

  if (!pullRequests || pullRequests.length === 0) {
    return null;
  }

  const isAllSelected = selectedAuthors.size === authors.length;
  const isNoneSelected = selectedAuthors.size === 0;
  const isTopSelected = topAuthors.every(login => selectedAuthors.has(login)) && 
                       selectedAuthors.size === topAuthors.length;

  return (
    <FilterContainer>
      <FilterHeader>
        <FilterTitle>
          <Users size={16} />
          Filter by Author
        </FilterTitle>
        {!isNoneSelected && (
          <ResetButton onClick={handleSelectNone}>Clear All</ResetButton>
        )}
      </FilterHeader>
      
      <QuickButtons>
        <QuickButton 
          $active={isNoneSelected}
          onClick={handleSelectNone}
        >
          All Authors
        </QuickButton>
        <QuickButton
          $active={isTopSelected}
          onClick={handleSelectTop}
        >
          Top 5 Contributors
        </QuickButton>
        <QuickButton
          $active={isAllSelected}
          onClick={handleSelectAll}
        >
          Select All
        </QuickButton>
      </QuickButtons>

      <SearchContainer>
        <SearchInput
          type="text"
          placeholder="Search authors by username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </SearchContainer>

      <AuthorGrid>
        {filteredAuthors.map(({ user, prCount }) => (
          <AuthorItem
            key={user.login}
            $selected={selectedAuthors.has(user.login)}
            onClick={() => handleAuthorToggle(user.login)}
          >
            <AuthorAvatar
              src={user.avatar_url}
              alt={user.login}
              onError={(e) => {
                // Fallback to default avatar if image fails to load
                e.currentTarget.src = `https://github.com/identicons/${user.login}.png`;
              }}
            />
            <AuthorInfo>
              <AuthorLogin>{user.login}</AuthorLogin>
              <PRCount>{prCount} PR{prCount !== 1 ? 's' : ''}</PRCount>
            </AuthorInfo>
          </AuthorItem>
        ))}
      </AuthorGrid>

      <FilterSummary>
        Showing <strong>{visiblePRCount}</strong> of <strong>{pullRequests.length}</strong> PRs
        {selectedAuthors.size > 0 && (
          <> from <strong>{selectedAuthors.size}</strong> author{selectedAuthors.size !== 1 ? 's' : ''}</>
        )}
      </FilterSummary>
    </FilterContainer>
  );
};