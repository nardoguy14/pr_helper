#!/usr/bin/env python3
import sys
import asyncio
import httpx
import json
from datetime import datetime

# Read token
with open('token.txt', 'r') as f:
    token = f.read().strip()

class HybridService:
    """Uses REST API for team discovery, GraphQL for efficient PR fetching"""
    def __init__(self):
        self.client = httpx.AsyncClient()
        self.api_call_count = 0
        self.total_bytes = 0
        
    async def close(self):
        await self.client.aclose()
    
    async def get_user_teams(self):
        """Get user's teams via REST API"""
        response = await self.client.get(
            "https://api.github.com/user/teams",
            headers={"Authorization": f"token {token}"}
        )
        self.api_call_count += 1
        self.total_bytes += len(response.content)
        
        teams = response.json()
        result = []
        for team in teams:
            result.append({
                "organization": team["organization"]["login"],
                "name": team["name"], 
                "slug": team["slug"]
            })
        return result
    
    async def get_team_prs_graphql(self, organization, team_slug):
        """Get team PRs efficiently via GraphQL"""
        
        # First get team members via GraphQL
        members_query = """
        query($org: String!, $team: String!) {
          organization(login: $org) {
            team(slug: $team) {
              members(first: 100) {
                nodes {
                  login
                }
              }
            }
          }
        }
        """
        
        response = await self.client.post(
            "https://api.github.com/graphql",
            json={
                "query": members_query,
                "variables": {"org": organization, "team": team_slug}
            },
            headers={"Authorization": f"token {token}"}
        )
        self.api_call_count += 1
        self.total_bytes += len(response.content)
        
        data = response.json()
        if "errors" in data:
            print(f"   Error getting members: {data['errors']}")
            return []
        
        members = data["data"]["organization"]["team"]["members"]["nodes"]
        member_logins = [m["login"] for m in members]
        
        print(f"   Found {len(member_logins)} team members")
        
        # Build search query for PRs
        author_query = " ".join([f"author:{login}" for login in member_logins])
        search_query = f"org:{organization} type:pr state:open {author_query}"
        
        # Get PRs with all details in one GraphQL call
        prs_query = """
        query($searchQuery: String!) {
          search(query: $searchQuery, type: ISSUE, first: 100) {
            issueCount
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
        """
        
        response = await self.client.post(
            "https://api.github.com/graphql",
            json={
                "query": prs_query,
                "variables": {"searchQuery": search_query}
            },
            headers={"Authorization": f"token {token}"}
        )
        self.api_call_count += 1
        self.total_bytes += len(response.content)
        
        data = response.json()
        if "errors" in data:
            print(f"   Error getting PRs: {data['errors']}")
            return []
        
        prs = data["data"]["search"]["nodes"]
        issue_count = data["data"]["search"]["issueCount"]
        
        print(f"   Found {len(prs)} PRs (total matching search: {issue_count})")
        return prs

async def main():
    print("Testing Hybrid REST + GraphQL Approach")
    print("=" * 50)
    
    service = HybridService()
    start_time = datetime.now()
    
    try:
        # Get user's teams via REST
        print("1. Getting user's teams (REST API)...")
        teams = await service.get_user_teams()
        print(f"   Found {len(teams)} teams:")
        for team in teams:
            print(f"   - {team['organization']}/{team['slug']}")
        
        # Get PRs for each team via GraphQL
        all_prs = []
        for team in teams[:2]:  # Test first 2 teams
            print(f"\n2. Getting PRs for {team['organization']}/{team['slug']} (GraphQL)...")
            prs = await service.get_team_prs_graphql(team['organization'], team['slug'])
            all_prs.extend(prs)
        
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
        # REST would need: 1 teams call + (2 team members + 2 searches + PRs*2)
        estimated_rest_calls = 1 + (len(teams[:2]) * 2) + (len(all_prs) * 2)
        efficiency_gain = estimated_rest_calls / service.api_call_count if service.api_call_count > 0 else 0
        print(f"   Estimated pure REST API calls: {estimated_rest_calls}")
        print(f"   Hybrid approach efficiency: {efficiency_gain:.1f}x fewer API calls")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await service.close()

if __name__ == "__main__":
    asyncio.run(main())