import json
import logging
from typing import List, Dict, Set
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

from app.models.pr_models import WebSocketMessage

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_subscriptions: Dict[str, Set[str]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.user_subscriptions[user_id] = set()
        logger.info(f"WebSocket connection established for user: {user_id}")
        
        await self.send_message(user_id, WebSocketMessage(
            type="connection_established",
            data={"user_id": user_id, "message": "Connected successfully"}
        ))
    
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.user_subscriptions:
            del self.user_subscriptions[user_id]
        logger.info(f"WebSocket connection closed for user: {user_id}")
    
    async def send_message(self, user_id: str, message: WebSocketMessage):
        if user_id in self.active_connections:
            try:
                websocket = self.active_connections[user_id]
                await websocket.send_text(message.model_dump_json())
            except Exception as e:
                logger.error(f"Failed to send message to {user_id}: {e}")
                self.disconnect(user_id)
    
    async def broadcast_to_subscribers(self, repository_name: str, message: WebSocketMessage):
        for user_id, subscriptions in self.user_subscriptions.items():
            if repository_name in subscriptions:
                await self.send_message(user_id, message)
    
    async def broadcast_to_all(self, message: WebSocketMessage):
        disconnected_users = []
        for user_id in self.active_connections:
            try:
                await self.send_message(user_id, message)
            except Exception:
                disconnected_users.append(user_id)
        
        for user_id in disconnected_users:
            self.disconnect(user_id)
    
    def subscribe_to_repository(self, user_id: str, repository_name: str):
        if user_id not in self.user_subscriptions:
            self.user_subscriptions[user_id] = set()
        self.user_subscriptions[user_id].add(repository_name)
        logger.info(f"User {user_id} subscribed to repository: {repository_name}")
    
    def unsubscribe_from_repository(self, user_id: str, repository_name: str):
        if user_id in self.user_subscriptions:
            self.user_subscriptions[user_id].discard(repository_name)
            logger.info(f"User {user_id} unsubscribed from repository: {repository_name}")
    
    def get_user_subscriptions(self, user_id: str) -> Set[str]:
        return self.user_subscriptions.get(user_id, set())
    
    def get_connected_users(self) -> List[str]:
        return list(self.active_connections.keys())
    
    def is_user_connected(self, user_id: str) -> bool:
        return user_id in self.active_connections
    
    async def send_pr_update(self, repository_name: str, pr_data: dict, update_type: str):
        message = WebSocketMessage(
            type="pr_update",
            data={
                "repository": repository_name,
                "update_type": update_type,
                "pull_request": pr_data
            }
        )
        await self.broadcast_to_subscribers(repository_name, message)
    
    async def send_repository_stats_update(self, repository_name: str, stats: dict):
        message = WebSocketMessage(
            type="repository_stats_update",
            data={
                "repository": repository_name,
                "stats": stats
            }
        )
        await self.broadcast_to_subscribers(repository_name, message)
    
    async def send_error(self, user_id: str, error_message: str, error_type: str = "general_error"):
        message = WebSocketMessage(
            type="error",
            data={
                "error_type": error_type,
                "message": error_message
            }
        )
        await self.send_message(user_id, message)


websocket_manager = WebSocketManager()