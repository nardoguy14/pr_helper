#!/usr/bin/env python3
import requests
import json
import sys

# Read token from token.txt
with open('token.txt', 'r') as f:
    token = f.read().strip()

# GraphQL query - same as in the service
query = """
query($org: String!, $cursor: String) {
  organization(login: $org) {
    teams(first: 20, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        name
        slug
        members(first: 50) {
          nodes {
            login
            name
          }
        }
      }
    }
    repositories(first: 50) {
      nodes {
        name
        owner {
          login
        }
        pullRequests(states: OPEN, first: 50) {
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

print("Testing GraphQL API response size for organization: waymark-care")
print("=" * 60)

# Make the request
response = requests.post(
    "https://api.github.com/graphql",
    json={
        "query": query,
        "variables": {"org": "waymark-care"}
    },
    headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
)

# Calculate sizes
response_text = response.text
response_bytes = len(response_text.encode('utf-8'))
response_json = response.json()

# Pretty print JSON for analysis
pretty_json = json.dumps(response_json, indent=2)
pretty_bytes = len(pretty_json.encode('utf-8'))

print(f"Response Status: {response.status_code}")
print(f"Response Size (raw): {response_bytes:,} bytes ({response_bytes / 1024:.1f} KB)")
print(f"Response Size (pretty): {pretty_bytes:,} bytes ({pretty_bytes / 1024:.1f} KB)")

# Count entities
if 'data' in response_json and response_json['data']:
    org_data = response_json['data']['organization']
    
    # Count teams
    teams = org_data.get('teams', {}).get('nodes', [])
    print(f"\nTeams found: {len(teams)}")
    
    # Count repositories and PRs
    repos = org_data.get('repositories', {}).get('nodes', [])
    total_prs = 0
    repos_with_prs = 0
    
    for repo in repos:
        prs = repo.get('pullRequests', {}).get('nodes', [])
        if prs:
            repos_with_prs += 1
            total_prs += len(prs)
    
    print(f"Repositories found: {len(repos)}")
    print(f"Repositories with open PRs: {repos_with_prs}")
    print(f"Total open PRs: {total_prs}")
    
    # Calculate average size per PR
    if total_prs > 0:
        avg_size_per_pr = response_bytes / total_prs
        print(f"\nAverage data size per PR: {avg_size_per_pr:.0f} bytes")

# Check rate limit
print(f"\nRate limit remaining: {response.headers.get('X-RateLimit-Remaining', 'N/A')}")
print(f"Rate limit used: {response.headers.get('X-RateLimit-Used', 'N/A')}")

# Save response for inspection
with open('graphql-response.json', 'w') as f:
    json.dump(response_json, f, indent=2)
    print(f"\nFull response saved to: graphql-response.json")

# Show errors if any
if 'errors' in response_json:
    print(f"\nErrors: {response_json['errors']}")