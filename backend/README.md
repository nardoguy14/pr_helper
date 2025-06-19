# PR Monitor Backend

A FastAPI-based backend service for monitoring GitHub Pull Requests with real-time updates via WebSocket and Slack notifications.

## Features

- 🔍 **GitHub API Integration**: Monitor pull requests across multiple repositories
- 🔄 **Real-time Updates**: WebSocket connections for live PR status updates
- 📩 **Slack Notifications**: Automated notifications for PR review requests
- 🎯 **Smart Filtering**: Subscribe to PRs based on assignments, review requests, or code ownership
- ⚡ **Background Polling**: Automatic PR status monitoring with configurable intervals
- 🚀 **FastAPI**: Modern, fast web framework with automatic API documentation

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py          # API endpoints
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py          # Configuration settings
│   ├── models/
│   │   ├── __init__.py
│   │   ├── api_models.py      # API request/response models
│   │   └── pr_models.py       # PR and GitHub data models
│   ├── services/
│   │   ├── __init__.py
│   │   ├── github_service.py  # GitHub API integration
│   │   ├── scheduler.py       # Background task scheduler
│   │   ├── slack_service.py   # Slack notifications
│   │   └── websocket_manager.py # WebSocket connections
│   ├── utils/
│   │   ├── __init__.py
│   │   └── logging.py         # Logging configuration
│   ├── __init__.py
│   └── main.py               # FastAPI application
├── .env.example              # Environment variables template
├── pyproject.toml           # Poetry configuration
├── run.py                   # Development server runner
└── README.md
```

## Setup

### Prerequisites

- Python 3.9+
- Poetry (for dependency management)
- GitHub Personal Access Token
- Slack Webhook URL (optional)

### Installation

1. **Clone and navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies using Poetry**:
   ```bash
   poetry install
   ```

3. **Activate the virtual environment**:
   ```bash
   poetry shell
   ```

4. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

5. **Configure environment variables in `.env`**:
   ```env
   GITHUB_TOKEN=your_github_personal_access_token
   SLACK_WEBHOOK_URL=your_slack_webhook_url
   SLACK_BOT_TOKEN=your_slack_bot_token
   POLLING_INTERVAL_SECONDS=60
   LOG_LEVEL=INFO
   ```

### Running the Application

**Development server**:
```bash
python run.py
```

**Or with Poetry**:
```bash
poetry run python run.py
```

**Or directly with uvicorn**:
```bash
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- **API**: http://localhost:8000
- **Interactive API docs**: http://localhost:8000/docs
- **Alternative API docs**: http://localhost:8000/redoc

## API Endpoints

### Repository Management

- `POST /api/v1/repositories/subscribe` - Subscribe to a repository
- `POST /api/v1/repositories/unsubscribe` - Unsubscribe from a repository
- `GET /api/v1/repositories` - Get all subscribed repositories with stats
- `GET /api/v1/repositories/{repo_name}/pull-requests` - Get PRs for a repository
- `POST /api/v1/repositories/{repo_name}/refresh` - Force refresh repository data

### WebSocket

- `WS /api/v1/ws/{user_id}` - WebSocket connection for real-time updates

### Health Check

- `GET /` - Root endpoint
- `GET /health` - Health check endpoint

## WebSocket Messages

The WebSocket connection sends various message types:

```json
{
  "type": "pr_update",
  "data": {
    "repository": "owner/repo",
    "update_type": "new_pr|updated|closed",
    "pull_request": { /* PR object */ }
  },
  "timestamp": "2023-12-01T12:00:00.000Z"
}
```

```json
{
  "type": "repository_stats_update",
  "data": {
    "repository": "owner/repo",
    "stats": {
      "total_open_prs": 10,
      "assigned_to_user": 2,
      "review_requests": 3,
      "needs_review": 5
    }
  },
  "timestamp": "2023-12-01T12:00:00.000Z"
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | Required |
| `SLACK_WEBHOOK_URL` | Slack webhook URL for notifications | Optional |
| `SLACK_BOT_TOKEN` | Slack bot token | Optional |
| `POLLING_INTERVAL_SECONDS` | How often to poll GitHub API | 60 |
| `LOG_LEVEL` | Logging level (DEBUG, INFO, WARNING, ERROR) | INFO |

### GitHub Token Permissions

Your GitHub Personal Access Token needs the following scopes:
- `repo` (for private repositories)
- `public_repo` (for public repositories)
- `read:user` (to get user information)

## Development

### Running Tests

```bash
poetry run pytest
```

### Code Formatting

```bash
poetry run black .
poetry run isort .
```

### Type Checking

```bash
poetry run mypy app/
```

## Deployment

### Docker (Coming Soon)

A Dockerfile will be provided for containerized deployment.

### Manual Deployment

1. Install dependencies in production environment
2. Set up environment variables
3. Use a production ASGI server like Gunicorn:

```bash
poetry run gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## Architecture

The backend follows a clean architecture pattern:

- **API Layer** (`app/api/`): FastAPI routes and WebSocket endpoints
- **Service Layer** (`app/services/`): Business logic and external integrations
- **Model Layer** (`app/models/`): Data models and validation
- **Core Layer** (`app/core/`): Configuration and shared utilities

### Key Components

1. **GitHub Service**: Handles all GitHub API interactions
2. **WebSocket Manager**: Manages real-time connections to frontend clients
3. **Scheduler**: Background task runner for periodic PR polling
4. **Slack Service**: Sends notifications to Slack channels

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the MIT License.