# digital_avatar/avatar-server/backend/services/chat_history.py
"""
Сервис для работы с историей чата через SQLAlchemy
"""
import uuid
import time
from typing import List
from core.database import get_db_connection
from models.chat import ChatMessage
from models.db import ChatHistory

def save_message(session_id: str, role: str, content: str):
    """Сохраняет сообщение в БД"""
    with get_db_connection() as db:
        record = ChatHistory(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role=role,
            content=content,
            ts=time.time()
        )
        db.add(record)
        db.commit()

def get_history(session_id: str, limit: int = 12) -> List[ChatMessage]:
    with get_db_connection() as db:
        records = (
            db.query(ChatHistory)
            .filter(ChatHistory.session_id == session_id)
            .order_by(ChatHistory.ts.asc())
            .limit(limit)
            .all()
        )
        return [
            ChatMessage(
                id=r.id or str(uuid.uuid4()),
                role=r.role,
                content=r.content,
                timestamp=r.ts  # используем timestamp, а не ts
            )
            for r in records
        ]