# digital_avatar/avatar-server/backend/core/security.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from .config import get_allowed_origins, settings

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Логирование входящих запросов
        print(f"Incoming request: {request.method} {request.url}")
        response = await call_next(request)
        print(f"Response: {response.status_code}")
        return response

def setup_cors(app: FastAPI):
    """Настройка CORS для приложения"""
    origins = get_allowed_origins()
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"]
    )
    
    # Добавляем middleware для логирования
    app.add_middleware(LoggingMiddleware)
    
    # Добавляем обработку WebSocket CORS
    @app.middleware("http")
    async def websocket_cors_middleware(request: Request, call_next):
        if request.url.path.startswith("/ws/"):
            response = await call_next(request)
            response.headers["Access-Control-Allow-Origin"] = ", ".join(origins)
            response.headers["Access-Control-Allow-Credentials"] = "true"
            return response
        return await call_next(request)