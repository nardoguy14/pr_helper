# PR Monitor - GitHub Pull Request Mind Map Visualizer

A full-stack application that visualizes GitHub pull requests as an interactive mind map with real-time updates and Slack notifications.

## Architecture

```
PullRequestsApp/
├── backend/           # FastAPI + WebSocket + GitHub API
│   ├── app/
│   ├── pyproject.toml
│   └── run.py
├── frontend/          # React + D3.js + TypeScript  
│   ├── src/
│   ├── package.json
│   └── public/
└── README.md         # This file
```

## Features

- 🗺️ **Mind Map**: Repositories as circles, size = PR count, colors = status
- 🔗 **PR Graph**: Click to expand into directed graph of individual PRs
- 🔄 **Real-time**: WebSocket updates for live PR status changes
- 📩 **Slack**: Automated notifications for review requests
- 🎯 **GitHub Colors**: Yellow=needs review, Green=reviewed, Red=changes needed

## Quick Start

### 1. Backend Setup (Terminal 1)

```bash
cd backend

# Install dependencies
poetry install

# Configure environment
cp .env.example .env
# Edit .env and add your GITHUB_TOKEN

# Run server
python run.py
# → http://localhost:8000
```

### 2. Frontend Setup (Terminal 2)

```bash
cd frontend

# Install dependencies  
npm install

# Configure environment
cp .env.example .env
# Default settings should work with local backend

# Run development server
npm start
# → http://localhost:3000
```

### 3. GitHub Token Setup

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with scopes: `repo`, `read:user`
3. Add to `backend/.env`:
   ```
   GITHUB_TOKEN=your_token_here
   ```

### 4. Optional: Slack Integration

Add to `backend/.env`:
```
SLACK_WEBHOOK_URL=your_slack_webhook_url
```

## Usage Flow

1. **Open** http://localhost:3000
2. **Add Repository**: Click "Add Repository" → enter `owner/repo` format
3. **Mind Map View**: See repositories as circles, hover for stats
4. **PR Graph**: Click repository circle → view individual PRs
5. **Real-time**: Watch as PRs update automatically

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/repositories/subscribe` | Subscribe to repository |
| GET | `/api/v1/repositories` | List subscribed repositories |
| GET | `/api/v1/repositories/{name}/pull-requests` | Get PRs for repository |
| WS | `/api/v1/ws/{user_id}` | WebSocket for real-time updates |

## Color Coding

- **🟡 Yellow**: Needs your review
- **🟢 Green**: You've reviewed  
- **🔵 Blue**: Assigned to you
- **🔴 Red**: Changes requested
- **🟣 Purple**: Merged
- **⚫ Gray**: No open PRs

## Development

### Backend Development

```bash
cd backend
poetry shell

# Run with auto-reload
python run.py

# Run tests (when added)
pytest

# Format code
black .
isort .
```

### Frontend Development

```bash
cd frontend

# Development server with hot reload
npm start

# Build for production
npm run build

# Run tests
npm test
```

## Production Deployment

### Backend (FastAPI)

```bash
# Using uvicorn directly
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Or with gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

### Frontend (Static Files)

```bash
npm run build
# Deploy /build folder to any static hosting (Vercel, Netlify, S3)
```

### Environment Variables

**Backend Production:**
```env
GITHUB_TOKEN=your_production_token
SLACK_WEBHOOK_URL=your_slack_webhook
POLLING_INTERVAL_SECONDS=60
LOG_LEVEL=INFO
```

**Frontend Production:**
```env
REACT_APP_API_URL=https://your-backend-domain.com
REACT_APP_WS_URL=wss://your-backend-domain.com
```

## Tech Stack

**Backend:**
- FastAPI (Python) - Web framework with native WebSocket support
- APScheduler - Background GitHub API polling  
- httpx - Async HTTP client for GitHub API
- Pydantic - Data validation and serialization

**Frontend:**
- React 18 + TypeScript - UI framework with type safety
- D3.js - Interactive force-directed graph visualizations
- Styled Components - CSS-in-JS styling
- Axios - HTTP client for REST API

## Troubleshooting

**Backend won't start:**
- Check Python version (3.9+)
- Verify `GITHUB_TOKEN` in `.env`
- Run `poetry install` to ensure dependencies

**Frontend won't connect:**
- Ensure backend is running on port 8000
- Check browser console for CORS errors
- Verify `REACT_APP_API_URL` in `.env`

**No repositories showing:**
- Check GitHub token permissions (`repo`, `read:user`)
- Verify repository name format: `owner/repository`
- Check browser network tab for API errors

**WebSocket connection failed:**
- Backend must be running for real-time updates
- Check firewall/proxy WebSocket support
- Look for connection errors in browser console

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes with proper types/tests
4. Submit pull request

## License

MIT License - see LICENSE file for details.

---

**Quick Commands Summary:**
```bash
# Terminal 1: Backend
cd backend && poetry install && python run.py

# Terminal 2: Frontend  
cd frontend && npm install && npm start

# Open: http://localhost:3000
# Add repo: Click "Add Repository" → enter "owner/repo"
```