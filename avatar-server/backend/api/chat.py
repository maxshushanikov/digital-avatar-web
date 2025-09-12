# digital_avatar/avatar-server/backend/api/chat.py
import time
import uuid
from fastapi import APIRouter, HTTPException, Response
from typing import List, Optional
import logging
import os
from urllib.parse import unquote

import httpx
from core.config import settings
from services import llm, chat_history, tts
from models.chat import ChatRequest, ChatResponse, ChatMessage

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Создание роутера (префикс /api будет добавлен в main.py)
router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest) -> ChatResponse:
    """
    Обрабатывает запрос чата:
    1. Сохраняет сообщение пользователя.
    2. Получает историю диалога.
    3. Запрашивает ответ у LLM.
    4. Сохраняет ответ ассистента.
    5. Генерирует аудио (если TTS доступен).
    6. Формирует и возвращает полный ответ.
    """
    session_id = request.session_id
    user_message = request.message.strip()

    if not user_message:
        raise HTTPException(status_code=400, detail="Сообщение не может быть пустым")

    logger.info(f"Обработка сообщения: session_id={session_id}, message='{user_message[:50]}...'")

    try:
        # --- Шаг 1: Сохраняем сообщение пользователя ---
        try:
            chat_history.save_message(session_id, "user", user_message)
            logger.debug("✅ Сообщение пользователя сохранено")
        except Exception as e:
            logger.error(f"❌ Ошибка сохранения сообщения: {e}")
            raise HTTPException(status_code=500, detail="Не удалось сохранить сообщение")

        # --- Шаг 2: Получаем историю чата ---
        try:
            history = chat_history.get_history(session_id, limit=settings.HISTORY_LIMIT)
            logger.debug(f"📋 История загружена: {len(history)} сообщений")
        except Exception as e:
            logger.warning(f"⚠️ Не удалось получить историю: {e}. Продолжаем без контекста.")
            history = []

        # --- Шаг 3: Получаем ответ от LLM ---
        try:
            assistant_text = await llm.get_llm_response(
                message=user_message,
                history=history,
                system_prompt=request.system_prompt,
                temperature=request.temperature,
                model=request.model
            )
            logger.info(f"💬 LLM ответ: '{assistant_text[:80]}...'")
        except ConnectionError as e:
            logger.error(f"🔗 LLM недоступен: {e}")
            raise HTTPException(status_code=503, detail="Сервис LLM временно недоступен")
        except Exception as e:
            logger.error(f"🤖 Ошибка генерации LLM: {e}")
            raise HTTPException(status_code=500, detail="Ошибка при генерации ответа")

        # --- Шаг 4: Сохраняем ответ ассистента ---
        try:
            chat_history.save_message(session_id, "assistant", assistant_text)
            logger.debug("✅ Ответ ассистента сохранён")
        except Exception as e:
            logger.warning(f"⚠️ Не удалось сохранить ответ: {e}")

        # --- Шаг 5: Генерируем аудио ---
        audio_url: Optional[str] = None
        if settings.TTS_URL:
            try:
                audio_url = await tts.generate_audio(assistant_text)
                if audio_url:
                    logger.debug(f"🔊 Аудио сгенерировано: {audio_url}")
                else:
                    logger.debug("🔇 Аудио не сгенерировано (TTS вернул None)")
            except Exception as e:
                logger.warning(f"⚠️ TTS не удался (не критично): {e}")

        # --- Шаг 6: Формируем финальный ответ ---
        try:
            # Создаём полную историю: старые + новый ответ
            full_history = []
            for msg in history:
                # Гарантируем наличие всех полей
                msg_id = getattr(msg, "id", str(uuid.uuid4()))
                ts_value = getattr(msg, "timestamp", getattr(msg, "ts", time.time()))

                full_history.append(
                    ChatMessage(
                        id=msg_id,
                        role=msg.role,
                        content=msg.content,
                        timestamp=ts_value
                    )
                )

            # Добавляем новый ответ
            new_message_id = str(uuid.uuid4())
            full_history.append(
                ChatMessage(
                    id=new_message_id,
                    role="assistant",
                    content=assistant_text,
                    timestamp=time.time()
                )
            )

            # Сортируем по времени (от самых старых к новым)
            full_history.sort(key=lambda x: x.timestamp)

            # Конвертируем в словари для сериализации
            response = ChatResponse(
                text=assistant_text,
                history=[msg.model_dump() for msg in full_history],  # Pydantic v2
                audio_url=audio_url,
                message_id=new_message_id
            )
            logger.info("✅ Ответ успешно сформирован и отправлен")
            return response

        except Exception as e:
            logger.error(f"❌ Ошибка формирования ответа: {e}")
            raise HTTPException(status_code=500, detail="Не удалось сформировать ответ")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"🚨 Неожиданная ошибка в chat_endpoint: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


# === Прокси для аудиофайлов TTS (GET /tts-audio/{filename}) ===
@router.get("/tts-audio/{filename:path}")
async def proxy_tts_audio(filename: str):
    """
    Проксирует аудиофайлы с TTS-сервера через наш бэкенд.
    Реализует защиту от path traversal и неподдерживаемых форматов.
    """
    try:
        # Декодирование URL
        filename = unquote(filename)
        safe_filename = os.path.basename(filename)

        # Защита от Path Traversal
        if ".." in safe_filename or safe_filename.startswith("."):
            logger.warning(f"🚫 Подозрительный запрос на файл: {filename}")
            raise HTTPException(status_code=400, detail="Недопустимое имя файла")

        # Проверка расширения
        if not safe_filename.lower().endswith(('.wav', '.mp3', '.ogg')):
            raise HTTPException(status_code=400, detail="Неподдерживаемый формат аудио")

        # Запрос к TTS-серверу
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{settings.TTS_URL}/audio/{safe_filename}")
            if response.status_code != 200:
                logger.error(f"❌ TTS-сервер вернул {response.status_code}: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Ошибка TTS")

            # Определение Content-Type
            content_type = "audio/wav"
            if safe_filename.endswith(".mp3"):
                content_type = "audio/mpeg"
            elif safe_filename.endswith(".ogg"):
                content_type = "audio/ogg"

            return Response(
                content=response.content,
                media_type=content_type,
                headers={"Content-Disposition": f"inline; filename={safe_filename}"}
            )

    except httpx.RequestError as e:
        logger.error(f"📡 Ошибка подключения к TTS-серверу: {e}")
        raise HTTPException(status_code=502, detail="Не удалось подключиться к TTS-серверу")
    except Exception as e:
        logger.exception(f"🚨 Ошибка в proxy_tts_audio: {e}")
        raise HTTPException(status_code=500, detail="Ошибка проксирования аудио")