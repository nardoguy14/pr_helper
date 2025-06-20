import { 
  WebSocketMessage, 
  PRUpdateMessage, 
  RepositoryStatsUpdateMessage
} from '../types';

export type WebSocketEventType = 
  | 'connection_established'
  | 'pr_update' 
  | 'repository_stats_update'
  | 'error'
  | 'disconnect';

export interface WebSocketEventHandlers {
  onConnectionEstablished?: () => void;
  onPRUpdate?: (data: PRUpdateMessage['data']) => void;
  onRepositoryStatsUpdate?: (data: RepositoryStatsUpdateMessage['data']) => void;
  onError?: (error: string) => void;
  onDisconnect?: () => void;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string = '';
  private userId: string = '';
  private eventHandlers: WebSocketEventHandlers = {};
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectInterval: number = 3000;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Generate a unique user ID for this session
    this.userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  connect(baseUrl: string = 'ws://localhost:8000'): Promise<void> {
    if (this.isConnecting) {
      console.log('WebSocket already connecting, skipping connection attempt');
      return Promise.resolve();
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, skipping connection attempt');
      return Promise.resolve();
    }
    
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket in connecting state, skipping connection attempt');
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.url = `${baseUrl}/api/v1/ws/${this.userId}`;
    
    console.log('Attempting WebSocket connection to:', this.url);
    console.log('WebSocket readyState constants:', {
      CONNECTING: WebSocket.CONNECTING,
      OPEN: WebSocket.OPEN,
      CLOSING: WebSocket.CLOSING,
      CLOSED: WebSocket.CLOSED
    });
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        console.log('WebSocket object created, readyState:', this.ws.readyState);

        this.ws.onopen = () => {
          console.log('WebSocket connected successfully');
          console.log('WebSocket readyState on open:', this.ws?.readyState);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          // Start sending heartbeat pings every 20 seconds
          this.startPingInterval();
          
          this.eventHandlers.onConnectionEstablished?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            // Handle ping/pong messages
            if (event.data === 'ping') {
              console.log('📡 Received ping, sending pong');
              this.ws?.send('pong');
              return;
            }
            if (event.data === 'pong') {
              console.log('📡 Received pong - connection alive');
              return;
            }
            
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
          this.isConnecting = false;
          this.ws = null;
          
          // Clear ping interval on disconnect
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
          
          // Only show error if connection was not clean
          if (!event.wasClean) {
            const errorMsg = `WebSocket connection failed (code: ${event.code})`;
            this.eventHandlers.onError?.(errorMsg);
          }
          
          this.eventHandlers.onDisconnect?.();
          
          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error event');
          console.error('WebSocket readyState:', this.ws?.readyState);
          console.error('WebSocket URL was:', this.url);
          console.error('Error details:', error);
          this.isConnecting = false;
          // Don't reject on error event, wait for close event
          // The error event doesn't provide useful information
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private handleMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'connection_established':
        console.log('Connection established:', message.data);
        break;
        
      case 'pr_update':
        const prUpdateData = message as PRUpdateMessage;
        this.eventHandlers.onPRUpdate?.(prUpdateData.data);
        break;
        
      case 'repository_stats_update':
        const statsUpdateData = message as RepositoryStatsUpdateMessage;
        this.eventHandlers.onRepositoryStatsUpdate?.(statsUpdateData.data);
        break;
        
      case 'error':
        console.error('WebSocket error message:', message.data);
        this.eventHandlers.onError?.(message.data.message || 'Unknown error');
        break;
        
      default:
        console.log('Unknown message type:', message.type, message.data);
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      this.connect(this.url.replace(`/api/v1/ws/${this.userId}`, ''));
    }, this.reconnectInterval);
  }

  disconnect() {
    this.shouldReconnect = false;
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  setEventHandlers(handlers: WebSocketEventHandlers) {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  sendMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  getUserId(): string {
    return this.userId;
  }

  private startPingInterval() {
    // Clear any existing interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Send ping every 20 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('📡 Sending ping to keep connection alive');
        this.ws.send('ping');
      } else {
        // Clear interval if connection is not open
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
      }
    }, 20000); // 20 seconds
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();