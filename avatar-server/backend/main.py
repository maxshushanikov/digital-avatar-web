# avatar-server/backend/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from core.database import init_db
from core.security import setup_cors
from api import chat, webrtc

# Инициализация базы данных
init_db()

# Создание приложения
app = FastAPI(title="Digital Avatar API")

# Настройка CORS
setup_cors(app)

# Подключение роутеров
app.include_router(chat.router)
app.include_router(webrtc.router)

# Монтирование статических файлов
# ИСПРАВЛЕНО: Используем правильные пути внутри контейнера
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)