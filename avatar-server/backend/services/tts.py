# digital_avatar/avatar-server/backend/services/tts.py
import httpx
import hashlib
import logging
from pathlib import Path
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_exponential

from core.config import settings

logger = logging.getLogger(__name__)

# Каталог для кэша аудио (внутри контейнера)
CACHE_DIR = Path("data/audio")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, max=10),
    reraise=True
)
async def generate_audio(text: str) -> Optional[str]:
    """
    Генерирует аудио через TTS-сервер и возвращает URL прокси.
    
    Возвращает:
        Проксированный URL вида `/tts-audio/filename.wav` или None
    """
    if not await is_tts_available():
        logger.warning("TTS server is not available. Skipping audio generation.")
        return None

    # Хэшируем текст для уникального имени файла
    text_hash = hashlib.md5(text.strip().encode('utf-8')).hexdigest()
    filename = f"{text_hash}.wav"
    filepath = CACHE_DIR / filename

    # Если аудио уже закэшировано — используем его
    if filepath.exists():
        logger.debug(f"Audio cache hit: {filename}")
        return f"/tts-audio/{filename}"

    # Отправляем запрос на генерацию
    tts_payload = {"text": text.strip()}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{settings.TTS_URL}/tts", json=tts_payload)
            response.raise_for_status()
            result = response.json()

            audio_url = result.get("audio_url")
            if not audio_url:
                logger.error("TTS server returned no 'audio_url'")
                return None

            # Скачиваем аудиофайл из TTS-сервера
            audio_response = await client.get(f"{settings.TTS_URL}{audio_url}")
            audio_response.raise_for_status()

            # Сохраняем в общий кэш
            filepath.write_bytes(audio_response.content)
            logger.info(f"✅ Аудио сохранено в кэш: {filename}")

            # Возвращаем путь к нашему прокси-эндпоинту
            return f"/tts-audio/{filename}"

    except Exception as e:
        logger.exception(f"❌ Ошибка при генерации аудио: {e}")
        return None


async def is_tts_available() -> bool:
    """Проверяет, доступен ли TTS-сервер."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{settings.TTS_URL}/health")
            return response.status_code == 200
    except Exception as e:
        logger.debug(f"TTS health check failed: {e}")
        return False


async def check_tts_health() -> dict:
    """Возвращает детальную информацию о состоянии TTS-сервера."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{settings.TTS_URL}/health")
            return {
                "status": "healthy",
                "code": response.status_code,
                "response_time": response.elapsed.total_seconds(),
                "timestamp": __import__("time").time()
            }
    except Exception as e:
        return {
            "status": "unreachable",
            "error": str(e),
            "timestamp": __import__("time").time()
        }