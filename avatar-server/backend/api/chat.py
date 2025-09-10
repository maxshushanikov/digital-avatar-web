# avatar-server/backend/api/chat.py
from fastapi import APIRouter, HTTPException, Response
from typing import List, Dict
import os
from urllib.parse import unquote
from pathlib import Path
import httpx  # <-- ЭТОТ ИМПОРТ БЫЛ ДОБАВЛЕН (ОБЯЗАТЕЛЬНО!)

from core.config import settings
from services import llm, chat_history, tts
from models.chat import ChatRequest, ChatResponse, ChatMessage

router = APIRouter()

@router.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Обрабатывает запрос чата:
    1. Сохраняет пользовательское сообщение
    2. Получает ответ от LLM
    3. Сохраняет ответ
    4. Генерирует аудио (если возможно)
    5. Возвращает ответ с историей
    """
    try:
        # Сохраняем сообщение пользователя
        chat_history.save_message(request.session_id, "user", request.message)
        
        # Получаем историю чата
        history = chat_history.get_history(
            request.session_id, 
            limit=settings.HISTORY_LIMIT
        )
        
        # Получаем ответ от LLM
        assistant_text = await llm.get_llm_response(
            message=request.message,
            history=history,
            system_prompt=request.system_prompt,
            temperature=request.temperature,
            model=request.model
        )
        
        # Сохраняем ответ ассистента
        chat_history.save_message(request.session_id, "assistant", assistant_text)
        
        # Генерируем аудио (если возможно)
        audio_url = None
        if settings.TTS_URL:
            audio_url = await tts.generate_audio(assistant_text)
        
        # Формируем ответ
        return ChatResponse(
            text=assistant_text,
            history=[msg.dict() for msg in chat_history.get_history(request.session_id)],
            audio_url=audio_url
        )
        
    except ConnectionError as e:
        raise HTTPException(
            status_code=503, 
            detail=f"Service unavailable: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Internal server error: {str(e)}"
        )

# Прокси для аудиофайлов с TTS-сервера
@router.get("/tts-audio/{filename:path}")
async def proxy_tts_audio(filename: str):
    """
    Проксирует запросы к аудиофайлам с TTS-сервера с защитой от path traversal
    """
    try:
        # Декодируем URL-encoded имя файла
        filename = unquote(filename)
        
        # Проверка на безопасность пути (защита от path traversal)
        if ".." in filename or filename.startswith("/") or filename.startswith("\\"):
            raise HTTPException(
                status_code=400, 
                detail="Invalid filename"
            )
        
        # Проверяем расширение файла
        if not filename.lower().endswith(('.wav', '.mp3', '.ogg')):
            raise HTTPException(
                status_code=400, 
                detail="Unsupported audio format"
            )
        
        # Формируем безопасный путь
        safe_filename = os.path.basename(filename)
        
        # Запрос к TTS-серверу
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{settings.TTS_URL}/audio/{safe_filename}")
            
            # Проверяем статус ответа
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"TTS server error: {response.text}"
                )
            
            # Определяем Content-Type на основе расширения
            content_type = "audio/wav"
            if safe_filename.lower().endswith(".mp3"):
                content_type = "audio/mpeg"
            elif safe_filename.lower().endswith(".ogg"):
                content_type = "audio/ogg"
            
            # Возвращаем аудио с правильным Content-Type
            return Response(
                content=response.content,
                media_type=content_type,
                headers={"Content-Disposition": f"inline; filename={safe_filename}"}
            )
            
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to TTS server: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to proxy audio: {str(e)}"
        )