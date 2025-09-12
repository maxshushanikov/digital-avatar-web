import httpx
from typing import Optional
import hashlib
import os
from pathlib import Path
import asyncio
import logging
from tenacity import retry, stop_after_attempt, wait_exponential

from core.config import settings

logger = logging.getLogger(__name__)

# Создаем директорию для кэша, если она не существует
Path("tts_cache").mkdir(exist_ok=True)

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def generate_audio(text: str, session_id: str) -> Optional[str]:
    """
    Генерирует аудио через TTS-сервер и сохраняет в кэш
    """
    if not await is_tts_available():
        return None
    
    # Создаем хэш для имени файла
    text_hash = hashlib.md5(text.encode()).hexdigest()
    cache_dir = Path(f"tts_cache/{session_id}")
    cache_dir.mkdir(exist_ok=True)
    cache_path = cache_dir / f"{text_hash}.wav"
    
    # Если файл уже существует, возвращаем путь
    if cache_path.exists():
        return str(cache_path)
    
    # Генерируем новое аудио
    tts_payload = {"text": text}
    
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(f"{settings.TTS_URL}/tts", json=tts_payload)
            response.raise_for_status()
            tts_data = response.json()
            audio_url = tts_data.get("audio_url")
            
            if audio_url:
                # Скачиваем аудиофайл
                audio_response = await client.get(f"{settings.TTS_URL}{audio_url}")
                audio_response.raise_for_status()
                
                # Сохраняем в кэш
                cache_path.write_bytes(audio_response.content)
                logger.info(f"Audio cached: {cache_path}")
                
                return str(cache_path)
                
            return None
            
        except Exception as e:
            logger.error(f"TTS service error: {e}")
            return None

async def is_tts_available() -> bool:
    """Проверяет доступность TTS-сервера"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{settings.TTS_URL}/health")
            return response.status_code == 200
    except Exception as e:
        logger.error(f"TTS health check failed: {e}")
        return False

async def check_tts_health() -> Dict[str, Any]:
    """Проверяет здоровье TTS сервиса"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{settings.TTS_URL}/health")
            return {
                "status": "healthy" if response.status_code == 200 else "unhealthy",
                "response_time": response.elapsed.total_seconds()
            }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }