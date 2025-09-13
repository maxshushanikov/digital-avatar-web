// digital_avatar/avatar-server/frontend/src/main.js
// --- Глобальные переменные ---
window.chatHandlers = {};
window.uiHandlers = {};

// --- Импорты ---
import { initScene } from './modules/scene/SceneManager.js';
import { AudioManager } from './modules/audio/AudioManager.js';
import { AvatarController } from './modules/avatar/AvatarController.js';
import { setupUI } from './components/UiControls/UiControls.js';
import { setupChat } from './components/Chat/Chat.js';

// --- Хранилища (состояние) ---
import { sessionState, chatState, connectionState } from './stores/session.js';
import { avatarState } from './stores/avatar.js';
import { audioState } from './stores/audio.js';

// --- Утилиты ---
import { ErrorHandler } from './utils/error-handler.js';
import { PerformanceMonitor } from './utils/performance.js';

// --- Настройка глобальных обработчиков ошибок ---
ErrorHandler.setupGlobalHandlers();

// --- Глобальный контекст приложения ---
window.app = {
  scene: null,
  avatar: null,
  audio: null,
  stores: {
    session: sessionState,
    chat: chatState,
    connection: connectionState,
    avatar: avatarState,
    audio: audioState
  }
};

/**
 * Основная функция инициализации приложения
 */
async function initApp() {
  // Защита от повторной инициализации
  if (window.app.initialized) return;
  window.app.initialized = true;

  try {
    sessionState.set('connecting');
    console.log('🔄 Инициализация приложения...');

    // --- 1. Инициализация сцены ---
    const canvas = document.getElementById('scene');
    if (!canvas) throw new Error('Canvas element not found');

    const sceneManager = await initScene(canvas, '/assets/avatar.glb');
    window.app.scene = sceneManager;

    // --- 2. Создание контроллера аватара ---
    const avatarController = new AvatarController(
      sceneManager.avatar,
      sceneManager.mixer,
      sceneManager.THREE
    );
    window.app.avatar = avatarController;
    window.avatarController = avatarController; // Для отладки

    // --- 3. Инициализация аудио менеджера ---
    const audioManager = new AudioManager();
    window.app.audio = audioManager;

    // --- 4. Обработчики чата ---
    window.chatHandlers.onSubmit = createChatSubmitHandler(audioManager, avatarController);

    // --- 5. Настройка UI и чата ---
    setupUI({
      onSubmit: window.chatHandlers.onSubmit,
      onMicToggle: createMicHandler(audioManager, avatarController),
      onWebcamToggle: createWebcamHandler(),
      onCallToggle: createCallHandler()
    });

    setupChat();

    // --- 6. Запуск рендеринга ---
    startAnimationLoop(sceneManager, avatarController);

    // --- 7. Мониторинг производительности ---
    PerformanceMonitor.init();

    // --- 8. Состояние готовности ---
    sessionState.set('connected');
    console.log('✅ Digital Avatar App initialized successfully');

  } catch (error) {
    handleError(error);
  }
}

/**
 * Создаёт обработчик отправки сообщения
 */
function createChatSubmitHandler(audioManager, avatarController) {
  return async function onSubmit(text) {
    chatState.setKey('isSending', true);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'default',
          message: text,
          model: 'llama3'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Добавляем ответ в историю
      const messages = [...chatState.get().messages];
      messages.push({
        role: 'assistant',
        content: data.text,
        timestamp: Date.now()
      });
      chatState.setKey('messages', messages);

      // Воспроизводим аудио, если есть
      if (data.audio_url) {
        window.app.stores.avatar.setKey('isSpeaking', true);
        try {
          await audioManager.playAudio(data.audio_url);
        } finally {
          window.app.stores.avatar.setKey('isSpeaking', false);
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      const messages = [...chatState.get().messages];
      messages.push({
        role: 'assistant',
        content: 'Ошибка соединения с сервером. Проверьте подключение.',
        timestamp: Date.now()
      });
      chatState.setKey('messages', messages);
    } finally {
      chatState.setKey('isSending', false);
    }
  };
}

/**
 * Создаёт обработчик микрофона
 */
function createMicHandler(audioManager, avatarController) {
  return async function onMicToggle(active) {
    if (active) {
      try {
        const analyser = await audioManager.startRecording();
        avatarController.lipSync.start(analyser);
        window.app.stores.avatar.setKey('isSpeaking', true);
      } catch (error) {
        console.error('Microphone error:', error);
        alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
      }
    } else {
      await audioManager.stopRecording();
      avatarController.lipSync.stop();
      window.app.stores.avatar.setKey('isSpeaking', false);
    }
  };
}

/**
 * Создаёт обработчик веб-камеры
 */
function createWebcamHandler() {
  return async function onWebcamToggle(active) {
    connectionState.setKey('isWebcamActive', active);
    if (active) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Здесь можно отобразить видео
      } catch (error) {
        console.error('Webcam error:', error);
        connectionState.setKey('isWebcamActive', false);
      }
    }
  };
}

/**
 * Создаёт обработчик видеозвонка
 */
function createCallHandler() {
  return async function onCallToggle(active) {
    connectionState.setKey('isCallActive', active);
    connectionState.setKey('isCallConnecting', true);
    
    try {
      if (active) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        console.log('📞 Видеозвонок начат...');
      } else {
        console.log('📞 Видеозвонок завершён.');
      }
    } catch (error) {
      console.error('Video call error:', error);
      alert('Не удалось начать видеозвонок.');
    } finally {
      connectionState.setKey('isCallConnecting', false);
    }
  };
}

/**
 * Обработка фатальной ошибки
 */
function handleError(error) {
  console.error('Failed to initialize app:', error);
  sessionState.set('error');

  const errorMessage = document.createElement('div');
  errorMessage.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 107, 107, 0.9);
    color: white;
    padding: 20px;
    border-radius: 10px;
    text-align: center;
    z-index: 1000;
    max-width: 80%;
  `;
  errorMessage.innerHTML = `
    <h3>Ошибка загрузки</h3>
    <p>${error.message}</p>
    <button onclick="location.reload()" style="
      margin-top: 15px;
      padding: 10px 20px;
      background: white;
      color: #ff6b6b;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    ">Перезагрузить</button>
  `;
  document.body.appendChild(errorMessage);
}

/**
 * Запуск основного цикла рендеринга
 */
function startAnimationLoop(sceneManager, avatarController) {
  const clock = new sceneManager.THREE.Clock();
  
  function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    avatarController.update(deltaTime);
    
    sceneManager.controls.update();
    sceneManager.renderer.render(sceneManager.scene, sceneManager.camera);
    
    PerformanceMonitor.updateRenderMetrics(sceneManager.renderer);
  }
  
  animate();
}

// --- Запуск приложения ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}