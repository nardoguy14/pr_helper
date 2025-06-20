// Electron API utilities
declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      platform: string;
      isDev: boolean;
      showNotification: (title: string, body: string) => Notification;
      setBadgeCount: (count: number) => Promise<boolean>;
      setTrayNotification: (hasNotifications: number) => Promise<boolean>;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
    };
  }
}

export const isElectron = (): boolean => {
  return !!(window.electronAPI);
};

export const openExternal = async (url: string): Promise<void> => {
  if (isElectron() && window.electronAPI) {
    await window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
};

export const showNotification = (title: string, body: string): void => {
  console.log(`🔔 Attempting to show notification: "${title}" - "${body}"`);
  console.log(`Is Electron: ${isElectron()}`);
  console.log(`Has electronAPI: ${!!(window.electronAPI)}`);
  
  if (isElectron() && window.electronAPI) {
    console.log('📱 Showing Electron notification');
    window.electronAPI.showNotification(title, body);
  } else if ('Notification' in window && Notification.permission === 'granted') {
    console.log('🌐 Showing browser notification');
    new Notification(title, { body });
  } else {
    console.log('❌ Cannot show notification - no permission or API available');
    console.log(`Notification permission: ${window.Notification?.permission || 'N/A'}`);
  }
};

export const getAppVersion = async (): Promise<string | null> => {
  if (isElectron() && window.electronAPI) {
    return await window.electronAPI.getVersion();
  }
  return null;
};

export const getPlatform = (): string => {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI.platform;
  }
  return navigator.platform;
};

export const isDev = (): boolean => {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI.isDev;
  }
  return process.env.NODE_ENV === 'development';
};