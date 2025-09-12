from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str
    content: str
    timestamp: float = Field(default_factory=lambda: datetime.now().timestamp())
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.timestamp()
        }

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
    message_id: str

class WebrtcOffer(BaseModel):
    sdp: str
    type: str = "offer"

class WebrtcAnswer(BaseModel):
    sdp: str
    type: str = "answer"

class WebrtcIceCandidate(BaseModel):
    candidate: str
    sdpMid: Optional[str] = None
    sdpMLineIndex: Optional[int] = None