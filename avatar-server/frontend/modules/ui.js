// digital_avatar/avatar-server/frontend/modules/ui.js

export function setupUI({ onSubmit, onMicText, onWebcamToggle, onCallToggle }) {
  const input = document.getElementById('textInput');
  const sendBtn = document.getElementById('sendBtn');
  const micBtn = document.getElementById('micBtn');
  const emojiSelect = document.getElementById('emojiSelect');
  const webcamBtn = document.getElementById('webcamBtn');
  const callBtn = document.getElementById('callBtn');

  // Состояние для отслеживания активности
  const state = {
    sttActive: false,
    sttInitialized: false,
    sttError: null,
    webcamActive: false,
    callActive: false,
    callConnecting: false,
    audioDevices: []
  };

  // Проверка, является ли текущий источник доверенным (HTTPS или localhost)
  const isSecureContext = () => {
    return location.protocol === 'https:' || 
           location.hostname === 'localhost' || 
           location.hostname === '127.0.0.1';
  };

  // Проверка поддержки Web Speech API
  const isSpeechRecognitionSupported = () => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  };

  // Проверка поддержки русского языка
  const isRussianLanguageSupported = () => {
    if (!isSpeechRecognitionSupported()) return false;
    
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SR();
      recognition.lang = 'ru-RU';
      return true;
    } catch (e) {
      return false;
    }
  };

  // Получение списка доступных аудиоустройств
  const getAudioDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (err) {
      console.error('Error getting audio devices:', err);
      return [];
    }
  };

  // Проверка, доступен ли микрофон
  const isMicrophoneAvailable = async () => {
    try {
      // Попытка получить доступ к микрофону для проверки
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      return false;
    }
  };

  // Обновление текста кнопки микрофона
  const updateMicButton = () => {
    // Если STT не поддерживается или не инициализирован
    if (!isSpeechRecognitionSupported() || !isSecureContext()) {
      micBtn.textContent = '🎙️ STT unavailable';
      micBtn.disabled = true;
      
      if (!isSecureContext()) {
        micBtn.title = 'Web Speech API requires HTTPS (except localhost)';
      } else {
        micBtn.title = 'Speech Recognition API not supported by your browser';
      }
      
      return;
    }
    
    // Если есть ошибка
    if (state.sttError) {
      micBtn.textContent = '🎙️ STT error';
      micBtn.disabled = false;
      micBtn.title = state.sttError;
      return;
    }
    
    // Если инициализация в процессе
    if (!state.sttInitialized) {
      micBtn.textContent = '🎙️ Initialize';
      micBtn.disabled = false;
      micBtn.title = 'Click to initialize speech recognition';
      return;
    }
    
    // Активное состояние
    micBtn.disabled = false;
    micBtn.title = '';
    micBtn.textContent = state.sttActive ? '🛑 Stop' : '🎙️ Speak';
    micBtn.classList.toggle('active', state.sttActive);
  };

  // Обновление текста кнопки веб-камеры
  const updateWebcamButton = () => {
    webcamBtn.textContent = state.webcamActive ? '📷 Off' : '📷 Webcam';
    webcamBtn.classList.toggle('active', state.webcamActive);
  };

  // Обновление текста кнопки звонка
  const updateCallButton = () => {
    if (state.callConnecting) {
      callBtn.textContent = '📹 Connecting...';
      callBtn.disabled = true;
    } else {
      callBtn.textContent = state.callActive ? '📹 Disconnect' : '📹 Video Call';
      callBtn.disabled = false;
    }
    callBtn.classList.toggle('active', state.callActive);
  };

  // Функция для управления состоянием кнопок во время запроса
  function setLoadingState(loading) {
    sendBtn.disabled = loading;
    micBtn.disabled = loading || !state.sttInitialized || state.callConnecting;
    input.disabled = loading;
    sendBtn.textContent = loading ? '⏳' : 'Send';
  }

  const handleSubmit = async () => {
    if (input.value.trim()) {
      setLoadingState(true);
      try {
        await onSubmit(input.value.trim());
        input.value = '';
      } catch (err) {
        console.error('Error submitting message:', err);
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

  // Инициализация STT при первом нажатии на кнопку
  const initSpeechRecognition = async () => {
    // Уже инициализировано
    if (state.sttInitialized) return;
    
    // Проверка условий безопасности
    if (!isSecureContext()) {
      state.sttError = 'Web Speech API requires HTTPS (except localhost)';
      updateMicButton();
      return;
    }

    // Проверка поддержки Web Speech API
    if (!isSpeechRecognitionSupported()) {
      state.sttError = 'Web Speech API not supported by your browser. Try Chrome or Edge.';
      updateMicButton();
      return;
    }

    // Проверка поддержки русского языка
    if (!isRussianLanguageSupported()) {
      state.sttError = 'Russian language not supported by Web Speech API in your browser';
      updateMicButton();
      return;
    }

    // Получаем список аудиоустройств
    state.audioDevices = await getAudioDevices();
    
    // Проверяем доступность микрофона
    const isAvailable = await isMicrophoneAvailable();
    if (!isAvailable) {
      state.sttError = 'Microphone is busy or not available. Close other apps using microphone.';
      updateMicButton();
      return;
    }

    // Инициализация распознавания речи
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    
    // Проверка поддержки русского языка
    const langs = ['ru-RU', 'ru'];
    let supportedLang = null;
    
    for (const lang of langs) {
      try {
        recognition.lang = lang;
        supportedLang = lang;
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!supportedLang) {
      state.sttError = 'Russian language not supported by Web Speech API';
      updateMicButton();
      return;
    }

    recognition.lang = supportedLang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

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
      
      state.sttActive = false;
      updateMicButton();
      
      if (e.error === 'audio-capture') {
        state.sttError = 'Microphone is busy or not available. Close other apps using microphone.';
      } else if (e.error === 'not-allowed') {
        state.sttError = 'Microphone access denied. Please allow access in browser settings.';
      } else if (e.error === 'service-not-allowed') {
        state.sttError = 'Speech recognition service is unavailable.';
      }
      
      updateMicButton();
    };

    recognition.onend = () => {
      if (state.sttActive) {
        state.sttActive = false;
        updateMicButton();
      }
    };

    // Успешная инициализация
    state.sttInitialized = true;
    state.sttError = null;
    
    // Устанавливаем обработчик клика
    micBtn.onclick = async () => {
      if (!state.sttActive) {
        // Проверяем доступность микрофона перед запросом
        const isAvailable = await isMicrophoneAvailable();
        if (!isAvailable) {
          state.sttError = 'Microphone is busy. Close other apps using microphone.';
          updateMicButton();
          return;
        }
        
        try {
          state.sttActive = true;
          updateMicButton();
          
          recognition.start();
        } catch (e) {
          console.error('Error starting recognition:', e);
          state.sttActive = false;
          state.sttError = `Error starting: ${e.message}`;
          updateMicButton();
        }
      } else {
        recognition.stop();
      }
    };
    
    updateMicButton();
  };

  // Инициализируем STT при первом клике на кнопку микрофона
  micBtn.onclick = initSpeechRecognition;

  // Обработка видеозвонка с защитой от двойных вызовов
  callBtn.onclick = async () => {
    // Защита от двойного нажатия и конфликтов
    if (state.callConnecting) return;
    
    if (state.callActive) {
      // Отключение звонка
      state.callActive = false;
      state.callConnecting = true;
      updateCallButton();
      
      try {
        await onCallToggle(false);
      } catch (err) {
        console.error('Video call disconnect error:', err);
        state.callActive = true; // Restore state
      } finally {
        state.callConnecting = false;
        updateCallButton();
      }
    } else {
      // Attempt connection
      state.callActive = true;
      state.callConnecting = true;
      updateCallButton();
      
      try {
        await onCallToggle(true);
      } catch (err) {
        console.error('Video call error:', err);
        state.callActive = false;
        alert('Could not establish video call.\n\nCheck console for details.');
      } finally {
        state.callConnecting = false;
        updateCallButton();
      }
    }
  };
  
  // Обработка веб-камеры
  webcamBtn.onclick = async () => { 
    if (state.callActive) {
      alert('Cannot enable webcam during a call');
      return;
    }
    
    state.webcamActive = !state.webcamActive;
    updateWebcamButton();
    await onWebcamToggle(state.webcamActive); 
  };

  // Инициализация состояния кнопок
  updateMicButton();
  updateWebcamButton();
  updateCallButton();
}