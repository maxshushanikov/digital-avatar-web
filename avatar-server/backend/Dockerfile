# avatar-server/backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY avatar-server/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем backend
COPY avatar-server/backend/main.py .

# Копируем frontend и assets
COPY avatar-server/frontend /app/frontend
COPY assets /app/assets

ENV HOST=0.0.0.0 PORT=8000
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
