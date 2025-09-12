from fastapi import APIRouter, HTTPException, Response, BackgroundTasks
from typing import List, Dict
import os
from urllib.parse import unquote
from pathlib import Path
import httpx
import asyncio
import json

from core.config import settings
from services import llm, chat_history, tts
from models.chat import ChatRequest, ChatResponse

router = APIRouter()

# Глобальный клиент HTTP для повторного использования
_client = None

async def get_http_client():
    """Получение или создание HTTP клиента"""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
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
        await chat_history.save_message(request.session_id, "user", request.message)
        
        # Получаем историю чата
        history = await chat_history.get_history(
            request.session_id, 
            limit=settings.HISTORY_LIMIT
        )
        
        # Получаем ответ от LLM
        assistant_text = await llm.get_llm_response(
            message=request.message,
            history=history,
            system_prompt=request.system_prompt or settings.SYSTEM_PROMPT,
            temperature=request.temperature,
            model=request.model
        )
        
        # Сохраняем ответ ассистента
        message_id = await chat_history.save_message(
            request.session_id, 
            "assistant", 
            assistant_text
        )
        
        # Генерируем аудио асинхронно в фоне
        audio_url = None
        if settings.TTS_URL:
            background_tasks.add_task(
                tts.generate_audio, 
                assistant_text, 
                request.session_id
            )
            # Формируем URL для ожидания генерации
            audio_url = f"/api/tts-audio/{request.session_id}/{message_id}"
        
        # Получаем обновленную историю
        full_history = await chat_history.get_history(request.session_id)
        
        # Формируем ответ
        return ChatResponse(
            text=assistant_text,
            history=[msg.dict() for msg in full_history],
            audio_url=audio_url,
            message_id=message_id
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

@router.get("/tts-audio/{session_id}/{message_id}")
async def get_tts_audio(session_id: str, message_id: str):
    """
    Получает сгенерированное аудио для сообщения
    """
    try:
        # Проверяем, сгенерировано ли уже аудио
        audio_path = Path(f"tts_cache/{session_id}/{message_id}.wav")
        
        if not audio_path.exists():
            # Если аудио еще не готово, ждем с таймаутом
            for _ in range(10):  # 10 попыток с интервалом 0.5 сек
                await asyncio.sleep(0.5)
                if audio_path.exists():
                    break
            else:
                raise HTTPException(
                    status_code=404, 
                    detail="Audio not ready or not found"
                )
        
        # Возвращаем аудиофайл
        return Response(
            content=audio_path.read_bytes(),
            media_type="audio/wav",
            headers={"Content-Disposition": f"inline; filename={message_id}.wav"}
        )
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get audio: {str(e)}"
        )

@router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, limit: int = 20):
    """
    Получает историю чата для сессии
    """
    try:
        history = await chat_history.get_history(session_id, limit)
        return [msg.dict() for msg in history]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get chat history: {str(e)}"
        )

@router.delete("/chat/history/{session_id}")
async def clear_chat_history(session_id: str):
    """
    Очищает историю чата для сессии
    """
    try:
        await chat_history.clear_history(session_id)
        return {"status": "success", "message": "Chat history cleared"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear chat history: {str(e)}"
        )