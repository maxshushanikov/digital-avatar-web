# avatar-server/backend/models/chat.py
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class ChatMessage(BaseModel):
    role: str
    content: str
    ts: float

class ChatRequest(BaseModel):
    session_id: str
    message: str
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 256
    model: str = "llama3"

class ChatResponse(BaseModel):
    text: str
    history: List[Dict[str, Any]]
    audio_url: Optional[str] = None