# avatar-server/backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Копируем requirements.txt из подкаталога backend
COPY avatar-server/backend/requirements.txt .

# Установка зависимостей
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь код бэкенда
COPY avatar-server/backend /app/

# Копируем frontend и assets в соответствующие директории
COPY avatar-server/frontend /app/frontend
COPY assets /app/assets

# Запуск приложения
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]