FROM python:3.11-slim

WORKDIR /app

# Копируем зависимости
COPY avatar-server/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код
COPY avatar-server/backend /app/

# Копируем frontend и assets
COPY avatar-server/frontend /app/frontend
COPY assets /app/assets

# Запуск
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]