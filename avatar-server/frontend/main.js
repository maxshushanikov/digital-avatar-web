import { initScene } from './modules/scene.js';
import { setupUI } from './modules/ui.js';
import { playAudio } from './modules/audio.js';
import { AvatarController } from './modules/avatar.js';
import { isMobile } from './modules/utils.js';

(async () => {
  try {
    const canvas = document.getElementById('scene');
    if (!canvas) {
      console.error('❌ Canvas с id="scene" не найден в DOM');
      alert('Canvas с id="scene" не найден — проверь index.html');
      return;
    }

    // Инициализация сцены
    const { renderer, scene, camera, mixer, avatar, THREE } =
      await initScene(canvas, '/assets/avatar.glb');

    // Если вернулся null вместо аватара — значит, подставлен тестовый куб
    if (!avatar) {
      console.warn('⚠ Аватар не загружен, используется тестовый объект');
    }

    // Контроллер аватара (если есть что контролировать)
    const avatarCtrl = new AvatarController(avatar, mixer, THREE);
    if (avatar) avatarCtrl.startBlinking();

    // UI
    const sessionId = localStorage.getItem('session_id') || crypto.randomUUID();
    localStorage.setItem('session_id', sessionId);

    setupUI({
      onSubmit: (text) => sendMessage(text, sessionId, avatarCtrl),
      onMicText: (text) => sendMessage(text, sessionId, avatarCtrl),
      onEmoji: (emoji) => avatarCtrl.reactEmoji(emoji),
      onWebcamToggle: async (on) => avatarCtrl.toggleWebcam(on),
      onCallToggle: async (on) => avatarCtrl.toggleCall(on, canvas)
    });

  } catch (err) {
    console.error('❌ Ошибка при инициализации main.js:', err);
    showChatMessage(`❌ Ошибка main.js: ${err.message}`, true);
  }
})();

// Отправка сообщения на сервер
async function sendMessage(text, sessionId, avatarCtrl) {
  try {
    addMsg('user', text);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: text,
        system_prompt: 'Ты дружелюбный ассистент. Отвечай на русском.',
        temperature: 0.6,
        model: 'llama3'
      })
    });
    const data = await res.json();
    addMsg('assistant', data.text);

    if (data.audio_url) {
      const { audio, analyser } = await playAudio(data.audio_url);
      avatarCtrl.lipSyncWithAnalyser(analyser);
      await audio.play();
    }
  } catch (err) {
    console.error('Ошибка при отправке сообщения:', err);
    showChatMessage(`Ошибка отправки: ${err.message}`, true);
  }
}

// Вывод сообщений в чат
function addMsg(role, text) {
  const history = document.getElementById('history');
  if (!history) return;
  const node = document.createElement('div');
  node.className = `message ${role}`;
  node.textContent = text;
  history.appendChild(node);
  node.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function showChatMessage(message, isError = false) {
  const history = document.getElementById('history');
  if (history) {
    const node = document.createElement('div');
    node.className = 'message assistant';
    if (isError) node.style.color = 'red';
    node.textContent = message;
    history.appendChild(node);
    node.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } else {
    console.log(message);
  }
}
