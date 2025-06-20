// Electron API utilities
declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      platform: string;
      isDev: boolean;
      showNotification: (title: string, body: string) => Notification;
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
  if (isElectron() && window.electronAPI) {
    window.electronAPI.showNotification(title, body);
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
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