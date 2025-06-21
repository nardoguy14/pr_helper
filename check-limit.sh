#!/bin/bash

# Read token from token.txt file
TOKEN=$(cat token.txt)

# Call GitHub API and parse with jq
curl -s -H "Authorization: token $TOKEN" https://api.github.com/rate_limit | \
jq -r '
  .rate | 
  "GitHub API Rate Limit Status\n" +
  "============================\n" +
  "Remaining calls: \(.remaining)/\(.limit)\n" +
  "Used calls: \(.used)\n" +
  "Resets at: \(.reset | strftime("%Y-%m-%d %H:%M:%S %Z"))\n" +
  if .remaining > 1000 then "\nStatus: ✅ Good"
  elif .remaining > 100 then "\nStatus: ⚠️  Low"
  else "\nStatus: ❌ Critical"
  end
'