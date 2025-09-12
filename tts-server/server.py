# digital_avatar/tts-server/server.py
import os
import sys
import hashlib
import traceback
from pathlib import Path

import torch
import soundfile as sf
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --- Настройки ---
CACHE_DIR = Path(os.getenv("TTS_CACHE_DIR", "./tts-cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

DEVICE = torch.device('cpu')  # Используйте 'cuda' если есть GPU
SPEAKER = os.getenv("TTS_SPEAKER", "aidar")  # aidar, baya, kseniya, xenia, eugene
SAMPLE_RATE = 48000

# Глобальная переменная для модели
_model = None


def normalize_text(text: str) -> str:
    """Нормализация текста для консистентного кэширования"""
    return text.strip().lower()


def get_model():
    """Ленивая загрузка модели при первом вызове."""
    global _model
    if _model is not None:
        return _model

    print("🔄 Загрузка модели Silero TTS...")

    try:
        torch.set_num_threads(int(os.getenv("TORCH_NUM_THREADS", "4")))
        
        # Явная загрузка репозитория
        repo_or_dir = 'snakers4/silero-models'
        model, _ = torch.hub.load(
            repo_or_dir=repo_or_dir,
            model='silero_tts',
            language='ru',
            speaker='ru_v3',
            trust_repo=True,
            force_reload=False
        )
        model.to(DEVICE)
        _model = model
        print(f"✅ Модель Silero TTS успешно загружена на {DEVICE}")
        return _model

    except ModuleNotFoundError as e:
        if "numba" in str(e):
            print("❌ Ошибка: требуется установка numba. Выполните: pip install numba")
        else:
            print(f"❌ Ошибка импорта: {e}")
        print(traceback.format_exc())
        sys.exit(1)

    except Exception as e:
        print(f"❌ Критическая ошибка при загрузке модели: {type(e).__name__}: {e}")
        print(traceback.format_exc())
        sys.exit(1)


@app.route("/health", methods=["GET"])
def health():
    """Проверка состояния TTS-сервера"""
    try:
        model = get_model()
        cache_files = len(list(CACHE_DIR.glob("*.wav")))
        return jsonify({
            "status": "healthy",
            "model_loaded": model is not None,
            "cache_size": cache_files,
            "device": str(DEVICE),
            "speaker": SPEAKER,
            "cache_dir": str(CACHE_DIR.absolute())
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@app.route("/tts", methods=["POST"])
def tts():
    """Генерация речи из текста"""
    try:
        # Парсим JSON
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request must be valid JSON"}), 400

        text = data.get("text", "").strip()
        if not text:
            return jsonify({"error": "Поле 'text' обязательно и не может быть пустым"}), 400

        # Нормализуем текст для кэша
        normalized_text = normalize_text(text)
        text_hash = hashlib.sha256(f"silero|{SPEAKER}|{normalized_text}".encode("utf-8")).hexdigest()
        wav_path = CACHE_DIR / f"{text_hash}.wav"

        # Если аудио уже есть — используем кэш
        if wav_path.exists():
            print(f"🎧 Кэш найден: {text_hash[:8]}... → {text}")
        else:
            # Загружаем модель
            model = get_model()
            if model is None:
                return jsonify({"error": "Модель TTS не загружена"}), 500

            print(f"🎙️ Генерация аудио: '{text}'")

            try:
                audio = model.apply_tts(
                    text=text + ".",  # Добавляем точку для естественной интонации
                    speaker=SPEAKER,
                    sample_rate=SAMPLE_RATE,
                    put_accent=True,
                    put_yo=True
                )
                sf.write(str(wav_path), audio.numpy(), SAMPLE_RATE)
                print(f"💾 Аудио сохранено: {wav_path.name}")

            except TypeError as te:
                if "expected np.ndarray" in str(te):
                    print("⚠️ Возможный баг Silero: TypeError при записи файла")
                    # Попробуем преобразовать в numpy явно
                    try:
                        audio_np = audio.detach().numpy() if hasattr(audio, 'detach') else audio.numpy()
                        sf.write(str(wav_path), audio_np, SAMPLE_RATE)
                        print("✅ Аудио успешно сохранено после ручного преобразования")
                    except Exception as save_error:
                        print(f"❌ Ошибка сохранения: {save_error}")
                        return jsonify({"error": "Не удалось сохранить аудио"}), 500
                else:
                    print(f"❌ Неожиданный TypeError: {te}")
                    return jsonify({"error": f"Ошибка генерации: {str(te)}"}), 500

            except Exception as e:
                print(f"❌ Ошибка генерации TTS: {e}")
                print(traceback.format_exc())
                return jsonify({"error": f"TTS generation failed: {str(e)}"}), 500

        # Возвращаем URL
        audio_url = f"/audio/{wav_path.name}"
        return jsonify({"audio_url": audio_url}), 200

    except Exception as e:
        print(f"❌ Внутренняя ошибка сервера: {e}")
        print(traceback.format_exc())
        return jsonify({"error": "Internal server error"}), 500


@app.route("/audio/<filename>")
def serve_audio(filename):
    """Отдаёт аудиофайл из кэша"""
    if ".." in filename or filename.startswith("."):
        return jsonify({"error": "Invalid filename"}), 400

    file_path = CACHE_DIR / filename
    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404

    try:
        return send_from_directory(CACHE_DIR, filename, mimetype="audio/wav")
    except Exception as e:
        print(f"❌ Ошибка отправки файла: {e}")
        return jsonify({"error": "Failed to send file"}), 500


if __name__ == "__main__":
    # При старте проверяем доступность модели
    print("🚀 Запуск TTS-сервера...")
    get_model()  # Принудительно загружаем модель при старте

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5002))
    debug = os.getenv("FLASK_DEBUG", "0").lower() in ("1", "true", "on")

    print(f"🌐 TTS-сервер слушает http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)