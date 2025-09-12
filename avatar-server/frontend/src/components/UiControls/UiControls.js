//digital_avatar/avatar-server/frontend/src/components/UiControls/UiControls.js
import { connectionState } from '../../stores/session.js';
import { avatarState } from '../../stores/avatar.js';

export function setupUI(handlers) {
  const micBtn = document.getElementById('micBtn');
  const callBtn = document.getElementById('callBtn');
  const webcamBtn = document.getElementById('webcamBtn');
  const emojiSelect = document.getElementById('emojiSelect');
  
  // Сохранение обработчиков в глобальной области для доступа из других модулей
  window.uiHandlers = handlers;
  
  // Подписка на изменения состояния
  connectionState.listen((state) => {
    updateButtonStates(state);
  });
  
  // Обновление состояний кнопок
  function updateButtonStates(state) {
    webcamBtn.textContent = state.isWebcamActive ? '📷 Выкл' : '📷 Камера';
    webcamBtn.classList.toggle('active', state.isWebcamActive);
    
    if (state.isCallConnecting) {
      callBtn.textContent = '📹 Подключение...';
      callBtn.disabled = true;
    } else {
      callBtn.textContent = state.isCallActive ? '📹 Разъединить' : '📹 Звонок';
      callBtn.disabled = false;
      callBtn.classList.toggle('active', state.isCallActive);
    }
  }
  
  // Обработчики кликов
  micBtn.addEventListener('click', async () => {
    const isActive = micBtn.classList.contains('active');
    
    try {
      if (isActive) {
        micBtn.classList.remove('active');
        if (handlers.onMicToggle) {
          await handlers.onMicToggle(false);
        }
      } else {
        micBtn.classList.add('active');
        if (handlers.onMicToggle) {
          await handlers.onMicToggle(true);
        }
      }
    } catch (error) {
      console.error('Ошибка переключения микрофона:', error);
      micBtn.classList.remove('active');
    }
  });
  
  callBtn.addEventListener('click', async () => {
    const isActive = connectionState.get().isCallActive;
    
    try {
      if (handlers.onCallToggle) {
        await handlers.onCallToggle(!isActive);
      }
    } catch (error) {
      console.error('Ошибка переключения звонка:', error);
    }
  });
  
  webcamBtn.addEventListener('click', async () => {
    const isActive = connectionState.get().isWebcamActive;
    
    try {
      if (handlers.onWebcamToggle) {
        await handlers.onWebcamToggle(!isActive);
      }
    } catch (error) {
      console.error('Ошибка переключения камеры:', error);
    }
  });
  
  emojiSelect.addEventListener('change', () => {
    const emoji = emojiSelect.value;
    if (emoji) {
      // Вызов реакции аватара на эмодзи
      if (window.avatarController && window.avatarController.emotions) {
        window.avatarController.emotions.reactEmoji(emoji);
      }
      emojiSelect.value = '';
    }
  });
  
  // Инициализация состояний кнопок
  updateButtonStates(connectionState.get());
}