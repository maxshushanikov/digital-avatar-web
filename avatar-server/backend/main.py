# avatar-server/backend/main.py
import os
import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
TTS_URL = os.getenv("TTS_URL", "http://localhost:5002")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
DB_PATH = os.getenv("DB_PATH", "./chat.db")

app = FastAPI(title="Digital Avatar API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGINS] if ALLOWED_ORIGINS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Init DB
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(DB_PATH) as conn:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            role TEXT,
            content TEXT,
            ts REAL
        )
    """)
    conn.commit()

def save_message(session_id: str, role: str, content: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO chat_history (id, session_id, role, content, ts) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), session_id, role, content, time.time())
        )
        conn.commit()

def get_history(session_id: str, limit: int = 30):
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT role, content, ts FROM chat_history WHERE session_id=? ORDER BY ts DESC LIMIT ?",
            (session_id, limit)
        ).fetchall()
    return [{"role": r[0], "content": r[1], "ts": r[2]} for r in rows[::-1]]

class ChatRequest(BaseModel):
    session_id: str
    message: str
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 256
    model: str = "llama3"

class ChatResponse(BaseModel):
    text: str
    history: List[dict]
    audio_url: Optional[str] = None

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        # Build prompt with short history
        history = get_history(req.session_id, limit=12)
        messages = []
        if req.system_prompt:
            messages.append({"role": "system", "content": req.system_prompt})
        for h in history:
            messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": req.message})

        # Save user message
        save_message(req.session_id, "user", req.message)

        # Call Ollama with modern chat API
        payload = {
            "model": req.model,
            "messages": messages,
            "options": {"temperature": req.temperature},
            "stream": False  # Explicitly disable streaming
        }
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
                print("Ollama status:", r.status_code)
                print("Ollama response text:", r.text[:500])  # First 500 chars for debugging
                r.raise_for_status()
                
                # Parse JSON response
                response_data = r.json()
                assistant_text = response_data["message"]["content"].strip()
                
        except httpx.RequestError as e:
            print(f"Request error to Ollama: {e}")
            raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")
        except httpx.HTTPStatusError as e:
            print(f"Ollama HTTP error: {e}")
            raise HTTPException(status_code=e.response.status_code, detail=f"Ollama error: {str(e)}")
        except KeyError as e:
            print(f"Invalid response format from Ollama: {e}")
            raise HTTPException(status_code=500, detail="Invalid response format from Ollama")
        except json.JSONDecodeError as e:
            print(f"JSON decode error from Ollama: {e}")
            print(f"Raw response: {r.text[:500]}")
            raise HTTPException(status_code=500, detail="Invalid JSON response from Ollama")
        except Exception as e:
            print(f"Unexpected error with Ollama: {e}")
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

        save_message(req.session_id, "assistant", assistant_text)

        # Ask TTS server to synthesize and return URL
        tts_payload = {"text": assistant_text, "lang": "ru", "speaker_wav": None}
        audio_url = None
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                rr = await client.post(f"{TTS_URL}/tts", json=tts_payload)
                rr.raise_for_status()
                audio_url = rr.json().get("audio_url")
        except Exception as e:
            print(f"TTS service error: {e}")
            # We don't raise an error here, just continue without audio

        return ChatResponse(text=assistant_text, history=get_history(req.session_id), audio_url=audio_url)
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"Unexpected error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# WebSocket signaling for WebRTC
class ConnectionManager:
    def __init__(self):
        self.rooms = {}  # room_id -> set(ws)

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        self.rooms.setdefault(room_id, set()).add(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.rooms:
            self.rooms[room_id].discard(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]

    async def broadcast(self, room_id: str, message: dict, exclude: Optional[WebSocket] = None):
        if room_id not in self.rooms:
            return
        for ws in list(self.rooms[room_id]):
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(room_id, ws)

manager = ConnectionManager()

@app.websocket("/ws/{room_id}")
async def ws_signaling(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            await manager.broadcast(room_id, msg, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        
@app.get("/.well-known/appspecific/com.chrome.devtools.json")
async def chrome_devtools_json():
    return {}

# Static frontend
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")