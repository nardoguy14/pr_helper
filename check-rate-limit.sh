#!/bin/bash

# Read token from token.txt file
TOKEN=$(cat token.txt)

# Clear screen
clear

echo "GitHub API Rate Limit Monitor"
echo "============================="
echo "Checking every 10 seconds. Press Ctrl+C to stop."
echo ""

while true; do
    # Call GitHub API to check rate limit
    RESPONSE=$(curl -s -H "Authorization: token $TOKEN" https://api.github.com/rate_limit)
    
    # Extract key values using grep and sed
    LIMIT=$(echo "$RESPONSE" | grep -A3 '"rate"' | grep '"limit"' | sed 's/.*: \([0-9]*\).*/\1/')
    USED=$(echo "$RESPONSE" | grep -A3 '"rate"' | grep '"used"' | sed 's/.*: \([0-9]*\).*/\1/')
    REMAINING=$(echo "$RESPONSE" | grep -A3 '"rate"' | grep '"remaining"' | sed 's/.*: \([0-9]*\).*/\1/')
    RESET=$(echo "$RESPONSE" | grep -A3 '"rate"' | grep '"reset"' | sed 's/.*: \([0-9]*\).*/\1/')
    
    # Convert reset timestamp to readable format
    RESET_TIME=$(date -r $RESET 2>/dev/null || date -d @$RESET 2>/dev/null || echo "Unknown")
    
    # Get current time
    CURRENT_TIME=$(date "+%Y-%m-%d %H:%M:%S")
    
    # Clear previous output (keep header)
    printf "\033[4;0H"
    printf "\033[J"
    
    # Display results
    echo "Last checked: $CURRENT_TIME"
    echo "------------------------------"
    echo "Remaining calls: $REMAINING/$LIMIT"
    echo "Used calls: $USED"
    echo "Next tokens available: $RESET_TIME"
    
    # Add color-coded status
    if [ $REMAINING -gt 1000 ]; then
        echo -e "\nStatus: ✅ Good"
    elif [ $REMAINING -gt 100 ]; then
        echo -e "\nStatus: ⚠️  Low"
    else
        echo -e "\nStatus: ❌ Critical"
    fi
    
    # Add countdown to reset if rate limited
    if [ $REMAINING -eq 0 ]; then
        NOW=$(date +%s)
        TIME_LEFT=$((RESET - NOW))
        if [ $TIME_LEFT -gt 0 ]; then
            MINUTES=$((TIME_LEFT / 60))
            SECONDS=$((TIME_LEFT % 60))
            echo -e "\nTime until reset: ${MINUTES}m ${SECONDS}s"
        fi
    fi
    
    # Wait 10 seconds
    sleep 10
done