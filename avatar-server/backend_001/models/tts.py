# avatar-server/backend/models/tts.py
from pydantic import BaseModel

class TTSRequest(BaseModel):
    text: str

class TTSResponse(BaseModel):
    audio_url: str