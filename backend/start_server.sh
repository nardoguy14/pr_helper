#!/bin/bash

# Kill any existing processes on port 8000
echo "Killing any existing processes on port 8000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Start the backend server in the background
echo "Starting backend server on port 8000..."
python run.py &
SERVER_PID=$!

echo "Backend server started with PID: $SERVER_PID"
echo "Waiting for server to be ready..."

# Wait for server to be ready
for i in {1..30}; do
    if curl -s http://localhost:8000/health >/dev/null 2>&1; then
        echo "Server is ready!"
        exit 0
    fi
    sleep 1
done

echo "Server failed to start within 30 seconds"
kill $SERVER_PID 2>/dev/null || true
exit 1