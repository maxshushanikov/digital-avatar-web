// digital_avatar/avatar-server/frontend/modules/ui.js
import { isMobile } from './utils.js';

export function setupUI({ onSubmit, onMicText, onEmoji, onWebcamToggle, onCallToggle }) {
  const input = document.getElementById('textInput');
  const sendBtn = document.getElementById('sendBtn');
  const micBtn = document.getElementById('micBtn');
  const emojiSelect = document.getElementById('emojiSelect');
  const webcamBtn = document.getElementById('webcamBtn');
  const callBtn = document.getElementById('callBtn');

  // Функция для управления состоянием кнопок во время запроса
  function setLoadingState(loading) {
    sendBtn.disabled = loading;
    micBtn.disabled = loading;
    input.disabled = loading;
    sendBtn.textContent = loading ? '⏳' : 'Отправить';
  }

  const handleSubmit = async () => {
    if (input.value.trim()) {
      setLoadingState(true);
      try {
        await onSubmit(input.value.trim());
        input.value = '';
      } catch (err) {
        console.error('Ошибка при отправке:', err);
      } finally {
        setLoadingState(false);
      }
    }
  };

  sendBtn.onclick = handleSubmit;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      handleSubmit();
    }
  });

  emojiSelect.onchange = () => { onEmoji(emojiSelect.value); emojiSelect.value=''; };

  let sttActive = false;
  let recognition;
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      onMicText(text);
    };
    recognition.onend = () => { sttActive = false; micBtn.textContent = '🎙️ Говорить'; };
  } else {
    micBtn.disabled = true;
    micBtn.title = 'STT не поддерживается этим браузером';
  }

  micBtn.onclick = () => {
    if (!recognition) return;
    if (!sttActive) { sttActive = true; micBtn.textContent = '🛑 Стоп'; recognition.start(); }
    else { recognition.stop(); }
  };

  let webcamOn = false;
  webcamBtn.onclick = async () => { webcamOn = !webcamOn; await onWebcamToggle(webcamOn); webcamBtn.textContent = webcamOn ? '📷 Выкл' : '📷 Веб-камера'; };

  let callOn = false;
  callBtn.onclick = async () => { callOn = !callOn; await onCallToggle(callOn); callBtn.textContent = callOn ? '📹 Отключить' : '📹 Видеозвонок'; };
}