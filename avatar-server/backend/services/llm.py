import re
import httpx
from typing import Optional, Dict, Any
import logging
from tenacity import retry, stop_after_attempt, wait_exponential

from core.config import settings
from models.chat import ChatMessage

logger = logging.getLogger(__name__)

def ensure_russian_response(text: str, user_message: str) -> str:
    """
    Проверяет, содержит ли ответ кириллические символы.
    Если нет, возвращает принудительный ответ на русском языке.
    """
    # Удаляем всё, кроме букв и пробелов
    clean_text = re.sub(r'[^а-яА-Яa-zA-Z\s]', '', text)
    
    # Если текст пустой после очистки, возвращаем стандартный ответ
    if not clean_text.strip():
        return "Извините, я не понял ваш вопрос. Пожалуйста, повторите его на русском языке."
    
    # Подсчитываем количество русских и английских символов
    russian_chars = len(re.findall(r'[а-яА-Я]', clean_text))
    english_chars = len(re.findall(r'[a-zA-Z]', clean_text))
    total_chars = len(clean_text.replace(' ', ''))
    
    # Если есть английские символы и их больше 10% от всех символов
    if english_chars > 0 and (english_chars / max(1, total_chars)) > 0.1:
        if re.search(r'[a-zA-Z]', user_message):
            # Если вопрос был на английском, просим повторить на русском
            return "Пожалуйста, задайте ваш вопрос на русском языке. Я могу отвечать только на русском."
        else:
            # Если вопрос был на русском, но ответ на английском
            return "Извините, я могу отвечать только на русском языке. Пожалуйста, повторите ваш вопрос."
    
    # Если ответ уже на русском, возвращаем как есть
    return text

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
async def get_llm_response(
    message: str,
    history: list,
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    model: str = "llama3"
) -> str:
    """
    Получает ответ от LLM через Ollama
    """
    # Подготовка промпта
    messages = []
    messages.append({"role": "system", "content": system_prompt or settings.SYSTEM_PROMPT})
    
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    
    messages.append({"role": "user", "content": message})
    
    # Подготовка payload
    payload = {
        "model": model,
        "messages": messages,
        "options": {"temperature": temperature},
        "stream": False
    }
    
    # Запрос к Ollama
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            response = await client.post(f"{settings.OLLAMA_URL}/api/chat", json=payload)
            response.raise_for_status()
            
            # Парсим JSON ответ
            response_data = response.json()
            assistant_text = response_data["message"]["content"].strip()
            
            # Принудительно проверяем и исправляем язык ответа
            if settings.FORCE_RUSSIAN:
                assistant_text = ensure_russian_response(assistant_text, message)
            
            return assistant_text
            
        except httpx.RequestError as e:
            logger.error(f"Request error to Ollama: {e}")
            raise ConnectionError(f"Request error to Ollama: {str(e)}")
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama HTTP error: {e}")
            raise RuntimeError(f"Ollama HTTP error: {str(e)}")
        except (KeyError, ValueError) as e:
            logger.error(f"Invalid response format from Ollama: {e}")
            raise ValueError(f"Invalid response format from Ollama: {str(e)}")

async def check_ollama_health() -> bool:
    """Проверяет доступность Ollama"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{settings.OLLAMA_URL}/api/tags")
            return response.status_code == 200
    except Exception:
        return False