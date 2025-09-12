import sqlite3
import os
import aiosqlite
from pathlib import Path
from contextlib import asynccontextmanager
from typing import AsyncIterator, Any, List, Dict

from .config import settings

# Создаем директорию для БД, если она не существует
Path(settings.DB_PATH).parent.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def get_db_connection() -> AsyncIterator[aiosqlite.Connection]:
    """Асинхронный контекстный менеджер для подключения к БД"""
    conn = await aiosqlite.connect(settings.DB_PATH)
    conn.row_factory = aiosqlite.Row
    try:
        yield conn
        await conn.commit()
    except Exception:
        await conn.rollback()
        raise
    finally:
        await conn.close()

async def init_db():
    """Инициализация структуры БД"""
    async with get_db_connection() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                ts REAL NOT NULL
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_session_id ON chat_history (session_id)
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_ts ON chat_history (ts)
        """)
        await conn.commit()

async def check_db_health() -> bool:
    """Проверка здоровья базы данных"""
    try:
        async with get_db_connection() as conn:
            await conn.execute("SELECT 1")
            return True
    except Exception:
        return False