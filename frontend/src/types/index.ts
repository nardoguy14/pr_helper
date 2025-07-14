// PR and GitHub Types
export interface User {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description?: string;
  private: boolean;
}

export enum PRState {
  OPEN = "open",
  CLOSED = "closed",
  MERGED = "merged"
}

export enum ReviewState {
  PENDING = "pending",
  APPROVED = "approved",
  CHANGES_REQUESTED = "changes_requested",
  DISMISSED = "dismissed"
}

export enum PRStatus {
  OPEN = "open",
  NEEDS_REVIEW = "needs_review",
  REVIEWED = "reviewed",
  WAITING_FOR_CHANGES = "waiting_for_changes",
  READY_TO_MERGE = "ready_to_merge"
}

export interface Review {
  id: number;
  user: User;
  state: ReviewState;
  submitted_at?: string;
  body?: string;
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  description?: string;
  privacy: string;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: PRState;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  user: User;
  assignees: User[];
  requested_reviewers: User[];
  requested_teams: Team[];
  reviews: Review[];
  repository: Repository;
  draft: boolean;
  mergeable?: boolean;
  status: PRStatus;
  user_has_reviewed: boolean;
  user_is_assigned: boolean;
  user_is_requested_reviewer: boolean;
}


// WebSocket Message Types
export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export interface PRUpdateMessage extends WebSocketMessage {
  type: "pr_update";
  data: {
    repository: string;
    update_type: "new_pr" | "updated" | "closed";
    pull_request: PullRequest;
  };
}


// API Request/Response Types

export interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data?: T;
  error?: string;
  detail?: string;
}

// Visualization Types
export interface NodeData {
  id: string;
  type: "pullRequest";
  data: PullRequest;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

export interface LinkData {
  source: string | NodeData;
  target: string | NodeData;
  type: "contains" | "reviews" | "assigns";
}

export interface GraphData {
  nodes: NodeData[];
  links: LinkData[];
}

// UI State Types
export interface AppState {
  pullRequests: PullRequest[];
  isConnected: boolean;
  loading: boolean;
  error: string | null;
}

// Color scheme for PR statuses (GitHub-style)
export const PR_STATUS_COLORS = {
  [PRStatus.OPEN]: "#198038", // Green - open (not involved)
  [PRStatus.NEEDS_REVIEW]: "#f1c21b", // Yellow - needs review
  [PRStatus.REVIEWED]: "#198038", // Green - reviewed
  [PRStatus.WAITING_FOR_CHANGES]: "#da1e28", // Red - changes needed
  [PRStatus.READY_TO_MERGE]: "#0f62fe", // Blue - ready to merge
} as const;

export const PR_STATE_COLORS = {
  [PRState.OPEN]: "#238636", // Green
  [PRState.CLOSED]: "#f85149", // Red
  [PRState.MERGED]: "#8957e5", // Purple
} as const;

// Team Subscription Types
export interface TeamSubscription {
  organization: string;
  team_name: string;
  watch_all_prs: boolean;
  watch_assigned_prs: boolean;
  watch_review_requests: boolean;
}

export interface TeamStats {
  organization: string;
  team_name: string;
  total_open_prs: number;
  assigned_to_user: number;
  review_requests: number;
  last_updated: string;
  enabled: boolean;
}

export interface TeamSubscriptionRequest {
  organization: string;
  team_name: string;
  watch_all_prs?: boolean;
  watch_assigned_prs?: boolean;
  watch_review_requests?: boolean;
}

// Subscription Types
export type SubscriptionType = 'repository' | 'team'; // repository inactive but kept for compatibility

export interface SubscriptionItem {
  type: SubscriptionType;
  id: string; // org/team
  data: TeamStats;
}

// API Response Types for Teams
export interface SubscribeTeamResponse {
  success: boolean;
  message: string;
  subscription?: TeamSubscription;
}

export interface UnsubscribeTeamRequest {
  organization: string;
  team_name: string;
}

export interface GetTeamsResponse {
  teams: TeamStats[];
  total_count: number;
}

export interface GetTeamPullRequestsResponse {
  pull_requests: PullRequest[];
  organization: string;
  team_name: string;
  total_count: number;
}