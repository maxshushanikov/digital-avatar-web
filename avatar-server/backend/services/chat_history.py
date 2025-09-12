import uuid
import time
from typing import List
from datetime import datetime
import aiosqlite

from core.database import get_db_connection
from models.chat import ChatMessage

async def save_message(session_id: str, role: str, content: str) -> str:
    """Сохраняет сообщение в историю чата и возвращает ID сообщения"""
    message_id = str(uuid.uuid4())
    timestamp = time.time()
    
    async with get_db_connection() as conn:
        await conn.execute(
            "INSERT INTO chat_history (id, session_id, role, content, ts) VALUES (?,?,?,?,?)",
            (message_id, session_id, role, content, timestamp)
        )
        await conn.commit()
    
    return message_id

async def get_history(session_id: str, limit: int = 30) -> List[ChatMessage]:
    """Получает историю чата для сессии"""
    async with get_db_connection() as conn:
        rows = await conn.execute_fetchall(
            "SELECT id, role, content, ts FROM chat_history WHERE session_id=? ORDER BY ts DESC LIMIT ?",
            (session_id, limit)
        )
    
    # Конвертируем в объекты ChatMessage
    history = [
        ChatMessage(
            id=row["id"],
            role=row["role"],
            content=row["content"],
            timestamp=row["ts"]
        )
        for row in rows
    ]
    
    # Сортируем по времени (от старых к новым)
    return sorted(history, key=lambda x: x.timestamp)

async def clear_history(session_id: str):
    """Очищает историю чата для сессии"""
    async with get_db_connection() as conn:
        await conn.execute(
            "DELETE FROM chat_history WHERE session_id=?",
            (session_id,)
        )
        await conn.commit()