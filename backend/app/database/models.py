from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.database.database import Base
from typing import List, Optional
from datetime import datetime


class RepositorySubscription(Base):
    __tablename__ = "repository_subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    repository_name = Column(String(255), unique=True, index=True, nullable=False)
    watch_all_prs = Column(Boolean, default=False)
    watch_assigned_prs = Column(Boolean, default=True)
    watch_review_requests = Column(Boolean, default=True)
    watch_code_owner_prs = Column(Boolean, default=False)
    teams = Column(JSON, default=list)  # List of team names
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TeamSubscription(Base):
    __tablename__ = "team_subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    organization = Column(String(255), nullable=False)
    team_name = Column(String(255), nullable=False)
    watch_all_prs = Column(Boolean, default=True)
    watch_assigned_prs = Column(Boolean, default=True)
    watch_review_requests = Column(Boolean, default=True)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Ensure unique team per organization
    __table_args__ = ()


class TeamStats(Base):
    __tablename__ = "team_stats"
    
    id = Column(Integer, primary_key=True, index=True)
    organization = Column(String(255), nullable=False)
    team_name = Column(String(255), nullable=False)
    total_open_prs = Column(Integer, default=0)
    assigned_to_user = Column(Integer, default=0)
    review_requests = Column(Integer, default=0)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Ensure unique stats per team
    __table_args__ = ()


class RepositoryStats(Base):
    __tablename__ = "repository_stats"
    
    id = Column(Integer, primary_key=True, index=True)
    repository_name = Column(String(255), unique=True, index=True, nullable=False)
    total_open_prs = Column(Integer, default=0)
    assigned_to_user = Column(Integer, default=0)
    review_requests = Column(Integer, default=0)
    code_owner_prs = Column(Integer, default=0)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PullRequest(Base):
    __tablename__ = "pull_requests"
    
    id = Column(Integer, primary_key=True, index=True)
    github_id = Column(Integer, unique=True, index=True, nullable=False)
    number = Column(Integer, nullable=False)
    repository_name = Column(String(255), index=True, nullable=False)
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    state = Column(String(50), nullable=False)
    html_url = Column(String(500), nullable=False)
    author_login = Column(String(255), index=True, nullable=False)
    author_avatar_url = Column(String(500), nullable=True)
    
    # Important status fields
    draft = Column(Boolean, default=False)
    user_is_assigned = Column(Boolean, default=False)
    user_is_requested_reviewer = Column(Boolean, default=False, index=True)
    user_has_reviewed = Column(Boolean, default=False)
    status = Column(String(50), index=True)  # needs_review, reviewed, waiting_for_changes
    
    # PR metadata
    additions = Column(Integer, default=0)
    deletions = Column(Integer, default=0)
    changed_files = Column(Integer, default=0)
    mergeable_state = Column(String(50), nullable=True)
    review_decision = Column(String(50), nullable=True)
    
    # Team associations (comma-separated list of teams that care about this PR)
    associated_teams = Column(Text, nullable=True)
    
    # Timestamps
    github_created_at = Column(DateTime(timezone=True), nullable=False)
    github_updated_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Store the full PR data as JSON for any additional fields we might need
    pr_data = Column(JSON, nullable=False)