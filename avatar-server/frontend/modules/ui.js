// digital_avatar/avatar-server/frontend/modules/ui.js

export function setupUI({ onSubmit, onMicText, onEmoji, onWebcamToggle, onCallToggle }) {
  const input = document.getElementById('textInput');
  const sendBtn = document.getElementById('sendBtn');
  const micBtn = document.getElementById('micBtn');
  const emojiSelect = document.getElementById('emojiSelect');
  const webcamBtn = document.getElementById('webcamBtn');
  const callBtn = document.getElementById('callBtn');

  // Добавьте эту переменную для отслеживания состояния подключения
  let wsConnecting = false;

  // Состояние для отслеживания активности
  const state = {
    sttActive: false,
    webcamActive: false,
    callActive: false
  };

  // Обновление текста кнопки микрофона
  const updateMicButton = () => {
    micBtn.textContent = state.sttActive ? '🛑 Стоп' : '🎙️ Говорить';
    micBtn.classList.toggle('active', state.sttActive);
  };

  // Обновление текста кнопки веб-камеры
  const updateWebcamButton = () => {
    webcamBtn.textContent = state.webcamActive ? '📷 Выкл' : '📷 Веб-камера';
    webcamBtn.classList.toggle('active', state.webcamActive);
  };

  // ОБНОВЛЕННАЯ функция для кнопки звонка
  const updateCallButton = () => {
    if (state.callActive && wsConnecting) {
      callBtn.textContent = '📹 Подключение...';
    } else {
      callBtn.textContent = state.callActive ? '📹 Отключить' : '📹 Видеозвонок';
    }
    callBtn.classList.toggle('active', state.callActive);
    callBtn.disabled = wsConnecting && state.callActive;
  };

  // Функция для установки состояния подключения
  const setWsConnecting = (isConnecting) => {
    wsConnecting = isConnecting;
    updateCallButton();
  };

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

  emojiSelect.onchange = () => { 
    if (emojiSelect.value) {
      onEmoji(emojiSelect.value);
      emojiSelect.value = '';
    }
  };

  let recognition;
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'ru-RU';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      input.value = transcript;
      if (e.results[0].isFinal) {
        handleSubmit();
      }
    };

    recognition.onerror = (e) => {
      console.error('STT error:', e.error);
      if (e.error === 'not-allowed') {
        alert('Разрешите доступ к микрофону в настройках браузера');
      }
      state.sttActive = false;
      updateMicButton();
    };

    recognition.onend = () => {
      state.sttActive = false;
      updateMicButton();
    };
  } else {
    micBtn.disabled = true;
    micBtn.title = 'STT не поддерживается этим браузером';
  }

  micBtn.onclick = () => {
    if (!recognition) return;
    
    if (!state.sttActive) {
      state.sttActive = true;
      updateMicButton();
      recognition.start();
    } else {
      recognition.stop();
    }
  };

  let webcamOn = false;
  webcamBtn.onclick = async () => { 
    if (state.callActive) {
      alert('Нельзя включить веб-камеру во время звонка');
      return;
    }
    
    webcamOn = !webcamOn;
    state.webcamActive = webcamOn;
    updateWebcamButton();
    await onWebcamToggle(webcamOn); 
  };

  // ОБНОВЛЕННАЯ обработка видеозвонка
  let callOn = false;
  callBtn.onclick = async () => {
    if (callOn) {
      // Отключение звонка
      callOn = false;
      state.callActive = false;
      updateCallButton();
      await onCallToggle(false);
    } else {
      // Попытка подключения
      callOn = true;
      state.callActive = true;
      wsConnecting = true;
      updateCallButton();
      
      try {
        await onCallToggle(true);
        wsConnecting = false;
        updateCallButton();
      } catch (err) {
        console.error('Ошибка видеозвонка:', err);
        wsConnecting = false;
        state.callActive = false;
        state.callActive = false;
        callOn = false;
        updateCallButton();
        alert('Не удалось установить видеозвонок. Проверьте консоль для подробностей.');
      }
    }
  };
}