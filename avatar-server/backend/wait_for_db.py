"""
Ждёт готовности PostgreSQL перед запуском приложения.
"""
import time
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def wait_for_db():
    logger.info("Ожидание готовности PostgreSQL...")
    while True:
        try:
            engine = create_engine(
                settings.DB_PATH.replace("postgresql://", "postgresql+psycopg2://"),
                echo=False
            )
            with engine.connect() as conn:
                # Используем text() для RAW SQL
                conn.execute(text("SELECT 1"))
            logger.info("PostgreSQL готов!")
            return
        except OperationalError as e:
            logger.warning(f"БД недоступна: {e}. Жду 2 секунды...")
            time.sleep(2)
        except Exception as e:
            logger.error(f"Неожиданная ошибка: {e}")
            time.sleep(2)

if __name__ == "__main__":
    wait_for_db()