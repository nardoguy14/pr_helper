const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external-link', url),
  
  // Platform info
  platform: process.platform,
  
  // Environment
  isDev: process.env.ELECTRON_IS_DEV === '1' || process.env.NODE_ENV === 'development',
  
  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // Notifications (using native Electron notifications)
  showNotification: (title, body, options = {}) => {
    return ipcRenderer.invoke('show-notification', {
      title,
      body,
      icon: options.icon,
      silent: options.silent || false
    });
  },
  
  // Backend communication (if needed in future)
  sendToBackend: (channel, data) => {
    // Whitelist allowed channels
    const validChannels = ['api-request'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  },
  
  // Listen for backend events
  onBackendEvent: (channel, callback) => {
    const validChannels = ['pr-update', 'connection-status'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },
  
  // Remove listener
  removeBackendListener: (channel, callback) => {
    const validChannels = ['pr-update', 'connection-status'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  }
});