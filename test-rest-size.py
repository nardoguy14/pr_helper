#!/usr/bin/env python3
import requests
import json

# Read token from token.txt
with open('token.txt', 'r') as f:
    token = f.read().strip()

headers = {
    "Authorization": f"token {token}",
    "Accept": "application/vnd.github.v3+json"
}

print("Testing REST API response sizes")
print("=" * 60)

total_size = 0
api_calls = 0

# Test 1: Get team members for one team
print("\n1. Getting team members for waymark-care/engineering...")
response = requests.get(
    "https://api.github.com/orgs/waymark-care/teams/engineering/members",
    headers=headers
)
team_size = len(response.content)
total_size += team_size
api_calls += 1
print(f"   Response size: {team_size:,} bytes ({team_size / 1024:.1f} KB)")
print(f"   Members found: {len(response.json())}")

# Test 2: Search for PRs by team members (limit to first 5 members for testing)
members = response.json()[:5]
member_logins = [m['login'] for m in members]
search_query = " ".join([f"author:{login}" for login in member_logins])

print(f"\n2. Searching for PRs by {len(member_logins)} team members...")
response = requests.get(
    f"https://api.github.com/search/issues",
    params={
        "q": f"{search_query} type:pr state:open",
        "per_page": 30
    },
    headers=headers
)
search_size = len(response.content)
total_size += search_size
api_calls += 1
print(f"   Response size: {search_size:,} bytes ({search_size / 1024:.1f} KB)")
prs = response.json().get('items', [])
print(f"   PRs found: {len(prs)}")

# Test 3: Get detailed PR data for first 5 PRs
print(f"\n3. Getting detailed data for first 5 PRs...")
pr_sizes = []
for i, pr in enumerate(prs[:5]):
    if i >= 5:
        break
    
    # Extract repo info from PR URL
    parts = pr['repository_url'].split('/')
    owner = parts[-2]
    repo = parts[-1]
    
    # Get full PR data
    response = requests.get(
        f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr['number']}",
        headers=headers
    )
    pr_size = len(response.content)
    pr_sizes.append(pr_size)
    total_size += pr_size
    api_calls += 1
    
    # Get reviews
    response = requests.get(
        f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr['number']}/reviews",
        headers=headers
    )
    review_size = len(response.content)
    pr_sizes.append(review_size)
    total_size += review_size
    api_calls += 1
    
    print(f"   PR #{pr['number']}: {pr_size:,} bytes (PR) + {review_size:,} bytes (reviews)")

avg_pr_size = sum(pr_sizes) / len(pr_sizes) if pr_sizes else 0
print(f"\n   Average size per PR API call: {avg_pr_size:,.0f} bytes")

print(f"\n4. Summary for partial data (5 members, 5 PRs):")
print(f"   Total API calls: {api_calls}")
print(f"   Total data transferred: {total_size:,} bytes ({total_size / 1024:.1f} KB)")
print(f"   Average per API call: {total_size / api_calls:,.0f} bytes")

print(f"\n5. Projected for full team (2 teams, ~50 PRs):")
projected_calls = 2 + 2 + (50 * 2)  # team members + searches + (PRs + reviews)
projected_size = total_size * (projected_calls / api_calls)
print(f"   Projected API calls: {projected_calls}")
print(f"   Projected data size: {projected_size:,.0f} bytes ({projected_size / 1024 / 1024:.1f} MB)")

print(f"\nRate limit remaining: {response.headers.get('X-RateLimit-Remaining', 'N/A')}")