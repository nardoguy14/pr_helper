#!/bin/bash

# PR Monitor Startup Script
echo "🚀 Starting PR Monitor Application..."

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Run this script from the PullRequestsApp root directory"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check dependencies
echo "🔍 Checking dependencies..."

if ! command_exists poetry; then
    echo "❌ Poetry not found. Install it first: https://python-poetry.org/docs/#installation"
    exit 1
fi

if ! command_exists npm; then
    echo "❌ npm not found. Install Node.js first: https://nodejs.org/"
    exit 1
fi

# Setup backend
echo "⚙️  Setting up backend..."
cd backend

if [ ! -f ".env" ]; then
    echo "📝 Creating backend .env file..."
    cp .env.example .env
    echo "⚠️  Please edit backend/.env and add your GITHUB_TOKEN"
    echo "   Get token from: https://github.com/settings/tokens"
fi

echo "📦 Installing backend dependencies..."
poetry install

# Setup frontend
echo "⚙️  Setting up frontend..."
cd ../frontend

if [ ! -f ".env" ]; then
    echo "📝 Creating frontend .env file..."
    cp .env.example .env
fi

echo "📦 Installing frontend dependencies..."
npm install

# Check if GitHub token is set
cd ../backend
if ! grep -q "^GITHUB_TOKEN=gh_" .env 2>/dev/null; then
    echo ""
    echo "⚠️  GITHUB_TOKEN not configured in backend/.env"
    echo "   1. Go to: https://github.com/settings/tokens"
    echo "   2. Generate new token with 'repo' and 'read:user' scopes"
    echo "   3. Add to backend/.env: GITHUB_TOKEN=your_token_here"
    echo ""
    read -p "Press Enter when you've added your GitHub token..."
fi

# Start services
echo ""
echo "🚀 Starting services..."
echo "   Backend will run on: http://localhost:8000"
echo "   Frontend will run on: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Start backend in background
echo "🔧 Starting backend..."
cd backend
poetry run python run.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend in background
echo "🎨 Starting frontend..."
cd ../frontend
npm start &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID