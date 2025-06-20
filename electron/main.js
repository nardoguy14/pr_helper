const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = process.env.ELECTRON_IS_DEV === '1' || process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let backendProcess;
let tray;

// Enable live reload for Electron in development
if (isDev) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
  } catch (_) { }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icons', 'icon.png'),
    titleBarStyle: 'default', // Changed from 'hiddenInset' to allow window dragging
    show: false // Don't show until ready
  });

  // Load the app
  if (isDev) {
    // In development, load from localhost
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // In production, load the built React app
    const indexPath = path.join(__dirname, '../frontend/build/index.html');
    mainWindow.loadFile(indexPath);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function startBackend() {
  if (isDev) {
    addBackendLog('Skipping backend start in development mode (should be running separately)');
    return;
  }

  try {
    // In production, start the packaged backend executable
    let backendExecutable;
    if (app.isPackaged) {
      // When packaged, the backend executable is in extraResources
      const execName = process.platform === 'win32' ? 'pr-monitor-backend.exe' : 'pr-monitor-backend';
      backendExecutable = path.join(process.resourcesPath, execName);
    } else {
      // When not packaged but running production build
      const execName = process.platform === 'win32' ? 'pr-monitor-backend.exe' : 'pr-monitor-backend';
      backendExecutable = path.join(__dirname, '../backend/dist', execName);
    }
    
    backendStatus.executablePath = backendExecutable;
    
    addBackendLog('=== BACKEND DEBUG INFO ===');
    addBackendLog(`isDev: ${isDev}`);
    addBackendLog(`app.isPackaged: ${app.isPackaged}`);
    addBackendLog(`process.resourcesPath: ${process.resourcesPath}`);
    addBackendLog(`__dirname: ${__dirname}`);
    addBackendLog(`Backend executable path: ${backendExecutable}`);
    
    // Check if executable exists
    const fs = require('fs');
    if (fs.existsSync(backendExecutable)) {
      addBackendLog('✓ Backend executable exists');
      
      // Check if it's executable
      try {
        fs.accessSync(backendExecutable, fs.constants.F_OK | fs.constants.X_OK);
        addBackendLog('✓ Backend executable has proper permissions');
      } catch (permError) {
        addBackendLog(`✗ Backend executable permission error: ${permError.message}`, 'error');
        backendStatus.error = `Permission error: ${permError.message}`;
        return;
      }
    } else {
      addBackendLog(`✗ Backend executable does not exist at: ${backendExecutable}`, 'error');
      
      // List what's in the directory
      try {
        const dir = path.dirname(backendExecutable);
        const files = fs.readdirSync(dir);
        addBackendLog(`Files in directory ${dir}: ${files.join(', ')}`);
      } catch (listError) {
        addBackendLog(`Cannot list directory: ${listError.message}`, 'error');
      }
      backendStatus.error = `Executable not found at: ${backendExecutable}`;
      return;
    }
    
    addBackendLog('Spawning backend process...');
    
    backendProcess = spawn(backendExecutable, [], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'] // Ensure we can capture all output
    });

    backendStatus.pid = backendProcess.pid;
    addBackendLog(`Backend process PID: ${backendProcess.pid}`);

    backendProcess.stdout.on('data', (data) => {
      addBackendLog(`stdout: ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
      addBackendLog(`stderr: ${data.toString().trim()}`, 'error');
    });

    backendProcess.on('error', (error) => {
      addBackendLog(`spawn error: ${error.message}`, 'error');
      backendStatus.error = error.message;
      backendStatus.isRunning = false;
    });

    backendProcess.on('close', (code, signal) => {
      addBackendLog(`process exited with code ${code}, signal ${signal}`, code === 0 ? 'info' : 'error');
      backendStatus.isRunning = false;
      backendStatus.pid = null;
      
      if (code !== 0 && !app.isQuitting) {
        addBackendLog('Backend crashed, will restart in 5 seconds...');
        setTimeout(startBackend, 5000);
      }
    });

    backendProcess.on('spawn', () => {
      addBackendLog('✓ Backend process spawned successfully');
      backendStatus.isRunning = true;
      backendStatus.error = null;
    });

  } catch (error) {
    addBackendLog(`Exception while starting backend: ${error.message}`, 'error');
    backendStatus.error = error.message;
    backendStatus.isRunning = false;
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'icons', 'tray.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show PR Monitor',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('PR Monitor');
  tray.setContextMenu(contextMenu);
  
  // Show window on tray click
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reload();
            }
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About PR Monitor',
          click: () => {
            shell.openExternal('https://github.com/yourusername/pr-monitor');
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Backend status tracking
let backendStatus = {
  isRunning: false,
  error: null,
  executablePath: null,
  pid: null,
  logs: []
};

function addBackendLog(message, type = 'info') {
  const logEntry = { timestamp: new Date().toISOString(), message, type };
  backendStatus.logs.push(logEntry);
  // Keep only last 50 log entries
  if (backendStatus.logs.length > 50) {
    backendStatus.logs.shift();
  }
  console.log(`[Backend ${type.toUpperCase()}] ${message}`);
}

// IPC handlers for frontend-backend communication
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-backend-status', () => {
  return backendStatus;
});

ipcMain.handle('open-external-link', (event, url) => {
  shell.openExternal(url);
});

// Badge count handler for macOS dock
ipcMain.handle('set-badge-count', (event, count) => {
  console.log(`🔴 Setting dock badge count to: ${count}`);
  
  if (process.platform === 'darwin') {
    try {
      if (count > 0) {
        app.dock.setBadge(count.toString());
        console.log(`✅ Dock badge set to: ${count}`);
      } else {
        app.dock.setBadge('');
        console.log(`✅ Dock badge cleared`);
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to set dock badge:', error);
      return false;
    }
  } else {
    console.log('⚠️ Badge count not supported on this platform');
    return false;
  }
});

// Tray icon handler for menu bar
ipcMain.handle('set-tray-notification', (event, hasNotifications) => {
  console.log(`🔴 Setting tray notification state: ${hasNotifications}`);
  
  try {
    updateTrayIcon(hasNotifications);
    return true;
  } catch (error) {
    console.error('❌ Failed to update tray icon:', error);
    return false;
  }
});

function updateTrayIcon(hasNotifications) {
  if (!tray) return;
  
  try {
    // Create a simple base icon (use the existing icon or create a minimal one)
    let iconPath = path.join(__dirname, 'icons', 'tray.png');
    const fs = require('fs');
    
    // Check if icon file exists, if not create a simple base64 icon
    if (!fs.existsSync(iconPath)) {
      // Create a minimal 32x32 transparent PNG as base64
      const baseIconData = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAGklEQVRYhe3BMQEAAADCoPVPbQsvoAAAAOBjAAoAAf8j1AsAAAAASUVORK5CYII=';
      const buffer = Buffer.from(baseIconData, 'base64');
      fs.writeFileSync(iconPath, buffer);
    }
    
    let trayIcon = nativeImage.createFromPath(iconPath);
    
    // Use text indicators on macOS for different states
    if (process.platform === 'darwin') {
      if (hasNotifications) {
        // Yellow circle for pending reviews
        tray.setTitle('🟡');
      } else {
        // Green circle for all caught up  
        tray.setTitle('🟢');
      }
    }
    
    tray.setImage(trayIcon);
    
    // Update tooltip
    const tooltip = hasNotifications 
      ? `PR Monitor - ${hasNotifications} pending review${hasNotifications !== 1 ? 's' : ''}`
      : 'PR Monitor - All caught up!';
    tray.setToolTip(tooltip);
    
    console.log(`✅ Tray icon updated: ${hasNotifications ? '🟡 pending reviews' : '🟢 all caught up'}`);
  } catch (error) {
    console.error('❌ Failed to update tray icon:', error);
  }
}

// Notification handlers
ipcMain.handle('show-notification', async (event, { title, body, icon, silent }) => {
  console.log(`🔔 Electron main: Attempting to show notification: "${title}"`);
  
  if (!Notification.isSupported()) {
    console.log('❌ Notifications are not supported on this system');
    return false;
  }

  // On macOS, ensure app is ready for notifications
  if (process.platform === 'darwin') {
    try {
      console.log(`📱 macOS notification setup...`);
      
      // Clear any existing badge
      if (app.dock) {
        app.dock.setBadge('');
      }
    } catch (error) {
      console.log('⚠️ Could not setup macOS notifications:', error);
    }
  }

  try {
    console.log(`📢 Creating notification with title: "${title}", body: "${body}"`);
    
    const notification = new Notification({
      title: title,
      body: body,
      icon: icon || path.join(__dirname, 'icons', 'icon.png'),
      silent: silent || false,
      urgency: 'normal',
      timeoutType: 'never' // Keep notification visible until user interacts
    });

    console.log('📤 Showing notification...');
    notification.show();
    console.log('✅ Notification shown successfully');

    // Handle notification click
    notification.on('click', () => {
      console.log('🖱️ Notification clicked');
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.show();
      }
    });

    // Add error handling
    notification.on('failed', (error) => {
      console.error('❌ Notification failed:', error);
    });

    notification.on('close', () => {
      console.log('🔔 Notification closed');
    });

    return true;
  } catch (error) {
    console.error('❌ Failed to show notification:', error);
    return false;
  }
});

// App event handlers
app.whenReady().then(() => {
  createMenu();
  createTray();
  if (!isDev) {
    startBackend();
  }
  createWindow();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  
  // Clean up backend process
  if (backendProcess) {
    backendProcess.kill();
  }
});

// Handle certificate errors (for development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    // Ignore certificate errors in development
    event.preventDefault();
    callback(true);
  } else {
    // Use default behavior in production
    callback(false);
  }
});