# Deployment Guide

## 📋 Pre-Deployment Checklist

### Backend
- [ ] Python 3.9+ installed
- [ ] Poetry installed
- [ ] GitHub Personal Access Token with `repo` + `read:user` scopes
- [ ] Slack webhook URL (optional)

### Frontend  
- [ ] Node.js 16+ installed
- [ ] npm installed

## 🏗️ Production Deployment

### Backend (FastAPI)

**Option 1: Docker**
```dockerfile
# Dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-dev
COPY . .
EXPOSE 8000
CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Option 2: Direct Deployment**
```bash
# Install dependencies
poetry install --no-dev

# Run with gunicorn for production
poetry run gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

**Environment Variables:**
```env
GITHUB_TOKEN=your_production_token
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
POLLING_INTERVAL_SECONDS=60
LOG_LEVEL=INFO
ALLOWED_ORIGINS=["https://your-frontend-domain.com"]
```

### Frontend (React)

**Build for production:**
```bash
npm run build
```

**Deploy options:**
- **Vercel**: Connect GitHub repo for auto-deployments
- **Netlify**: Drag & drop `build/` folder  
- **AWS S3**: Upload `build/` to S3 bucket with static hosting
- **Docker**: Use nginx to serve static files

**Environment Variables:**
```env
REACT_APP_API_URL=https://your-backend-domain.com
REACT_APP_WS_URL=wss://your-backend-domain.com
```

## 🌐 Platform-Specific Instructions

### Vercel (Recommended for Frontend)

1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set output directory: `build`
4. Add environment variables in dashboard

### Railway (Recommended for Backend)

1. Connect GitHub repository  
2. Set start command: `poetry run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Add environment variables in dashboard
4. Railway provides automatic HTTPS

### Heroku

**Backend (Procfile):**
```
web: poetry run uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**Frontend:** Use buildpack for create-react-app

### AWS/DigitalOcean

**Backend:** Use PM2 or systemd service
**Frontend:** Nginx to serve static files + reverse proxy

## 🔧 Production Configuration

### Backend Optimizations

```python
# app/core/config.py additions for production
class Settings(BaseSettings):
    # ... existing settings
    
    # Production settings
    DEBUG: bool = False
    CORS_ORIGINS: List[str] = ["https://your-domain.com"]
    DATABASE_URL: str = "postgresql://user:pass@host:port/dbname"  # If using postgres
    
    # Security
    SECRET_KEY: str = "your-secret-key"
    
    # Performance  
    MAX_WORKERS: int = 4
    KEEP_ALIVE: int = 65
```

### Frontend Optimizations

```json
// package.json - add to scripts
{
  "scripts": {
    "build": "react-scripts build",
    "build:analyze": "npm run build && npx bundle-analyzer build/static/js/*.js"
  }
}
```

## 🔒 Security Considerations

### Backend
- [ ] Use environment variables for secrets
- [ ] Enable CORS only for your frontend domain
- [ ] Use HTTPS in production
- [ ] Rate limit API endpoints
- [ ] Validate all inputs

### Frontend
- [ ] Use HTTPS
- [ ] Set proper CSP headers
- [ ] Don't expose API keys in frontend code
- [ ] Implement proper error boundaries

## 📊 Monitoring

### Backend Monitoring
```python
# Add to main.py
import logging
from app.utils.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    logger.info(f"{request.method} {request.url} - {response.status_code} - {duration:.2f}s")
    return response
```

### Health Checks
```bash
# Backend health
curl https://your-backend.com/health

# Frontend health  
curl https://your-frontend.com
```

## 📈 Scaling

### Backend Scaling
- Use multiple workers: `gunicorn -w 4`
- Add Redis for caching
- Use PostgreSQL for persistence
- Implement rate limiting

### Frontend Scaling
- Use CDN for static assets
- Enable gzip compression
- Implement code splitting
- Add service worker for caching

## 🚨 Troubleshooting Production Issues

### Common Backend Issues
```bash
# Check logs
docker logs container_name
# or
journalctl -u your-service

# Check memory/CPU
top
htop

# Check network
netstat -tulpn | grep :8000
```

### Common Frontend Issues
```bash
# Check build output
npm run build 2>&1 | tee build.log

# Check bundle size
npm run build:analyze

# Test production build locally
npx serve -s build
```

---

**Quick Deploy Commands:**
```bash
# Backend to Railway
railway login && railway link && railway up

# Frontend to Vercel  
vercel --prod

# Or both with Docker Compose
docker-compose up -d
```