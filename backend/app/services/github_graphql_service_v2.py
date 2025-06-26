import httpx
from typing import List, Dict, Any, Optional, Set
from datetime import datetime
import logging

from app.models.pr_models import PullRequest, Repository, User, Review, Team
from app.services.token_service import token_service

logger = logging.getLogger(__name__)

class GitHubGraphQLServiceV2:
    """Optimized GraphQL service that only fetches data for user's teams"""
    
    def __init__(self):
        self.client = httpx.AsyncClient(
            headers={
                "Accept": "application/vnd.github.v3+json",
            }
        )
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()
    
    async def get_user_teams(self) -> List[Dict[str, str]]:
        """Get teams that the authenticated user belongs to"""
        if not token_service.token:
            raise ValueError("GitHub token not set")
        token = token_service.token
        
        query = """
        query {
          viewer {
            organizations(first: 10) {
              nodes {
                login
                teams(first: 100, userLogins: [$login]) {
                  nodes {
                    name
                    slug
                  }
                }
              }
            }
            login
          }
        }
        """
        
        # First get the user's login
        user_query = """
        query {
          viewer {
            login
          }
        }
        """
        
        response = await self.client.post(
            "https://api.github.com/graphql",
            json={"query": user_query},
            headers={"Authorization": f"token {token}"}
        )
        response.raise_for_status()
        
        user_data = response.json()
        user_login = user_data["data"]["viewer"]["login"]
        
        # Now get user's teams
        teams_query = """
        query($userLogin: String!) {
          viewer {
            organizations(first: 10) {
              nodes {
                login
                teams(first: 100, userLogins: [$userLogin]) {
                  nodes {
                    name
                    slug
                  }
                }
              }
            }
          }
        }
        """
        
        response = await self.client.post(
            "https://api.github.com/graphql",
            json={
                "query": teams_query,
                "variables": {"userLogin": user_login}
            },
            headers={"Authorization": f"token {token}"}
        )
        response.raise_for_status()
        
        data = response.json()
        teams = []
        
        for org in data["data"]["viewer"]["organizations"]["nodes"]:
            org_login = org["login"]
            for team in org["teams"]["nodes"]:
                teams.append({
                    "organization": org_login,
                    "name": team["name"],
                    "slug": team["slug"]
                })
        
        logger.info(f"Found {len(teams)} teams for user")
        return teams
    
    async def get_team_pull_requests(self, organization: str, team_slug: str) -> List[PullRequest]:
        """Get all PRs for a specific team with pagination"""
        if not token_service.token:
            raise ValueError("GitHub token not set")
        token = token_service.token
        
        # Query to get team members and their PRs
        query = """
        query($org: String!, $team: String!, $memberCursor: String) {
          organization(login: $org) {
            team(slug: $team) {
              members(first: 50, after: $memberCursor) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  login
                  name
                }
              }
            }
          }
        }
        """
        
        all_members = []
        member_cursor = None
        
        # First, get all team members with pagination
        while True:
            response = await self.client.post(
                "https://api.github.com/graphql",
                json={
                    "query": query,
                    "variables": {
                        "org": organization,
                        "team": team_slug,
                        "memberCursor": member_cursor
                    }
                },
                headers={"Authorization": f"token {token}"}
            )
            response.raise_for_status()
            
            data = response.json()
            if "errors" in data:
                logger.error(f"GraphQL errors: {data['errors']}")
                raise Exception(f"GraphQL query failed: {data['errors']}")
            
            team_data = data["data"]["organization"]["team"]
            members = team_data["members"]
            
            all_members.extend(members["nodes"])
            
            if not members["pageInfo"]["hasNextPage"]:
                break
            
            member_cursor = members["pageInfo"]["endCursor"]
        
        logger.info(f"Found {len(all_members)} members in team {organization}/{team_slug}")
        
        # Now get PRs for these members
        member_logins = [m["login"] for m in all_members]
        all_prs = []
        
        # GitHub search is limited to ~30 authors per query, so batch them
        batch_size = 20
        for i in range(0, len(member_logins), batch_size):
            batch = member_logins[i:i + batch_size]
            logger.info(f"Fetching PRs for batch of {len(batch)} authors: {batch}")
            prs = await self._fetch_prs_for_authors(batch, organization)
            logger.info(f"Found {len(prs)} PRs for this batch")
            all_prs.extend(prs)
        
        # Deduplicate PRs (in case of co-authored PRs)
        unique_prs = {}
        for pr in all_prs:
            key = f"{pr.repository.full_name}#{pr.number}"
            unique_prs[key] = pr
        
        logger.info(f"Found {len(unique_prs)} unique PRs for team {organization}/{team_slug}")
        return list(unique_prs.values())
    
    async def _fetch_prs_for_authors(self, authors: List[str], organization: str) -> List[PullRequest]:
        """Fetch PRs for a batch of authors using search API with GraphQL"""
        if not token_service.token:
            raise ValueError("GitHub token not set")
        token = token_service.token
        
        # Build search query - include all PR states but limit to recent activity
        # Sort by updated to get most recently active PRs first
        # Include PRs updated in the last 2 weeks to avoid too much old data
        # Explicitly include merged PRs by using is:merged OR is:open OR is:closed
        from datetime import datetime, timedelta
        two_weeks_ago = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')
        author_query = " ".join([f"author:{author}" for author in authors])
        search_query = f"org:{organization} type:pr {author_query} updated:>={two_weeks_ago} sort:updated"
        logger.info(f"GraphQL search query: {search_query}")
        
        query = """
        query($searchQuery: String!, $cursor: String) {
          search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              ... on PullRequest {
                number
                title
                body
                url
                state
                createdAt
                updatedAt
                isDraft
                repository {
                  id
                  name
                  owner {
                    login
                  }
                  url
                  description
                  isPrivate
                }
                author {
                  login
                  ... on User {
                    name
                    avatarUrl
                  }
                }
                assignees(first: 10) {
                  nodes {
                    login
                    name
                    avatarUrl
                    url
                  }
                }
                reviewRequests(first: 10) {
                  nodes {
                    requestedReviewer {
                      ... on User {
                        login
                        name
                        avatarUrl
                        url
                      }
                      ... on Team {
                        id
                        name
                        slug
                        description
                        privacy
                      }
                    }
                  }
                }
                reviews(first: 20) {
                  nodes {
                    author {
                      login
                      ... on User {
                        name
                        avatarUrl
                        url
                      }
                    }
                    state
                    submittedAt
                  }
                }
                labels(first: 10) {
                  nodes {
                    name
                  }
                }
              }
            }
          }
        }
        """
        
        all_prs = []
        cursor = None
        
        # Paginate through results
        while True:
            response = await self.client.post(
                "https://api.github.com/graphql",
                json={
                    "query": query,
                    "variables": {
                        "searchQuery": search_query,
                        "cursor": cursor
                    }
                },
                headers={"Authorization": f"token {token}"}
            )
            response.raise_for_status()
            
            data = response.json()
            if "errors" in data:
                logger.error(f"GraphQL errors: {data['errors']}")
                raise Exception(f"GraphQL query failed: {data['errors']}")
            
            search_results = data["data"]["search"]
            pr_nodes = search_results["nodes"]
            logger.info(f"GraphQL search returned {len(pr_nodes)} PR nodes")
            
            for pr_data in pr_nodes:
                # Log PR details to debug why merged PRs might not show
                pr_number = pr_data.get("number", "unknown")
                pr_state = pr_data.get("state", "unknown")
                pr_repo = pr_data.get("repository", {}).get("name", "unknown")
                logger.info(f"Processing PR #{pr_number} in {pr_repo}: state={pr_state}")
                
                pr = self._convert_graphql_pr(pr_data)
                all_prs.append(pr)
            
            if not search_results["pageInfo"]["hasNextPage"]:
                break
            
            cursor = search_results["pageInfo"]["endCursor"]
        
        logger.info(f"Total PRs found for authors {authors}: {len(all_prs)}")
        return all_prs
    
    def _determine_pr_state(self, pr_data: Dict[str, Any]) -> str:
        """Determine PR state from GraphQL data"""
        github_state = pr_data.get("state", "OPEN")
        
        # Log the state we're getting from GitHub
        logger.info(f"PR #{pr_data.get('number', 'unknown')}: GitHub state = {github_state}")
        
        # Convert GitHub GraphQL state to our enum values
        if github_state == "MERGED":
            return "merged"
        elif github_state == "CLOSED":
            return "closed"
        else:  # OPEN or any other state
            return "open"
    
    def _convert_graphql_pr(self, pr_data: Dict[str, Any]) -> PullRequest:
        """Convert GraphQL PR data to our PullRequest model"""
        
        # Create repository object
        repository = Repository(
            id=0,  # Use placeholder since GraphQL returns base64 encoded IDs
            full_name=f"{pr_data['repository']['owner']['login']}/{pr_data['repository']['name']}",
            name=pr_data["repository"]["name"],
            html_url=pr_data["repository"]["url"],
            description=pr_data["repository"].get("description"),
            private=pr_data["repository"]["isPrivate"]
        )
        
        # Extract author
        author = None
        if pr_data.get("author"):
            author = User(
                id=0,  # GraphQL doesn't return user ID in search results, use placeholder
                login=pr_data["author"]["login"],
                avatar_url=pr_data["author"].get("avatarUrl", ""),
                html_url=f"https://github.com/{pr_data['author']['login']}"
            )
        
        # Extract assignees
        assignees = []
        for assignee in pr_data.get("assignees", {}).get("nodes", []):
            assignees.append(User(
                id=0,  # Placeholder
                login=assignee["login"],
                avatar_url=assignee.get("avatarUrl", ""),
                html_url=assignee.get("url", f"https://github.com/{assignee['login']}")
            ))
        
        # Extract requested reviewers and teams
        requested_reviewers = []
        requested_teams = []
        for req in pr_data.get("reviewRequests", {}).get("nodes", []):
            reviewer = req.get("requestedReviewer")
            if reviewer:
                # Check if it's a user or team
                if "login" in reviewer:  # User
                    requested_reviewers.append(User(
                        id=0,  # Placeholder
                        login=reviewer["login"],
                        avatar_url=reviewer.get("avatarUrl", ""),
                        html_url=reviewer.get("url", f"https://github.com/{reviewer['login']}")
                    ))
                elif "slug" in reviewer:  # Team
                    # Store GitHub's node ID in github_id field, use 0 as placeholder for id
                    requested_teams.append(Team(
                        id=0,  # Placeholder integer ID
                        github_id=reviewer.get("id", ""),  # GitHub GraphQL node ID
                        name=reviewer["name"],
                        slug=reviewer["slug"],
                        description=reviewer.get("description", ""),
                        privacy=reviewer.get("privacy", "")
                    ))
        
        # Extract reviews and keep only the latest from each reviewer
        all_reviews = []
        review_nodes = pr_data.get("reviews", {}).get("nodes", [])
        logger.info(f"PR #{pr_data['number']} has {len(review_nodes)} review nodes from GraphQL")
        
        # First, convert all reviews
        for review in review_nodes:
            if review.get("author"):
                github_state = review.get("state", "")
                
                # Skip COMMENTED reviews - they're not actual reviews, just comments
                if github_state == "COMMENTED":
                    logger.info(f"PR #{pr_data['number']} - Skipping comment from {review['author']['login']} (not a review)")
                    continue
                
                # Convert GitHub review state to our enum
                state_mapping = {
                    "APPROVED": "approved",
                    "CHANGES_REQUESTED": "changes_requested",
                    "DISMISSED": "dismissed",
                    "PENDING": "pending"
                }
                review_state = state_mapping.get(github_state, "pending")
                
                logger.info(f"PR #{pr_data['number']} - Review from {review['author']['login']}: GitHub state '{github_state}' → our state '{review_state}'")
                
                review_obj = Review(
                    id=0,  # Placeholder
                    user=User(
                        id=0,  # Placeholder
                        login=review["author"]["login"],
                        avatar_url=review["author"].get("avatarUrl", ""),
                        html_url=review["author"].get("url", f"https://github.com/{review['author']['login']}")
                    ),
                    state=review_state,
                    submitted_at=datetime.fromisoformat(review["submittedAt"].replace("Z", "+00:00"))
                )
                all_reviews.append(review_obj)
        
        # Keep only the latest review from each reviewer
        latest_reviews_by_user = {}
        for review in all_reviews:
            user_login = review.user.login
            if user_login not in latest_reviews_by_user or review.submitted_at > latest_reviews_by_user[user_login].submitted_at:
                latest_reviews_by_user[user_login] = review
        
        # Include all reviews (let frontend decide what to display)
        reviews = []
        for review in latest_reviews_by_user.values():
            reviews.append(review)
            logger.info(f"Added latest review from {review.user.login} with state {review.state} for PR #{pr_data['number']}")
        
        # Extract labels
        labels = [label["name"] for label in pr_data.get("labels", {}).get("nodes", [])]
        
        # Determine review status
        latest_reviews = {}
        for review in reviews:
            latest_reviews[review.user.login] = review.state
        
        has_approval = any(state == "approved" for state in latest_reviews.values())
        needs_changes = any(state == "changes_requested" for state in latest_reviews.values())
        
        if needs_changes:
            status = "waiting_for_changes"
        elif has_approval:
            status = "reviewed"
        else:
            status = "needs_review"
        
        return PullRequest(
            id=0,  # Placeholder - GraphQL search doesn't return PR ID
            number=pr_data["number"],
            title=pr_data["title"],
            body=pr_data.get("body", ""),
            state=self._determine_pr_state(pr_data),
            html_url=pr_data["url"],
            created_at=datetime.fromisoformat(pr_data["createdAt"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(pr_data["updatedAt"].replace("Z", "+00:00")),
            user=author,
            assignees=assignees,
            requested_reviewers=requested_reviewers,
            requested_teams=requested_teams,
            reviews=reviews,
            repository=repository,
            draft=pr_data.get("isDraft", False),  # Map GraphQL isDraft to draft field
            status=status,
            user_is_assigned=False,  # Will be set by the scheduler
            user_is_requested_reviewer=False,  # Will be set by the scheduler
            user_has_reviewed=False  # Will be set by the scheduler
        )