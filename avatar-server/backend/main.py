# digital_avatar/avatar-server/backend/main.py
# === 🔍 ДИАГНОСТИКА ЗАПУСКА ===
import os
import sys
print("🚀 STARTUP: Digital Avatar Backend")
print(f"📄 CWD: {os.getcwd()}")
print(f"📦 Files in /app: {os.listdir('/app') if os.path.exists('/app') else 'Not found'}")
print(f"🔍 PYTHONPATH: {sys.path}")
# ==============================

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from typing import Dict, Set
import asyncio
import logging

# Локальные импорты
from core.database import init_db
from core.security import setup_cors
from core.config import settings
from api import chat, webrtc

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# === Инициализация базы данных ===
try:
    init_db()
    logger.info("Database initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize database: {e}")
    raise

# === Создание приложения ===
app = FastAPI(
    title="Digital Avatar API",
    description="Backend for Digital Avatar project with WebRTC and LLM support",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc"  # ReDoc
)

# === Настройка CORS (уже добавляет middleware) ===
setup_cors(app)

# === Подключение роутеров с префиксом /api ===
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(webrtc.router, prefix="/api", tags=["webrtc"])

# === Монтирование статических файлов (в правильном порядке!) ===
# Важно: Сначала конкретные пути, потом корень
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
# Корневой маршрут в конце
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

# === WebSocket менеджер для статуса ===
class StatusManager:
    def __init__(self):
        self.connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.connections.discard(websocket)

    async def broadcast(self, data: dict):
        disconnected = []
        for connection in self.connections:
            try:
                await connection.send_json(data)
            except RuntimeError:  # WebSocket is closed
                disconnected.append(connection)
        # Удаляем отключённые соединения
        for conn in disconnected:
            self.disconnect(conn)

status_manager = StatusManager()

# === Health Check с реальной проверкой сервисов ===
@app.get("/health")
async def health_check():
    """Comprehensive health check for all services"""
    checks = {
        "database": False,
        "ollama": False,
        "tts": False if not settings.TTS_URL else None,
        "status": "degraded"
    }

    # Проверка базы данных
    try:
        from core.database import get_db_connection
        with get_db_connection() as db:
            db.execute("SELECT 1")
        checks["database"] = True
    except Exception as e:
        logger.error(f"DB health check failed: {e}")

    # Проверка Ollama
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{settings.OLLAMA_URL}/api/tags")
            checks["ollama"] = response.status_code == 200
    except Exception as e:
        logger.error(f"Ollama health check failed: {e}")

    # Проверка TTS
    if settings.TTS_URL:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{settings.TTS_URL}/health")
                checks["tts"] = response.status_code == 200
        except Exception as e:
            logger.error(f"TTS health check failed: {e}")

    # Общий статус
    if all(checks.values()):
        checks["status"] = "healthy"
    elif checks["database"] and checks["ollama"]:
        checks["status"] = "degraded"
    else:
        checks["status"] = "unhealthy"

    return {"status": checks["status"], "services": checks}

# === API статус ===
@app.get("/api/status")
async def status():
    """Get server status"""
    return {
        "active_connections": len(status_manager.connections),
        "version": app.version,
        "uptime": "N/A"  # Можно добавить таймер при старте
    }

# === WebSocket для реального времени ===
@app.websocket("/ws/status")
async def websocket_status(websocket: WebSocket):
    """WebSocket для обновлений статуса в реальном времени"""
    await status_manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(5)
            status_data = {
                "connections": len(status_manager.connections),
                "timestamp": asyncio.get_event_loop().time(),
                "service_status": "operational"
            }
            await websocket.send_json(status_data)
    except WebSocketDisconnect:
        status_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        status_manager.disconnect(websocket)

# === Глобальный обработчик ошибок ===
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Логирует все необработанные исключения"""
    logger.error(f"Unhandled exception in {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."}
    )

# === Запуск приложения ===
if __name__ == "__main__":
    host = getattr(settings, "HOST", "0.0.0.0")
    port = getattr(settings, "PORT", 8000)
    logger.info(f"Starting server on {host}:{port}")
    import uvicorn
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        reload=False  # Отключаем reload в продакшене
    )