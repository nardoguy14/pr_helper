import { useEffect, useState, useCallback } from 'react';
import { websocketService, WebSocketEventHandlers } from '../services/websocket';

interface UseWebSocketReturn {
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

export function useWebSocket(
  onPRUpdate?: (data: any) => void,
  isAuthenticated: boolean = false,
  onTeamPRUpdate?: (data: any) => void
): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    // Only connect if authenticated
    if (!isAuthenticated) {
      return;
    }

    try {
      setError(null);
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
      await websocketService.connect(wsUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to WebSocket');
    }
  }, [isAuthenticated]);

  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);

  useEffect(() => {
    // Auto-connect when authenticated
    if (isAuthenticated) {
      connect();
    } else {
      // Disconnect if not authenticated
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]); // Remove callback dependencies to prevent reconnection loops

  // Update event handlers when callbacks change (without reconnecting)
  useEffect(() => {
    const handlers: WebSocketEventHandlers = {
      onConnectionEstablished: () => {
        setIsConnected(true);
        setError(null);
      },
      onDisconnect: () => {
        setIsConnected(false);
      },
      onError: (errorMessage: string) => {
        setError(errorMessage);
      },
      onPRUpdate: onPRUpdate,
      onTeamPRUpdate: onTeamPRUpdate,
    };

    websocketService.setEventHandlers(handlers);
  }, [onPRUpdate, onTeamPRUpdate]);

  return {
    isConnected,
    connect,
    disconnect,
    error
  };
}