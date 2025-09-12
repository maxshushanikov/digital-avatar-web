from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set, List
import asyncio
import json
import logging

from core.config import settings
from models.chat import WebrtcOffer, WebrtcAnswer, WebrtcIceCandidate

router = APIRouter()
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.ice_candidates: Dict[str, List[Dict]] = {}
    
    async def connect(self, room_id: str, client_id: str, websocket: WebSocket):
        """Подключает WebSocket к комнате"""
        await websocket.accept()
        
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
            self.ice_candidates[room_id] = []
        
        self.active_connections[room_id][client_id] = websocket
        logger.info(f"Client {client_id} connected to room {room_id}")
    
    def disconnect(self, room_id: str, client_id: str):
        """Отключает WebSocket от комнаты"""
        if room_id in self.active_connections and client_id in self.active_connections[room_id]:
            del self.active_connections[room_id][client_id]
            logger.info(f"Client {client_id} disconnected from room {room_id}")
            
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
                if room_id in self.ice_candidates:
                    del self.ice_candidates[room_id]
    
    async def send_personal_message(self, message: dict, room_id: str, client_id: str):
        """Отправляет сообщение конкретному клиенту"""
        if room_id in self.active_connections and client_id in self.active_connections[room_id]:
            try:
                await self.active_connections[room_id][client_id].send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to {client_id}: {e}")
                self.disconnect(room_id, client_id)
    
    async def broadcast(self, message: dict, room_id: str, exclude_client: str = None):
        """Транслирует сообщение всем в комнате, кроме отправителя"""
        if room_id not in self.active_connections:
            return
        
        for client_id, connection in list(self.active_connections[room_id].items()):
            if client_id == exclude_client:
                continue
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to {client_id}: {e}")
                self.disconnect(room_id, client_id)
    
    def add_ice_candidate(self, room_id: str, candidate: Dict):
        """Добавляет ICE кандидата для комнаты"""
        if room_id not in self.ice_candidates:
            self.ice_candidates[room_id] = []
        self.ice_candidates[room_id].append(candidate)
    
    def get_ice_candidates(self, room_id: str) -> List[Dict]:
        """Получает все ICE кандидаты для комнаты"""
        return self.ice_candidates.get(room_id, [])

# Создаем менеджер подключений
manager = ConnectionManager()

@router.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    """Обработчик WebSocket для WebRTC сигнализации"""
    await manager.connect(room_id, client_id, websocket)
    
    try:
        # Отправляем накопленные ICE кандидаты новому клиенту
        for candidate in manager.get_ice_candidates(room_id):
            await manager.send_personal_message({
                "type": "ice_candidate",
                "candidate": candidate
            }, room_id, client_id)
        
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "offer":
                # Пересылаем оффер другому клиенту
                await manager.broadcast({
                    "type": "offer",
                    "offer": data.get("offer"),
                    "sender": client_id
                }, room_id, exclude_client=client_id)
            
            elif message_type == "answer":
                # Пересылаем ответ другому клиенту
                await manager.broadcast({
                    "type": "answer",
                    "answer": data.get("answer"),
                    "sender": client_id
                }, room_id, exclude_client=client_id)
            
            elif message_type == "ice_candidate":
                # Сохраняем и пересылаем ICE кандидата
                candidate = data.get("candidate")
                if candidate:
                    manager.add_ice_candidate(room_id, candidate)
                    await manager.broadcast({
                        "type": "ice_candidate",
                        "candidate": candidate,
                        "sender": client_id
                    }, room_id, exclude_client=client_id)
            
            elif message_type == "ping":
                # Ответ на ping-сообщение
                await manager.send_personal_message({
                    "type": "pong"
                }, room_id, client_id)
                
    except WebSocketDisconnect:
        manager.disconnect(room_id, client_id)
        # Уведомляем других клиентов о отключении
        await manager.broadcast({
            "type": "user_disconnected",
            "user_id": client_id
        }, room_id)

@router.get("/webrtc/config")
async def get_webrtc_config():
    """Возвращает конфигурацию WebRTC (STUN/TURN серверы)"""
    return {
        "iceServers": [
            {"urls": settings.STUN_SERVERS},
            *[{"urls": server} for server in settings.TURN_SERVERS]
        ]
    }