# avatar-server/backend/models/__init__.py
from .chat import ChatRequest, ChatResponse, ChatMessage
from .tts import TTSRequest, TTSResponse

__all__ = [
    "ChatRequest",
    "ChatResponse",
    "ChatMessage",
    "TTSRequest",
    "TTSResponse"
]