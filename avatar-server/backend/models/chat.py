# digital_avatar/avatar-server/backend/models/chat.py
from pydantic import BaseModel, Field
from typing import List, Optional
import datetime

class ChatMessage(BaseModel):
    """
    Модель сообщения в чате.
    
    Пример:
        {
            "id": "a1b2c3d4",
            "role": "user",
            "content": "Привет!",
            "timestamp": 1726159200.123
        }
    """
    id: str = Field(..., description="Уникальный идентификатор сообщения")
    role: str = Field(..., description="Роль отправителя: 'user' или 'assistant'")
    content: str = Field(..., description="Текст сообщения")
    timestamp: float = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).timestamp(),
        description="Временная метка в формате Unix time"
    )

    class Config:
        json_encoders = {
            float: lambda v: round(v, 3)  # Округление timestamp до миллисекунд
        }
        # Запрещаем добавление полей, которых нет в модели
        extra = "forbid"
        # Делаем модель неизменяемой после создания (опционально)
        frozen = False


class ChatRequest(BaseModel):
    """
    Запрос к эндпоинту /api/chat.
    
    Пример:
        {
            "session_id": "session_abc123",
            "message": "Как дела?",
            "temperature": 0.7,
            "model": "llama3"
        }
    """
    session_id: str = Field(..., min_length=1, description="Идентификатор сессии")
    message: str = Field(..., min_length=1, max_length=2000, description="Сообщение пользователя")
    system_prompt: Optional[str] = Field(None, description="Кастомный системный промпт")
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="Параметр случайности генерации (0.0 - детерминированный, 2.0 - очень случайный)"
    )
    max_tokens: int = Field(
        default=256,
        ge=32,
        le=8192,
        description="Максимальное количество токенов в ответе"
    )
    model: str = Field(default="llama3", description="Название модели LLM")

    class Config:
        extra = "forbid"
        json_schema_extra = {
            "example": {
                "session_id": "session_default",
                "message": "Привет! Как мне начать проект на FastAPI?",
                "temperature": 0.7,
                "max_tokens": 512,
                "model": "llama3"
            }
        }


class ChatResponse(BaseModel):
    """
    Ответ от эндпоинта /api/chat.
    
    Пример:
        {
            "text": "Привет! Начни с установки FastAPI...",
            "history": [...],
            "audio_url": "/tts-audio/abc123.wav",
            "message_id": "msg_xyz789"
        }
    """
    text: str = Field(..., description="Текст ответа от LLM")
    history: List[ChatMessage] = Field(
        ..., 
        description="История диалога (включая новое сообщение)"
    )
    audio_url: Optional[str] = Field(None, description="URL к аудиофайлу TTS")
    message_id: str = Field(..., description="ID нового сообщения ассистента")

    class Config:
        extra = "forbid"
        json_schema_extra = {
            "example": {
                "text": "Привет! Могу ли я чем-то помочь?",
                "history": [
                    {
                        "id": "msg_1",
                        "role": "user",
                        "content": "Привет",
                        "timestamp": 1726159200.123
                    },
                    {
                        "id": "msg_2",
                        "role": "assistant",
                        "content": "Привет! Могу ли я чем-то помочь?",
                        "timestamp": 1726159200.456
                    }
                ],
                "audio_url": "/tts-audio/msg_2.wav",
                "message_id": "msg_2"
            }
        }