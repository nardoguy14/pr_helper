# Quick Start Guide

## 🚀 Run the Application (2 minutes)

### Option 1: Use the startup script
```bash
./start.sh
```

### Option 2: Manual setup (recommended for first time)

**Terminal 1 - Backend:**
```bash
cd backend
poetry install
cp .env.example .env
# Edit .env and add your GITHUB_TOKEN (see below)
python run.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm start
```

## 🔑 GitHub Token Setup

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` and `read:user`
4. Copy the token
5. Edit `backend/.env`:
   ```
   GITHUB_TOKEN=your_token_here
   ```

## 🎯 Test the Application

1. **Open**: http://localhost:3000
2. **Add a repository**: Click "Add Repository"
   - Enter format: `owner/repository` (e.g., `facebook/react`)
   - Leave default options checked
   - Click "Add Repository"
3. **View mind map**: Repository appears as a circle
   - Size = number of open PRs
   - Color = status (yellow=needs review, blue=assigned, green=other)
4. **Expand to PR graph**: Click the repository circle
   - See individual PRs as nodes
   - Yellow nodes = need your review
   - Click any PR to open in GitHub

## 🔧 Troubleshooting

**Backend fails to start:**
- Check you have Python 3.9+: `python --version`
- Make sure you added GITHUB_TOKEN to `.env`

**Frontend fails to connect:**
- Ensure backend is running on port 8000
- Check browser console for errors

**No repositories show up:**
- Verify GitHub token has `repo` and `read:user` permissions
- Try a public repository first

**WebSocket not connecting:**
- Backend must be running for real-time updates
- Check firewall isn't blocking WebSocket connections

## 📱 Usage Tips

- **Repository subscription**: Choose what to monitor (assigned PRs, review requests, etc.)
- **Real-time updates**: PRs update automatically when status changes
- **Hover for details**: Hover over repositories/PRs for more information
- **Direct GitHub links**: Click PRs to open them in GitHub

## 🎨 Visual Guide

**Mind Map Colors:**
- 🟡 Yellow: Has PRs needing your review
- 🔵 Blue: Has PRs assigned to you  
- 🟢 Green: Has other open PRs
- ⚫ Gray: No open PRs

**PR Graph Colors:**
- 🟡 Yellow: Needs review
- 🟢 Green: You've reviewed
- 🔴 Red: Changes requested
- 🟣 Purple: Merged

---

**Next Steps:**
- Add multiple repositories to see the full mind map effect
- Set up Slack notifications (optional)
- Deploy to production (see main README)