# avatar-server/backend/core/config.py
import os
from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    # Сервисные URL
    OLLAMA_URL: str = "http://ollama:11434"
    TTS_URL: str = "http://tts-server:5002"
    
    # CORS конфигурация
    ALLOWED_ORIGINS: str = "*"
    
    # Путь к БД
    DB_PATH: str = "./chat.db"
    
    # Настройки модели
    DEFAULT_MODEL: str = "llama3"
    DEFAULT_TEMPERATURE: float = 0.7
    
    # Настройки чата
    HISTORY_LIMIT: int = 12
    MAX_TOKENS: int = 256
    
    # Языковые настройки
    FORCE_RUSSIAN: bool = True
    SYSTEM_PROMPT: str = """
    ТЫ ДОЛЖЕН ОТВЕЧАТЬ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ! 
    НИКОГДА не используй английские слова или фразы в ответах.
    Если тебя спрашивают на английском, ответь: "Извините, я могу отвечать только на русском языке".
    Твои ответы должны быть краткими и понятными.
    Отвечай только на русском языке, без исключений.
    Если ты не знаешь ответа на вопрос, так и скажи на русском языке.
    """
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "allow"

# Создаем экземпляр настроек
settings = Settings()

# Для удобства получения списка разрешенных источников
def get_allowed_origins() -> List[str]:
    if settings.ALLOWED_ORIGINS == "*":
        return ["*"]
    return [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]