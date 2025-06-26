import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { Calendar } from 'lucide-react';

interface DateRangeFilterProps {
  pullRequests: Array<{ created_at: string }>;
  filteredPullRequests?: Array<{ created_at: string }>;
  visiblePRCount?: number;
  onDateChange: (startDate: Date | null, endDate: Date | null) => void;
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

const DateInputContainer = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
`;

const DateInputWrapper = styled.div`
  flex: 1;
`;

const DateLabel = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #586069;
  margin-bottom: 4px;
`;

const DateInput = styled.input`
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
  
  &::-webkit-calendar-picker-indicator {
    cursor: pointer;
  }
`;

const DateSeparator = styled.div`
  color: #586069;
  font-size: 14px;
  padding-top: 20px;
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

const PRCount = styled.div`
  text-align: center;
  margin-top: 12px;
  font-size: 13px;
  color: #586069;

  strong {
    color: #24292e;
    font-weight: 600;
  }
`;

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ 
  pullRequests, 
  filteredPullRequests,
  visiblePRCount,
  onDateChange 
}) => {
  // Calculate default dates (last week)
  const getDefaultDates = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    return { startDate, endDate };
  };

  const { defaultStartDate, defaultEndDate } = useMemo(() => {
    const { startDate, endDate } = getDefaultDates();
    return { defaultStartDate: startDate, defaultEndDate: endDate };
  }, []);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  // Calculate date range from PRs
  const { minDate, maxDate } = useMemo(() => {
    if (!pullRequests || pullRequests.length === 0) {
      const now = new Date();
      return { 
        minDate: now, 
        maxDate: now
      };
    }

    const dates = pullRequests
      .map(pr => new Date(pr.created_at))
      .filter(date => !isNaN(date.getTime()));

    if (dates.length === 0) {
      const now = new Date();
      return { minDate: now, maxDate: now };
    }

    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    
    return {
      minDate: sorted[0],
      maxDate: sorted[sorted.length - 1]
    };
  }, [pullRequests]);

  // Use provided visible count or calculate based on date range
  const displayCount = useMemo(() => {
    if (visiblePRCount !== undefined) {
      return visiblePRCount;
    }
    
    // Fallback: count PRs in date range
    return pullRequests.filter(pr => {
      const prDate = new Date(pr.created_at);
      return prDate >= startDate && prDate <= endDate;
    }).length;
  }, [visiblePRCount, pullRequests, startDate, endDate]);


  // Format date for input value
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = new Date(e.target.value);
    setStartDate(newStartDate);
    onDateChange(newStartDate, endDate);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = new Date(e.target.value);
    setEndDate(newEndDate);
    onDateChange(startDate, newEndDate);
  };

  const handleReset = () => {
    const { startDate: defaultStart, endDate: defaultEnd } = getDefaultDates();
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
    onDateChange(defaultStart, defaultEnd);
  };

  const getActiveRange = () => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDateNormalized = new Date(endDate);
    endDateNormalized.setHours(0, 0, 0, 0);
    const isEndToday = endDateNormalized.getTime() === today.getTime();
    
    if (isEndToday) {
      if (daysDiff === 6) return 'week'; // 7 days including today
      if (daysDiff === 2) return '3days'; // 3 days including today
      if (daysDiff >= 27 && daysDiff <= 31) return 'month';
    }
    return null;
  };

  const isDefaultRange = () => {
    return getActiveRange() === 'week';
  };

  if (!pullRequests || pullRequests.length === 0) {
    return null;
  }

  return (
    <FilterContainer>
      <FilterHeader>
        <FilterTitle>
          <Calendar size={16} />
          Filter by Creation Date
        </FilterTitle>
        {!isDefaultRange() && (
          <ResetButton onClick={handleReset}>Reset to Last Week</ResetButton>
        )}
      </FilterHeader>
      
      <QuickButtons>
        <QuickButton 
          $active={getActiveRange() === 'week'}
          onClick={() => {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            setStartDate(startDate);
            setEndDate(endDate);
            onDateChange(startDate, endDate);
          }}
        >
          Last Week
        </QuickButton>
        <QuickButton
          $active={getActiveRange() === '3days'}
          onClick={() => {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 3);
            setStartDate(startDate);
            setEndDate(endDate);
            onDateChange(startDate, endDate);
          }}
        >
          Last 3 Days
        </QuickButton>
        <QuickButton
          $active={getActiveRange() === 'month'}
          onClick={() => {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 1);
            setStartDate(startDate);
            setEndDate(endDate);
            onDateChange(startDate, endDate);
          }}
        >
          Last Month
        </QuickButton>
      </QuickButtons>

      <DateInputContainer>
        <DateInputWrapper>
          <DateLabel>Start Date</DateLabel>
          <DateInput
            type="date"
            value={formatDateForInput(startDate)}
            min={formatDateForInput(minDate)}
            max={formatDateForInput(endDate)}
            onChange={handleStartDateChange}
          />
        </DateInputWrapper>
        
        <DateSeparator>to</DateSeparator>
        
        <DateInputWrapper>
          <DateLabel>End Date</DateLabel>
          <DateInput
            type="date"
            value={formatDateForInput(endDate)}
            min={formatDateForInput(startDate)}
            max={formatDateForInput(maxDate)}
            onChange={handleEndDateChange}
          />
        </DateInputWrapper>
      </DateInputContainer>

      <PRCount>
        Showing <strong>{displayCount}</strong> of <strong>{(() => {
          // Count unique PRs in the total
          const uniquePRs = new Map();
          pullRequests.forEach((pr: any) => {
            const key = `${pr.repository?.full_name || 'unknown'}#${pr.number || pr.created_at}`;
            if (!uniquePRs.has(key)) {
              uniquePRs.set(key, pr);
            }
          });
          return uniquePRs.size;
        })()}</strong> PRs
      </PRCount>
    </FilterContainer>
  );
};