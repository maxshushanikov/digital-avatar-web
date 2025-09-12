# digital_avatar/avatar-server/backend/core/database.py
"""
Модуль для работы с базой данных через SQLAlchemy (PostgreSQL)
"""
from typing import Iterator
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .config import settings

# Создание движка подключения к PostgreSQL
engine = create_engine(
    settings.DB_PATH.replace("postgresql://", "postgresql+psycopg2://"),
    echo=False  # Включите True для отладки SQL-запросов
)

# Создание фабрики сессий
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@contextmanager
def get_db_connection() -> Iterator[Session]:
    """
    Контекстный менеджер для получения сессии SQLAlchemy.
    Гарантирует закрытие сессии после использования.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def init_db():
    """
    Инициализация базы данных — создаёт таблицы, если они ещё не существуют.
    """
    from models.db import Base
    Base.metadata.create_all(bind=engine)