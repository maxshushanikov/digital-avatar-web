# digital_avatar/avatar-server/backend/api/webrtc.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import Dict, List, Optional
import asyncio
import logging
import re
from datetime import datetime

from core.config import settings
from models.webrtc import WebrtcOffer, WebrtcAnswer, WebrtcIceCandidate

router = APIRouter()
logger = logging.getLogger(__name__)

# Регулярные выражения для валидации ID
VALID_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,50}$')

def is_valid_id(value: str) -> bool:
    """Проверяет, является ли строка допустимым ID"""
    return bool(value and VALID_ID_PATTERN.match(value))

class ConnectionManager:
    """
    Менеджер для управления WebRTC сигнальными соединениями.
    Поддерживает комнаты, рассылку офферов, ответов и ICE-кандидатов.
    """
    
    def __init__(self):
        # {room_id: {client_id: WebSocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # {room_id: [ICE кандидаты]}
        self.pending_candidates: Dict[str, List[dict]] = {}
        # Активность по комнатам
        self.room_activity: Dict[str, dict] = {}
        # Интервал heartbeat
        self.HEARTBEAT_INTERVAL = 30  # секунд

    async def connect(self, room_id: str, client_id: str, websocket: WebSocket):
        """Подключает клиента к комнате."""
        if not is_valid_id(room_id):
            raise ValueError("Invalid room_id")
        if not is_valid_id(client_id):
            raise ValueError("Invalid client_id")

        await websocket.accept()

        # Инициализация комнаты
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
            self.pending_candidates[room_id] = []
            self.room_activity[room_id] = {
                "created_at": datetime.utcnow(),
                "clients": set()
            }

        # Добавление клиента
        self.active_connections[room_id][client_id] = websocket
        self.room_activity[room_id]["clients"].add(client_id)

        logger.info(f"Client {client_id} connected to room {room_id}")

        # Запуск heartbeat
        asyncio.create_task(self._heartbeat(websocket, room_id, client_id))

    def disconnect(self, room_id: str, client_id: str):
        """Отключает клиента от комнаты."""
        if room_id in self.active_connections and client_id in self.active_connections[room_id]:
            del self.active_connections[room_id][client_id]
            if room_id in self.room_activity:
                self.room_activity[room_id]["clients"].discard(client_id)
            logger.info(f"Client {client_id} disconnected from room {room_id}")

            # Удаление пустой комнаты
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
                if room_id in self.pending_candidates:
                    del self.pending_candidates[room_id]
                if room_id in self.room_activity:
                    del self.room_activity[room_id]

    async def _heartbeat(self, websocket: WebSocket, room_id: str, client_id: str):
        """Отправляет ping-сообщения для проверки активности."""
        while True:
            try:
                await asyncio.sleep(self.HEARTBEAT_INTERVAL)
                await websocket.send_json({"type": "ping"})
            except Exception:
                self.disconnect(room_id, client_id)
                break

    async def send_personal_message(self, message: dict, room_id: str, client_id: str):
        """Отправляет сообщение конкретному клиенту."""
        connection = self.get_connection(room_id, client_id)
        if not connection:
            return
        try:
            await connection.send_json(message)
        except Exception as e:
            logger.error(f"Error sending message to {client_id}: {e}")
            self.disconnect(room_id, client_id)

    async def broadcast(self, message: dict, room_id: str, exclude_client: Optional[str] = None):
        """Рассылает сообщение всем участникам комнаты."""
        connections = self.active_connections.get(room_id, {})
        for client_id, connection in list(connections.items()):
            if client_id == exclude_client:
                continue
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to {client_id}: {e}")
                self.disconnect(room_id, client_id)

    def add_ice_candidate(self, room_id: str, candidate: dict):
        """Сохраняет ICE-кандидат для будущих подключений."""
        if room_id not in self.pending_candidates:
            self.pending_candidates[room_id] = []
        self.pending_candidates[room_id].append(candidate)

    def get_ice_candidates(self, room_id: str) -> List[dict]:
        """Возвращает все накопленные ICE-кандидаты для комнаты."""
        return self.pending_candidates.get(room_id, [])

    def get_connection(self, room_id: str, client_id: str) -> Optional[WebSocket]:
        """Безопасное получение соединения."""
        return self.active_connections.get(room_id, {}).get(client_id)

    def get_room_count(self) -> int:
        """Количество активных комнат."""
        return len(self.active_connections)

    def get_client_count(self) -> int:
        """Общее количество активных клиентов."""
        return sum(len(clients) for clients in self.active_connections.values())


