# digital_avatar/avatar-server/backend/core/config.py
from pydantic import BaseModel, field_validator
from pydantic_settings import BaseSettings
from typing import List, Optional
from pathlib import Path


class WebRTCConfig(BaseModel):
    """Конфигурация WebRTC серверов"""
    stun_servers: List[str] = ["stun:stun.l.google.com:19302"]
    turn_servers: List[str] = []
    turn_username: Optional[str] = None
    turn_credential: Optional[str] = None

    def get_ice_servers(self) -> List[dict]:
        """Возвращает конфигурацию ICE-серверов в формате RTCConfiguration"""
        ice_servers = [{"urls": url} for url in self.stun_servers]
        
        if self.turn_servers and self.turn_username and self.turn_credential:
            ice_servers.append({
                "urls": self.turn_servers,
                "username": self.turn_username,
                "credential": self.turn_credential
            })
        return ice_servers


class Settings(BaseSettings):
    """
    Настройки приложения.
    Значения могут быть переопределены через переменные окружения или .env файл.
    """

    # --- Сервисные URL ---
    OLLAMA_URL: str = "http://ollama:11434"
    TTS_URL: str = "http://tts-server:5002"

    # --- CORS ---
    ALLOWED_ORIGINS: str = "http://localhost:8000,http://127.0.0.1:8000"  # Безопасный дефолт
    ALLOW_CREDENTIALS: bool = True

    # --- База данных ---
    DB_PATH: str = "postgresql://avatar_user:avatar_pass@db:5432/avatar_db"

    # --- Сервер ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # --- LLM ---
    DEFAULT_MODEL: str = "llama3"
    DEFAULT_TEMPERATURE: float = 0.7
    MAX_TOKENS: int = 256
    OLLAMA_TIMEOUT: int = 60  # секунды

    # --- Чат ---
    HISTORY_LIMIT: int = 12
    SESSION_EXPIRE_HOURS: int = 24

    # --- Язык ---
    FORCE_RUSSIAN: bool = True
    SYSTEM_PROMPT: str = """
    ТЫ ДОЛЖЕН ОТВЕЧАТЬ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ!
    НИКОГДА не используй английские слова или фразы в ответах.
    Если тебя спрашивают на английском, ответь: "Извините, я могу отвечать только на русском языке".
    Твои ответы должны быть краткими и понятными.
    Отвечай только на русском языке, без исключений.
    Если ты не знаешь ответа на вопрос, так и скажи на русском языке.
    """

    # --- WebRTC ---
    WEBRTC_CONFIG: WebRTCConfig = WebRTCConfig()

    # --- Пути ---
    DATA_DIR: Path = Path("./data")
    AUDIO_CACHE_DIR: Path = Path("./data/audio")

    # --- Таймауты ---
    HTTPX_TIMEOUT: int = 30
    DB_CONNECT_RETRY_DELAY: int = 2
    DB_MAX_RETRIES: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # Игнорировать лишние поля в .env

    # --- Валидаторы (Pydantic v2) ---
    @field_validator("DB_PATH", mode="before")
    @classmethod
    def validate_db_path(cls, v):
        if not v:
            raise ValueError("DB_PATH cannot be empty")
        return v

    @field_validator("AUDIO_CACHE_DIR", "DATA_DIR", mode="before")
    @classmethod
    def create_dirs(cls, v):
        path = Path(v)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def validate_origins(cls, v):
        if isinstance(v, str):
            origins = [origin.strip() for origin in v.split(",") if origin.strip()]
            if not origins:
                raise ValueError("ALLOWED_ORIGINS не может быть пустым")
            if "*" in origins:
                print("⚠️  ВНИМАНИЕ: ALLOWED_ORIGINS='*' — разрешены все источники. Это небезопасно в продакшене!")
        return v


# --- Единый экземпляр настроек ---
settings = Settings()


# --- Вспомогательные функции ---
def get_allowed_origins() -> List[str]:
    """Возвращает список разрешённых CORS-источников."""
    raw = settings.ALLOWED_ORIGINS
    if raw == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]