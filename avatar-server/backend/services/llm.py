# digital_avatar/avatar-server/backend/services/llm.py
import re
import httpx
from typing import Optional, Dict, Any
from core.config import settings
from models.chat import ChatMessage

def ensure_russian_response(text: str, user_message: str) -> str:
    clean_text = re.sub(r'[^а-яА-Яa-zA-Z\s]', '', text)
    if not clean_text.strip():
        return "Извините, я не понял ваш вопрос. Пожалуйста, повторите его на русском языке."

    russian_chars = len(re.findall(r'[а-яА-Я]', clean_text))
    english_chars = len(re.findall(r'[a-zA-Z]', clean_text))
    total_chars = len(clean_text.replace(' ', ''))

    if english_chars > 0 and (english_chars / max(1, total_chars)) > 0.1:
        if re.search(r'[a-zA-Z]', user_message):
            return "Пожалуйста, задайте ваш вопрос на русском языке. Я могу отвечать только на русском."
        else:
            return "Извините, я могу отвечать только на русском языке. Пожалуйста, повторите ваш вопрос."
    return text

async def get_llm_response(
    message: str,
    history: list,
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    model: str = "llama3"
) -> str:
    messages = []
    messages.append({"role": "system", "content": system_prompt or settings.SYSTEM_PROMPT})
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": message})

    payload = {
        "model": model,
        "messages": messages,
        "options": {"temperature": temperature},
        "stream": False
    }

    print(f"Sending request to Ollama at {settings.OLLAMA_URL}")
    print(f"Payload: {payload}")

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            response = await client.post(f"{settings.OLLAMA_URL}/api/chat", json=payload)
            print(f"Ollama response status: {response.status_code}")
            print(f"Ollama response text: {response.text}")  # Это покажет, если ошибка

            response.raise_for_status()
            response_data = response.json()
            assistant_text = response_data["message"]["content"].strip()

            if settings.FORCE_RUSSIAN:
                assistant_text = ensure_russian_response(assistant_text, message)

            print(f"LLM response: {assistant_text}")
            return assistant_text

        except httpx.RequestError as e:
            print(f"Request error to Ollama: {e}")
            raise ConnectionError(f"Cannot connect to Ollama: {str(e)}")
        except httpx.HTTPStatusError as e:
            print(f"HTTP error from Ollama: {e}, Response: {response.text}")
            raise RuntimeError(f"Ollama returned {response.status_code}: {response.text}")
        except (KeyError, ValueError) as e:
            print(f"Invalid response format: {e}, Response: {response.text}")
            raise ValueError(f"Invalid response from Ollama: {response.text}")