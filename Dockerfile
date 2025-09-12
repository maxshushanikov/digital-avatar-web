FROM python:3.11-slim

WORKDIR /app

COPY avatar-server/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY avatar-server/backend /app/
COPY avatar-server/frontend /app/frontend
COPY assets /app/assets

COPY avatar-server/backend/wait_for_db.py /app/wait_for_db.py

CMD ["sh", "-c", "python /app/wait_for_db.py && uvicorn main:app --host 0.0.0.0 --port 8000"]