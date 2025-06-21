# GitHub API Usage Comparison

## Current REST API Usage

For 2 teams with ~27 PRs each:

1. **Get team members** (2 API calls - 1 per team)
2. **Search for PRs** (2 API calls - 1 per team)  
3. **Get PR details** (54 API calls - 1 per PR)
4. **Get PR reviews** (54 API calls - 1 per PR)

**Total: 112 API calls per poll cycle**

With 5-minute polling:
- 112 calls × 12 polls/hour = **1,344 API calls/hour**
- Will hit 5,000 rate limit in ~3.7 hours

## New GraphQL API Usage

For the same 2 teams:

1. **Get all org data** (1 API call for entire organization)
   - Includes all teams, members, repositories, PRs, reviews, labels, etc.

**Total: 1 API call per poll cycle**

With 5-minute polling:
- 1 call × 12 polls/hour = **12 API calls/hour**
- Would take ~416 hours to hit rate limit!

## Benefits

- **99% reduction in API calls** (from 112 to 1 per poll)
- **Faster updates** - Single request vs. sequential requests
- **More reliable** - Less chance of partial failures
- **Future-proof** - Can add more data without more API calls

## Configuration

To enable GraphQL mode, the backend now has:

```env
USE_GRAPHQL_API=true
```

This setting in `.env` switches the scheduler to use the efficient GraphQL implementation.