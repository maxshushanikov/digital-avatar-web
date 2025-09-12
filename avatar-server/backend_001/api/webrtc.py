# avatar-server/backend/api/webrtc.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, room_id: str, websocket: WebSocket):
        """Подключает WebSocket к комнате"""
        await websocket.accept()
        self.rooms.setdefault(room_id, set()).add(websocket)
    
    def disconnect(self, room_id: str, websocket: WebSocket):
        """Отключает WebSocket от комнаты"""
        if room_id in self.rooms:
            self.rooms[room_id].discard(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
    
    async def broadcast(self, room_id: str, message: dict, exclude: WebSocket = None):
        """Транслирует сообщение всем в комнате, кроме отправителя"""
        if room_id not in self.rooms:
            return
        
        for connection in list(self.rooms[room_id]):
            if connection == exclude:
                continue
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(room_id, connection)

# Создаем менеджер подключений
manager = ConnectionManager()

@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """Обработчик WebSocket для WebRTC сигнализации"""
    await manager.connect(room_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast(room_id, data, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)