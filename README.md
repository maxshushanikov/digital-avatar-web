# Digital Avatar Project

A real-time interactive 3D avatar system with voice interaction, emotional expressions, and WebRTC support. Built with a modern open-source stack.

## Features

- **3D Avatar**: GLB model rendering with Three.js
- **Voice Interaction**: Speech-to-Text (Web Speech API) and Text-to-Speech (Coqui TTS)
- **AI Backend**: Open-source LLM (Llama 3) via Ollama
- **Lip Synchronization**: Real-time lip sync with audio analysis
- **Emotions & Gestures**: Dynamic facial expressions and emotive reactions
- **WebRTC Support**: Video call functionality with avatar streaming
- **Chat History**: Persistent conversation storage
- **Mobile Friendly**: Responsive design for mobile devices

## Architecture

```
digital_avatar/
├── docker-compose.yml          # Multi-container setup
├── assets/                     # 3D models and static assets
├── avatar-server/              # Main application (FastAPI + Frontend)
├── tts-server/                 # Text-to-Speech service (Flask + Coqui TTS)
└── data/                       # Database and persistent storage
```

## Prerequisites

- Docker and Docker Compose
- NVIDIA GPU (recommended for TTS performance)
- Modern browser with WebGL and WebRTC support

## Quick Start

1. **Clone and setup**:
```bash
git clone <your-repo>
cd digital_avatar
```

2. **Pull the LLM model**:
```bash
docker compose up ollama -d
docker exec -it ollama ollama pull llama3
```

3. **Launch all services**:
```bash
docker compose up --build
```

4. **Open your browser**:
Navigate to `http://localhost:8000`

## Configuration

### Environment Variables

**Avatar Server**:
- `OLLAMA_URL`: Ollama service endpoint (default: http://ollama:11434)
- `TTS_URL`: TTS service endpoint (default: http://tts-server:5002)
- `DB_PATH`: Chat database path (default: /data/chat.db)

**TTS Server**:
- `TTS_MODEL`: TTS model name (default: tts_models/multilingual/multi-dataset/your_tts)

### Model Preparation

1. Place your 3D avatar model at `assets/avatar.glb`
2. Ensure your model contains these morph targets:
   - mouthOpen
   - Blink_Left
   - Blink_Right
   - Smile

## API Endpoints

- `POST /api/chat` - Main chat endpoint
- `WS /ws/{room_id}` - WebRTC signaling
- `GET /audio/{filename}` - Generated audio files
- `POST /tts` - TTS generation endpoint

## Development

### Frontend Structure
```
frontend/
├── main.js                 # Application entry point
├── modules/
│   ├── scene.js           # Three.js scene management
│   ├── avatar.js          # Avatar controls and animations
│   ├── audio.js           # Audio processing and lip-sync
│   ├── ui.js              # User interface controls
│   └── utils.js           # Utility functions
```

### Adding New Features

1. **New Emotions**:
   - Add morph targets to your 3D model
   - Extend `AvatarController.reactEmoji()` method
   - Add UI controls in `ui.js`

2. **Custom Animations**:
   - Add animation clips to your GLB model
   - Control via `mixer.clipAction()` in `scene.js`

## Troubleshooting

### Common Issues

1. **Avatar not loading**:
   - Check browser console for GLB loading errors
   - Verify model path and CORS settings

2. **TTS not working**:
   - Check if TTS model is properly downloaded
   - Verify audio file permissions in tts-cache

3. **Ollama connection failed**:
   - Confirm Ollama container is running
   - Verify model download completed

### Performance Tips

- Reduce texture resolution for mobile devices
- Lower polygon count in 3D model
- Enable GPU acceleration in Docker (NVIDIA runtime)

## License

Open-source MIT License. See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request