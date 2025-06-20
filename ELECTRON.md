# PR Monitor - Electron Desktop App

This document explains how to run and build PR Monitor as a desktop application using Electron.

## Prerequisites

- Node.js (v16 or higher)
- Python 3.8+
- npm or yarn

## Quick Start

### Development Mode

To run the app in development mode with hot reload:

```bash
./start-electron.sh
```

Or manually:

```bash
# Terminal 1: Start backend
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
python run.py

# Terminal 2: Start frontend
cd frontend
npm start

# Terminal 3: Start Electron (after frontend is running)
npm run start:electron-dev
```

### Building for Distribution

To build the app for your current platform:

```bash
./build-electron.sh
```

Or manually:

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Build Electron app
npm run dist
```

The built application will be in the `dist` directory.

## Platform-Specific Builds

```bash
# macOS
npm run dist:mac

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

## Project Structure

```
PullRequestsApp/
├── electron/              # Electron-specific files
│   ├── main.js           # Main process
│   ├── preload.js        # Preload script
│   ├── icons/            # App icons
│   └── entitlements.mac.plist
├── frontend/             # React app
├── backend/              # Python backend
├── package.json          # Electron configuration
└── dist/                 # Built applications
```

## Features

- **System Tray**: Access the app from the system tray
- **Native Menus**: Platform-specific application menus
- **Secure Context**: Isolated context with preload script
- **Auto-start Backend**: Python backend starts automatically in production
- **External Links**: Opens PR links in default browser

## Configuration

### Development vs Production

The app automatically detects if it's running in development or production:

- **Development**: Connects to localhost:3000 (React dev server)
- **Production**: Loads built React app from the build directory

### Backend Integration

In production, the Python backend is bundled with the app and starts automatically. Make sure all Python dependencies are included in the requirements.txt file.

### Icons

Place your app icons in `electron/icons/`:
- `icon.png` - Default icon (512x512)
- `icon.icns` - macOS icon
- `icon.ico` - Windows icon
- `tray.png` - System tray icon (16x16 or 24x24)

## Troubleshooting

### Backend not starting

If the backend doesn't start in production:
1. Check that Python is installed on the system
2. Verify all Python dependencies are in requirements.txt
3. Check the logs in the DevTools console

### Build fails on macOS

If you get code signing errors:
1. You can disable code signing for local builds
2. For distribution, you'll need an Apple Developer certificate

### White screen on startup

This usually means the frontend build is missing:
1. Run `cd frontend && npm run build`
2. Make sure the build directory exists

## Security Notes

- The app uses context isolation and a preload script for security
- Node integration is disabled in renderer processes
- External URLs open in the default browser, not in the app
- API calls to the backend use the same security as the web version

## Distribution

For distributing the app:

1. **Code Signing**: Required for macOS and recommended for Windows
2. **Auto-updates**: Can be configured with electron-updater
3. **Installers**: The build process creates platform-specific installers

## Next Steps

1. Add custom icons for your brand
2. Configure auto-updater for seamless updates
3. Add platform-specific features (notifications, shortcuts)
4. Set up CI/CD for automated builds