# avatar-server/backend/core/database.py
import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager
from typing import Iterator, Any

from .config import settings

# Создаем директорию для БД, если она не существует
Path(settings.DB_PATH).parent.mkdir(parents=True, exist_ok=True)

@contextmanager
def get_db_connection() -> Iterator[sqlite3.Connection]:
    """Контекстный менеджер для подключения к БД"""
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    """Инициализация структуры БД"""
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                ts REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_session_id ON chat_history (session_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_ts ON chat_history (ts)
        """)
        conn.commit()