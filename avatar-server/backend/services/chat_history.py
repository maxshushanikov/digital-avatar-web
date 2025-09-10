# avatar-server/backend/services/chat_history.py
import uuid
import time
from typing import List, Dict

from core.database import get_db_connection
from models.chat import ChatMessage

def save_message(session_id: str, role: str, content: str):
    """Сохраняет сообщение в историю чата"""
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO chat_history (id, session_id, role, content, ts) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), session_id, role, content, time.time())
        )

def get_history(session_id: str, limit: int = 30) -> List[ChatMessage]:
    """Получает историю чата для сессии"""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT role, content, ts FROM chat_history WHERE session_id=? ORDER BY ts DESC LIMIT ?",
            (session_id, limit)
        ).fetchall()
    
    # Конвертируем в объекты ChatMessage
    history = [
        ChatMessage(role=row["role"], content=row["content"], ts=row["ts"])
        for row in rows
    ]
    
    # Сортируем по времени (от старых к новым)
    return sorted(history, key=lambda x: x.ts)