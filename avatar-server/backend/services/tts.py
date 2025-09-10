# avatar-server/backend/services/tts.py
import httpx
from typing import Optional

from core.config import settings

async def is_tts_available() -> bool:
    """Проверяет доступность TTS-сервера"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{settings.TTS_URL}/health")
            return response.status_code == 200
    except Exception:
        return False

async def generate_audio(text: str) -> Optional[str]:
    """
    Генерирует аудио через TTS-сервер и возвращает URL
    
    Args:
        text: Текст для озвучки
    
    Returns:
        URL к аудиофайлу или None, если TTS недоступен
    """
    if not await is_tts_available():
        return None
    
    tts_payload = {"text": text}
    
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(f"{settings.TTS_URL}/tts", json=tts_payload)
            response.raise_for_status()
            audio_url = response.json().get("audio_url")
            
            # Используем прокси через наш бэкенд вместо прямого URL TTS-сервера
            if audio_url:
                filename = audio_url.split("/")[-1]
                return f"/tts-audio/{filename}"
                
            return None
            
        except Exception as e:
            print(f"TTS service error: {e}")
            return None