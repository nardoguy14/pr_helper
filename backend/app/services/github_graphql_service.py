import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

from app.models.pr_models import PullRequest, Repository, User, Review
from app.services.token_service import get_github_token

logger = logging.getLogger(__name__)

class GitHubGraphQLService:
    """Service for interacting with GitHub GraphQL API v4"""
    
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url="https://api.github.com/graphql",
            headers={
                "Accept": "application/vnd.github.v3+json",
            }
        )
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()
    
    async def get_organization_pull_requests(self, organization: str) -> Dict[str, List[PullRequest]]:
        """
        Get all open pull requests for an entire organization.
        Returns a dict mapping team names to their PRs.
        """
        token = get_github_token()
        if not token:
            raise ValueError("GitHub token not set")
        
        # GraphQL query to fetch all org data in one request
        query = """
        query($org: String!, $cursor: String) {
          organization(login: $org) {
            teams(first: 100, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                name
                slug
                members(first: 100) {
                  nodes {
                    login
                    name
                  }
                }
              }
            }
            repositories(first: 100) {
              nodes {
                name
                owner {
                  login
                }
                pullRequests(states: OPEN, first: 100) {
                  nodes {
                    number
                    title
                    body
                    url
                    createdAt
                    updatedAt
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
                      }
                    }
                    reviewRequests(first: 10) {
                      nodes {
                        requestedReviewer {
                          ... on User {
                            login
                            name
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
          }
        }
        """
        
        try:
            # Execute GraphQL query
            response = await self.client.post(
                "",
                json={
                    "query": query,
                    "variables": {"org": organization}
                },
                headers={"Authorization": f"token {token}"}
            )
            response.raise_for_status()
            
            data = response.json()
            if "errors" in data:
                logger.error(f"GraphQL errors: {data['errors']}")
                raise Exception(f"GraphQL query failed: {data['errors']}")
            
            org_data = data["data"]["organization"]
            
            # Build team member mapping
            team_members = {}
            for team in org_data["teams"]["nodes"]:
                team_key = f"{organization}/{team['slug']}"
                team_members[team_key] = {
                    member["login"] for member in team["members"]["nodes"]
                }
            
            # Process all PRs and assign to teams
            team_prs = {team_key: [] for team_key in team_members}
            all_prs = []
            
            for repo in org_data["repositories"]["nodes"]:
                repo_obj = Repository(
                    full_name=f"{repo['owner']['login']}/{repo['name']}",
                    name=repo["name"],
                    owner=repo["owner"]["login"]
                )
                
                for pr_data in repo["pullRequests"]["nodes"]:
                    pr = self._convert_graphql_pr(pr_data, repo_obj)
                    all_prs.append(pr)
                    
                    # Assign PR to teams based on author
                    if pr.user:
                        for team_key, members in team_members.items():
                            if pr.user.login in members:
                                team_prs[team_key].append(pr)
            
            logger.info(f"Fetched {len(all_prs)} PRs across {len(team_prs)} teams with 1 API call")
            return team_prs
            
        except Exception as e:
            logger.error(f"Failed to fetch organization PRs: {e}")
            raise
    
    def _convert_graphql_pr(self, pr_data: Dict[str, Any], repository: Repository) -> PullRequest:
        """Convert GraphQL PR data to our PullRequest model"""
        
        # Extract author
        author = None
        if pr_data.get("author"):
            author = User(
                login=pr_data["author"]["login"],
                name=pr_data["author"].get("name"),
                avatar_url=pr_data["author"].get("avatarUrl")
            )
        
        # Extract assignees
        assignees = []
        for assignee in pr_data.get("assignees", {}).get("nodes", []):
            assignees.append(User(
                login=assignee["login"],
                name=assignee.get("name")
            ))
        
        # Extract requested reviewers
        requested_reviewers = []
        for req in pr_data.get("reviewRequests", {}).get("nodes", []):
            reviewer = req.get("requestedReviewer")
            if reviewer:
                requested_reviewers.append(User(
                    login=reviewer["login"],
                    name=reviewer.get("name")
                ))
        
        # Extract reviews
        reviews = []
        for review in pr_data.get("reviews", {}).get("nodes", []):
            if review.get("author"):
                reviews.append(Review(
                    user=User(
                        login=review["author"]["login"],
                        name=review["author"].get("name")
                    ),
                    state=review["state"],
                    submitted_at=datetime.fromisoformat(review["submittedAt"].replace("Z", "+00:00"))
                ))
        
        # Extract labels
        labels = [label["name"] for label in pr_data.get("labels", {}).get("nodes", [])]
        
        # Determine review status
        latest_reviews = {}
        for review in reviews:
            if review.state in ["APPROVED", "CHANGES_REQUESTED"]:
                latest_reviews[review.user.login] = review.state
        
        has_approval = any(state == "APPROVED" for state in latest_reviews.values())
        needs_changes = any(state == "CHANGES_REQUESTED" for state in latest_reviews.values())
        
        if needs_changes:
            status = "waiting_for_changes"
        elif has_approval:
            status = "reviewed"
        else:
            status = "needs_review"
        
        return PullRequest(
            number=pr_data["number"],
            title=pr_data["title"],
            body=pr_data.get("body", ""),
            user=author,
            html_url=pr_data["url"],
            created_at=datetime.fromisoformat(pr_data["createdAt"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(pr_data["updatedAt"].replace("Z", "+00:00")),
            assignees=assignees,
            requested_reviewers=requested_reviewers,
            labels=labels,
            repository=repository,
            reviews=reviews,
            status=status,
            user_is_assigned=False,  # Will be set by the scheduler
            user_is_requested_reviewer=False,  # Will be set by the scheduler
            user_has_reviewed=False  # Will be set by the scheduler
        )