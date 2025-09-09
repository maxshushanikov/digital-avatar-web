import os
import time
import hashlib
import torch
import soundfile as sf
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CACHE_DIR = "./tts-cache"
os.makedirs(CACHE_DIR, exist_ok=True)

# Загрузка модели Silero
_model = None
_device = torch.device('cpu')
_speaker = 'aidar'  # Доступные голоса: aidar, baya, kseniya, xenia, eugene
_sample_rate = 48000

def get_model():
    global _model, _sample_rate
    if _model is None:
        try:
            print("Loading Silero TTS model...")
            torch.set_num_threads(4)
            _model, example_text = torch.hub.load(
                repo_or_dir='snakers4/silero-models',
                model='silero_tts',
                language='ru',
                speaker='ru_v3',
                trust_repo=True
            )
            _model.to(_device)
            print("Silero TTS model loaded successfully.")
            return _model
        except Exception as e:
            print(f"Error loading Silero TTS model: {e}")
            return None
    return _model

@app.route("/health", methods=["GET"])
def health():
    try:
        model = get_model()
        if model is not None:
            return jsonify({"status": "healthy", "model_loaded": True}), 200
        else:
            return jsonify({"status": "unhealthy", "model_loaded": False}), 500
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/tts", methods=["POST"])
def tts():
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    key = hashlib.sha256(f"silero|{_speaker}|{text}".encode("utf-8")).hexdigest()
    wav_name = f"{key}.wav"
    wav_path = os.path.join(CACHE_DIR, wav_name)

    if not os.path.exists(wav_path):
        try:
            model = get_model()
            if model is None:
                return jsonify({"error": "TTS model not loaded"}), 500
                
            print(f"Generating audio for text: {text}")
            audio = model.apply_tts(
                text=text,
                speaker=_speaker,
                sample_rate=_sample_rate
            )
            
            # Сохраняем аудио в файл
            sf.write(wav_path, audio, _sample_rate)
            print(f"Audio saved to: {wav_path}")
            
        except Exception as e:
            print(f"TTS generation error: {e}")
            return jsonify({"error": f"TTS generation failed: {str(e)}"}), 500

    return jsonify({"audio_url": f"/audio/{wav_name}"}), 200

@app.route("/audio/<path:filename>")
def audio(filename):
    return send_from_directory(CACHE_DIR, filename, as_attachment=False)

if __name__ == "__main__":
    app.run(host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "5002")))