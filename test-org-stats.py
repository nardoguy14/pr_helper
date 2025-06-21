#!/usr/bin/env python3
import requests

# Read token
with open('token.txt', 'r') as f:
    token = f.read().strip()

# Simple query to get counts
query = """
query($org: String!) {
  organization(login: $org) {
    repositories {
      totalCount
    }
    teams {
      totalCount
    }
  }
}
"""

response = requests.post(
    "https://api.github.com/graphql",
    json={"query": query, "variables": {"org": "waymark-care"}},
    headers={"Authorization": f"token {token}"}
)

data = response.json()
if 'data' in data:
    org = data['data']['organization']
    print(f"Total repositories in waymark-care: {org['repositories']['totalCount']}")
    print(f"Total teams in waymark-care: {org['teams']['totalCount']}")
else:
    print(f"Error: {data}")