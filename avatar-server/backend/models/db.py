# digital_avatar/avatar-server/backend/models/db.py
"""
ORM модели для SQLAlchemy
"""
from sqlalchemy import Column, String, Text, Float, Index
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(String, primary_key=True)
    session_id = Column(String, index=True, nullable=False)
    role = Column(String, nullable=False)  # 'user' или 'assistant'
    content = Column(Text, nullable=False)
    ts = Column(Float, index=True)  # timestamp

    # Индекс для ускорения запросов по сессии и времени
    __table_args__ = (
        Index('ix_chat_session_ts', 'session_id', 'ts'),
    )