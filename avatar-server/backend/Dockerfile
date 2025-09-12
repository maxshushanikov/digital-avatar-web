FROM python:3.11-slim

WORKDIR /app

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Копируем requirements.txt
COPY avatar-server/backend/requirements.txt .

# Установка Python зависимостей
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь код бэкенда
COPY avatar-server/backend /app/

# Копируем frontend и assets
COPY avatar-server/frontend /app/frontend
COPY assets /app/assets

# Создаем директории для данных
RUN mkdir -p /app/data /app/tts_cache

# Открываем порт
EXPOSE 8000

# Запуск приложения
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]