manager = ConnectionManager()


@router.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    """
    WebRTC сигнальный канал.
    URL: /ws/{room_id}/{client_id}
    """
    # Валидация параметров
    if not is_valid_id(room_id):
        await websocket.close(code=4001, reason="Invalid room ID")
        return
    if not is_valid_id(client_id):
        await websocket.close(code=4002, reason="Invalid client ID")
        return

    try:
        await manager.connect(room_id, client_id, websocket)

        # Отправляем ранее накопленные ICE-кандидаты
        for candidate in manager.get_ice_candidates(room_id):
            await manager.send_personal_message({
                "type": "ice_candidate",
                "candidate": candidate
            }, room_id, client_id)

        # Основной цикл приёма сообщений
        while True:
            try:
                data = await websocket.receive_json()

                msg_type = data.get("type")
                if not msg_type:
                    continue

                # Валидация типа сообщения
                if msg_type not in ("offer", "answer", "ice_candidate", "ping"):
                    logger.warning(f"Unknown message type from {client_id}: {msg_type}")
                    continue

                # Обработка offer
                if msg_type == "offer":
                    offer_data = data.get("offer")
                    if not isinstance(offer_data, dict):
                        continue
                    await manager.broadcast({
                        "type": "offer",
                        "offer": offer_data,
                        "sender": client_id
                    }, room_id, exclude_client=client_id)

                # Обработка answer
                elif msg_type == "answer":
                    answer_data = data.get("answer")
                    if not isinstance(answer_data, dict):
                        continue
                    await manager.broadcast({
                        "type": "answer",
                        "answer": answer_data,
                        "sender": client_id
                    }, room_id, exclude_client=client_id)

                # Обработка ICE-кандидата
                elif msg_type == "ice_candidate":
                    candidate = data.get("candidate")
                    if not isinstance(candidate, dict):
                        continue
                    manager.add_ice_candidate(room_id, candidate)
                    await manager.broadcast({
                        "type": "ice_candidate",
                        "candidate": candidate,
                        "sender": client_id
                    }, room_id, exclude_client=client_id)

                # Ответ на ping
                elif msg_type == "ping":
                    await manager.send_personal_message({"type": "pong"}, room_id, client_id)

            except KeyError as e:
                logger.warning(f"Missing field in message: {e}")
            except Exception as e:
                logger.error(f"Error processing message from {client_id}: {e}")
                break

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_id, client_id)
        # Уведомляем других участников
        await manager.broadcast({
            "type": "user_disconnected",
            "user_id": client_id
        }, room_id)


@router.get("/webrtc/config")
async def get_webrtc_config():
    """
    Возвращает конфигурацию WebRTC (STUN/TURN серверы).
    Можно использовать для динамической настройки клиента.
    """
    config = {
        "iceServers": [
            {"urls": url.strip()} for url in settings.STUN_SERVERS.split(",") if url.strip()
        ]
    }
    # Добавляем TURN-серверы, если заданы
    if hasattr(settings, "TURN_SERVERS") and settings.TURN_SERVERS:
        turn_urls = [url.strip() for url in settings.TURN_SERVERS.split(",") if url.strip()]
        config["iceServers"].extend([{"urls": url} for url in turn_urls])

    return config


@router.get("/webrtc/status")
async def get_webrtc_status():
    """
    Получить текущую статистику WebRTC-сервера.
    Полезно для мониторинга.
    """
    return {
        "status": "active",
        "rooms": manager.get_room_count(),
        "clients": manager.get_client_count(),
        "timestamp": datetime.utcnow().isoformat()
    }