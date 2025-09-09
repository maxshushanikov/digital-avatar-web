# tts-server/server.py
import os
import time
import hashlib
from flask import Flask, request, jsonify, send_from_directory
from TTS.api import TTS

app = Flask(__name__)

CACHE_DIR = "./tts-cache"
os.makedirs(CACHE_DIR, exist_ok=True)

# Multilingual model (supports ru/en). You can change to any Coqui model available locally.
MODEL_NAME = os.getenv("TTS_MODEL", "tts_models/multilingual/multi-dataset/your_tts")

# Lazy load on first request to reduce container start time
_tts = None
def get_tts():
    global _tts
    if _tts is None:
        _tts = TTS(MODEL_NAME)
    return _tts

@app.route("/tts", methods=["POST"])
def tts():
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    voice = data.get("voice", None)  # for speaker embedding if model supports
    lang = data.get("lang", "ru")
    if not text:
        return jsonify({"error": "text is required"}), 400

    key = hashlib.sha256(f"{MODEL_NAME}|{lang}|{voice}|{text}".encode("utf-8")).hexdigest()
    wav_name = f"{key}.wav"
    wav_path = os.path.join(CACHE_DIR, wav_name)

    if not os.path.exists(wav_path):
        tts = get_tts()
        # Generate wav
        if "your_tts" in MODEL_NAME:
            # YourTTS supports language + speaker
            tts.tts_to_file(text=text, file_path=wav_path, speaker=voice, language=lang)
        else:
            tts.tts_to_file(text=text, file_path=wav_path)

    return jsonify({"audio_url": f"/audio/{wav_name}"}), 200

@app.route("/audio/<path:filename>")
def audio(filename):
    return send_from_directory(CACHE_DIR, filename, as_attachment=False)

if __name__ == "__main__":
    app.run(host=os.getenv("HOST","0.0.0.0"), port=int(os.getenv("PORT","5002")))
