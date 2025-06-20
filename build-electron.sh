#!/bin/bash

echo "Building PR Monitor for distribution..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed. Please install Node.js and npm first.${NC}"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing Electron dependencies...${NC}"
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    cd frontend && npm install && cd ..
fi

# Build frontend
echo -e "${BLUE}Building React frontend...${NC}"
cd frontend && npm run build && cd ..

if [ $? -ne 0 ]; then
    echo -e "${RED}Frontend build failed!${NC}"
    exit 1
fi

# Build Electron app
echo -e "${BLUE}Building Electron app...${NC}"
npm run dist

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Build complete!${NC}"
    echo "Check the 'dist' directory for the built application."
else
    echo -e "${RED}Electron build failed!${NC}"
    exit 1
fi