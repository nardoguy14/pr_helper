#!/usr/bin/env python3
import sys
import asyncio
import httpx
import json
from datetime import datetime

# Read token
with open('token.txt', 'r') as f:
    token = f.read().strip()

class TestGraphQLService:
    def __init__(self):
        self.client = httpx.AsyncClient(
            headers={"Accept": "application/vnd.github.v3+json"}
        )
        self.api_call_count = 0
        self.total_bytes = 0
    
    async def close(self):
        await self.client.aclose()
    
    async def get_user_teams(self):
        """Get teams that the authenticated user belongs to"""
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
        self.api_call_count += 1
        self.total_bytes += len(response.content)
        
        data = response.json()
        print(f"   User response: {data}")
        
        if "errors" in data:
            print(f"   User query errors: {data['errors']}")
            return []
            
        user_login = data["data"]["viewer"]["login"]
        
        # Now get user's teams - use simpler approach
        teams_query = """
        query {
          viewer {
            teams(first: 50) {
              nodes {
                name
                slug
                organization {
                  login
                }
              }
            }
          }
        }
        """
        
        response = await self.client.post(
            "https://api.github.com/graphql",
            json={"query": teams_query},
            headers={"Authorization": f"token {token}"}
        )
        self.api_call_count += 1
        self.total_bytes += len(response.content)
        
        data = response.json()
        print(f"   Teams response: {data}")
        
        if "errors" in data:
            print(f"   Teams query errors: {data['errors']}")
            return []
        
        teams = []
        for team in data["data"]["viewer"]["teams"]["nodes"]:
            teams.append({
                "organization": team["organization"]["login"],
                "name": team["name"],
                "slug": team["slug"]
            })
        
        return teams
    
    async def get_team_pull_requests(self, organization, team_slug):
        """Get all PRs for a specific team"""
        # First get team members
        query = """
        query($org: String!, $team: String!) {
          organization(login: $org) {
            team(slug: $team) {
              members(first: 50) {
                nodes {
                  login
                  name
                }
              }
            }
          }
        }
        """
        
        response = await self.client.post(
            "https://api.github.com/graphql",
            json={
                "query": query,
                "variables": {"org": organization, "team": team_slug}
            },
            headers={"Authorization": f"token {token}"}
        )
        self.api_call_count += 1
        self.total_bytes += len(response.content)
        
        data = response.json()
        
        if "errors" in data:
            print(f"Error getting team members: {data['errors']}")
            return []
        
        members = data["data"]["organization"]["team"]["members"]["nodes"]
        member_logins = [m["login"] for m in members]
        
        # Now search for PRs
        author_query = " ".join([f"author:{author}" for author in member_logins[:10]])  # Limit for testing
        search_query = f"org:{organization} type:pr state:open {author_query}"
        
        pr_query = """
        query($searchQuery: String!) {
          search(query: $searchQuery, type: ISSUE, first: 50) {
            nodes {
              ... on PullRequest {
                number
                title
                body
                url
                createdAt
                updatedAt
                repository {
                  name
                  owner {
                    login
                  }
                }
                author {
                  login
                  ... on User {
                    name
                  }
                }
                assignees(first: 5) {
                  nodes {
                    login
                    name
                  }
                }
                reviewRequests(first: 5) {
                  nodes {
                    requestedReviewer {
                      ... on User {
                        login
                        name
                      }
                    }
                  }
                }
                reviews(first: 10) {
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
                labels(first: 5) {
                  nodes {
                    name
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
                "query": pr_query,
                "variables": {"searchQuery": search_query}
            },
            headers={"Authorization": f"token {token}"}
        )
        self.api_call_count += 1
        self.total_bytes += len(response.content)
        
        data = response.json()
        if "errors" in data:
            print(f"Error searching PRs: {data['errors']}")
            return []
        
        prs = data["data"]["search"]["nodes"]
        return prs

async def main():
    print("Testing Optimized GraphQL API Performance")
    print("=" * 50)
    
    service = TestGraphQLService()
    start_time = datetime.now()
    
    try:
        # Get user's teams
        print("1. Getting user's teams...")
        teams = await service.get_user_teams()
        print(f"   Found {len(teams)} teams:")
        for team in teams:
            print(f"   - {team['organization']}/{team['slug']}")
        
        # Get PRs for each team
        all_prs = []
        for team in teams[:2]:  # Test first 2 teams
            print(f"\n2. Getting PRs for {team['organization']}/{team['slug']}...")
            prs = await service.get_team_pull_requests(team['organization'], team['slug'])
            all_prs.extend(prs)
            print(f"   Found {len(prs)} PRs")
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        print(f"\n3. Performance Summary:")
        print(f"   Total API calls: {service.api_call_count}")
        print(f"   Total data transferred: {service.total_bytes:,} bytes ({service.total_bytes / 1024:.1f} KB)")
        print(f"   Average per API call: {service.total_bytes / service.api_call_count:.0f} bytes")
        print(f"   Total time: {duration:.2f} seconds")
        print(f"   Total PRs found: {len(all_prs)}")
        
        if all_prs:
            print(f"   Average data per PR: {service.total_bytes / len(all_prs):.0f} bytes")
        
        print(f"\n4. Comparison to REST API:")
        # Estimated REST calls: 2 team members + 2 searches + (PRs * 2 for details + reviews)
        estimated_rest_calls = 2 + 2 + (len(all_prs) * 2)
        efficiency_gain = estimated_rest_calls / service.api_call_count if service.api_call_count > 0 else 0
        print(f"   Estimated REST API calls for same data: {estimated_rest_calls}")
        print(f"   GraphQL efficiency gain: {efficiency_gain:.1f}x fewer API calls")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await service.close()

if __name__ == "__main__":
    asyncio.run(main())