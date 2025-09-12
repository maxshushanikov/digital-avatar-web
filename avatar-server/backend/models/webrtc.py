# digital_avatar/avatar-server/backend/models/webrtc.py
from pydantic import BaseModel
from typing import Optional

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