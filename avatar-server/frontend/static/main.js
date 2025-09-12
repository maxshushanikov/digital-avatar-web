//digital_avatar/avatar-server/frontend/static/modules/main.js
import { initScene } from './modules/scene/SceneManager.js';
import { AudioManager } from './modules/audio/AudioManager.js';
import { AvatarController } from './modules/avatar/AvatarController.js';
import { setupUI } from './components/UiControls/UiControls.js';
import { setupChat } from './components/Chat/Chat.js';
import { sessionState, chatState, connectionState } from './stores/session.js';
import { ErrorHandler, PerformanceMonitor } from './utils/index.js';
//import './styles/index.css';

// Инициализация глобальных обработчиков ошибок
ErrorHandler.setupGlobalHandlers();

// Глобальные переменные для доступа к основным компонентам
window.app = {
  scene: null,
  avatar: null,
  audio: null,
  stores: {
    session: sessionState,
    chat: chatState,
    connection: connectionState,
    avatar: avatarState  // <--- ЭТА СТРОКА НУЖНА!
  }
};

// Глобальные обработчики для компонентов
window.chatHandlers = {};
window.uiHandlers = {};

async function initApp() {
  try {
    sessionState.set('connecting');
    
    // Инициализация сцены
    const canvas = document.getElementById('scene');
    const sceneManager = await initScene(canvas, '/assets/avatar.glb');
    window.app.scene = sceneManager;
    
    // Создание контроллера аватара
    const avatarController = new AvatarController(
      sceneManager.avatar, 
      sceneManager.mixer, 
      sceneManager.THREE
    );
    window.app.avatar = avatarController;
    window.avatarController = avatarController; // Для глобального доступа
    
    // Инициализация аудио менеджера
    const audioManager = new AudioManager();
    window.app.audio = audioManager;
    
    // Настройка обработчиков чата
    window.chatHandlers.onSubmit = async (text) => {
      chatState.setKey('isSending', true);
      
      try {
        // Отправка сообщения на сервер
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: 'default',
            message: text
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Добавление ответа в историю
        const messages = [...chatState.get().messages];
        messages.push({
          role: 'assistant',
          content: data.text,
          timestamp: Date.now()
        });
        
        chatState.setKey('messages', messages);
        
        // Воспроизведение аудио ответа
        if (data.audio_url) {
          avatarState.setKey('isSpeaking', true);
          await audioManager.playAudio(data.audio_url);
          avatarState.setKey('isSpeaking', false);
        }
      } catch (error) {
        console.error('Chat error:', error);
        
        // Добавление сообщения об ошибке
        const messages = [...chatState.get().messages];
        messages.push({
          role: 'assistant',
          content: 'Извините, произошла ошибка. Пожалуйста, попробуйте еще раз.',
          timestamp: Date.now()
        });
        
        chatState.setKey('messages', messages);
      } finally {
        chatState.setKey('isSending', false);
      }
    };
    
    // Настройка UI
    setupUI({
      onSubmit: window.chatHandlers.onSubmit,
      
      onMicToggle: async (active) => {
        if (active) {
          try {
            const analyser = await audioManager.startRecording();
            avatarController.lipSync.start(analyser);
            avatarState.setKey('isSpeaking', true);
          } catch (error) {
            console.error('Microphone error:', error);
            alert('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
          }
        } else {
          await audioManager.stopRecording();
          avatarController.lipSync.stop();
          avatarState.setKey('isSpeaking', false);
        }
      },
      
      onWebcamToggle: async (active) => {
        connectionState.setKey('isWebcamActive', active);
        // Реализация переключения веб-камеры
        if (active) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            // Здесь можно отобразить видео с веб-камеры
          } catch (error) {
            console.error('Webcam error:', error);
            connectionState.setKey('isWebcamActive', false);
          }
        }
      },
      
      onCallToggle: async (active) => {
        connectionState.setKey('isCallActive', active);
        connectionState.setKey('isCallConnecting', true);
        
        try {
          // Реализация видеозвонка
          if (active) {
            // Запрос доступа к камере и микрофону
            const stream = await navigator.mediaDevices.getUserMedia({ 
              video: true, 
              audio: true 
            });
            
            // Здесь будет логика установления WebRTC соединения
            console.log('Starting video call...');
          } else {
            // Завершение звонка
            console.log('Ending video call...');
          }
        } catch (error) {
          console.error('Video call error:', error);
          alert('Не удалось начать видеозвонок. Проверьте разрешения браузера.');
        } finally {
          connectionState.setKey('isCallConnecting', false);
        }
      }
    });
    
    // Настройка чата
    setupChat();
    
    // Запуск мониторинга производительности
    PerformanceMonitor.init();
    
    // Основной цикл рендеринга
    const clock = new sceneManager.THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      
      const deltaTime = clock.getDelta();
      avatarController.update(deltaTime);
      
      sceneManager.controls.update();
      sceneManager.renderer.render(sceneManager.scene, sceneManager.camera);
      
      // Обновление метрик производительности
      PerformanceMonitor.updateRenderMetrics(sceneManager.renderer);
    }
    animate();
    
    sessionState.set('connected');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    sessionState.set('error');
    
    // Показать сообщение об ошибке
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
      <h3>Ошибка загрузки приложения</h3>
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
}

// Запуск приложения после загрузки страницы
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}