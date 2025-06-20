#!/bin/bash

echo "Starting PR Monitor in Electron..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Install root dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing Electron dependencies...${NC}"
    npm install
fi

# Install frontend dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    cd frontend && npm install && cd ..
fi

# Check if Python virtual environment exists
if [ ! -d "backend/venv" ]; then
    echo -e "${BLUE}Creating Python virtual environment...${NC}"
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt 2>/dev/null || pip install poetry && poetry install
    cd ..
fi

echo -e "${GREEN}Starting PR Monitor...${NC}"
echo "This will start:"
echo "  1. Python backend on http://localhost:8000"
echo "  2. React frontend on http://localhost:3000"
echo "  3. Electron app"
echo ""

# Start everything
npm start