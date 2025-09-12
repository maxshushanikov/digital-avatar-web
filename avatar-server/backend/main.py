# digital_avatar/avatar-server/backend/main.py
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import json
import logging

from core.database import init_db
from core.security import setup_cors
from core.config import settings
from api import chat, webrtc

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Инициализация базы данных
init_db()

# Создание приложения
app = FastAPI(
    title="Digital Avatar API",
    description="Backend for Digital Avatar project with WebRTC support",
    version="1.0.0"
)

# Настройка CORS
setup_cors(app)

# Подключение роутеров
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(webrtc.router, prefix="/api", tags=["webrtc"])

# Монтирование статических файлов
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

# Глобальные переменные для управления подключениями
active_connections = {}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "services": {
            "database": "connected",
            "webrtc": "active",
            "tts": "available" if settings.TTS_URL else "disabled"
        }
    }

@app.get("/api/status")
async def status():
    """Get server status"""
    return {
        "connections": len(active_connections),
        "version": "1.0.0"
    }

@app.websocket("/ws/status")
async def websocket_status(websocket: WebSocket):
    """WebSocket for real-time status updates"""
    await websocket.accept()
    try:
        while True:
            await asyncio.sleep(5)
            status_data = {
                "connections": len(active_connections),
                "timestamp": asyncio.get_event_loop().time()
            }
            await websocket.send_json(status_data)
    except WebSocketDisconnect:
        pass

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Global error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host=settings.HOST if hasattr(settings, 'HOST') else "0.0.0.0", 
        port=settings.PORT if hasattr(settings, 'PORT') else 8000
    )