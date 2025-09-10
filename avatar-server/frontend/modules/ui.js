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
    webcamActive: false,
    callActive: false,
    callConnecting: false,
    sttReady: false,
    sttError: null
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

  // Обновление текста кнопки микрофона
  const updateMicButton = () => {
    if (!state.sttReady) {
      micBtn.textContent = '🎙️ STT недоступен';
      micBtn.disabled = true;
      micBtn.title = state.sttError || 'Речь не поддерживается или не настроена';
      return;
    }
    
    micBtn.disabled = false;
    micBtn.title = '';
    micBtn.textContent = state.sttActive ? '🛑 Стоп' : '🎙️ Говорить';
    micBtn.classList.toggle('active', state.sttActive);
  };

  // Обновление текста кнопки веб-камеры
  const updateWebcamButton = () => {
    webcamBtn.textContent = state.webcamActive ? '📷 Выкл' : '📷 Веб-камера';
    webcamBtn.classList.toggle('active', state.webcamActive);
  };

  // Обновление текста кнопки звонка
  const updateCallButton = () => {
    if (state.callConnecting) {
      callBtn.textContent = '📹 Подключение...';
      callBtn.disabled = true;
    } else {
      callBtn.textContent = state.callActive ? '📹 Отключить' : '📹 Видеозвонок';
      callBtn.disabled = false;
    }
    callBtn.classList.toggle('active', state.callActive);
  };

  // Функция для управления состоянием кнопок во время запроса
  function setLoadingState(loading) {
    sendBtn.disabled = loading;
    micBtn.disabled = loading || !state.sttReady || state.callConnecting;
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

  // Инициализация STT с обработкой всех возможных ошибок
  const initSpeechRecognition = () => {
    // Проверка условий безопасности
    if (!isSecureContext()) {
      state.sttError = 'Web Speech API требует HTTPS (кроме localhost)';
      state.sttReady = false;
      updateMicButton();
      return;
    }

    // Проверка поддержки Web Speech API
    if (!isSpeechRecognitionSupported()) {
      state.sttError = 'Web Speech API не поддерживается вашим браузером. Попробуйте Chrome или Edge.';
      state.sttReady = false;
      updateMicButton();
      return;
    }

    // Проверка поддержки русского языка
    if (!isRussianLanguageSupported()) {
      state.sttError = 'Русский язык не поддерживается Web Speech API в вашем браузере';
      state.sttReady = false;
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
      state.sttError = 'Русский язык не поддерживается Web Speech API';
      state.sttReady = false;
      updateMicButton();
      return;
    }

    recognition.lang = supportedLang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false; // Останавливаем после окончания речи

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
      
      // Специфичная обработка ошибки audio-capture
      if (e.error === 'audio-capture') {
        // Проверяем, не занят ли микрофон
        navigator.mediaDevices.enumerateDevices()
          .then(devices => {
            const audioInput = devices.filter(device => 
              device.kind === 'audioinput' && device.deviceId
            );
            
            if (audioInput.length === 0) {
              state.sttError = 'Микрофон не обнаружен. Проверьте подключение микрофона.';
            } else {
              state.sttError = 'Микрофон занят другим приложением. Закройте другие приложения, использующие микрофон.';
            }
            
            updateMicButton();
          })
          .catch(err => {
            console.error('Ошибка при проверке устройств:', err);
            state.sttError = 'Не удалось проверить состояние микрофона.';
            updateMicButton();
          });
      } else if (e.error === 'not-allowed') {
        state.sttError = 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
        updateMicButton();
      } else if (e.error === 'service-not-allowed') {
        state.sttError = 'Сервис распознавания речи недоступен. Проверьте настройки браузера.';
        updateMicButton();
      } else if (e.error === 'no-speech') {
        console.log('Нет речи обнаружено');
      } else if (e.error === 'aborted') {
        console.log('Распознавание прервано');
      }
    };

    recognition.onend = () => {
      if (state.sttActive) {
        state.sttActive = false;
        updateMicButton();
        
        // Попытка перезапуска через короткое время
        setTimeout(() => {
          if (!state.callActive && !state.callConnecting && !state.sttActive) {
            try {
              recognition.start();
            } catch (e) {
              console.error('Ошибка повторного запуска:', e);
            }
          }
        }, 500);
      }
    };

    // Успешная инициализация
    state.sttReady = true;
    state.sttError = null;
    
    // Проверяем доступ к микрофону
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // Закрываем поток, так как он нам нужен только для проверки
        stream.getTracks().forEach(track => track.stop());
        
        // Устанавливаем обработчик клика
        micBtn.onclick = () => {
          if (!state.sttActive) {
            state.sttActive = true;
            updateMicButton();
            
            try {
              recognition.start();
            } catch (e) {
              console.error('Ошибка запуска распознавания:', e);
              state.sttActive = false;
              state.sttError = `Ошибка запуска: ${e.message}`;
              updateMicButton();
            }
          } else {
            recognition.stop();
          }
        };
        
        updateMicButton();
      })
      .catch(err => {
        console.error('Ошибка проверки микрофона:', err);
        
        if (err.name === 'NotAllowedError') {
          state.sttError = 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
        } else if (err.name === 'NotFoundError' || 
                   err.name === 'DevicesNotFoundError') {
          state.sttError = 'Микрофон не обнаружен. Проверьте подключение микрофона.';
        } else if (err.name === 'NotReadableError' || 
                   err.name === 'TrackStartError') {
          state.sttError = 'Микрофон занят другим приложением. Закройте другие приложения, использующие микрофон.';
        } else if (err.name === 'OverconstrainedError' || 
                   err.name === 'ConstraintNotSatisfiedError') {
          state.sttError = 'Неподдерживаемые настройки микрофона.';
        } else if (err.name === 'SecurityError' || 
                   err.name === 'PermissionDeniedError') {
          state.sttError = 'Безопасность не позволяет доступ к микрофону.';
        } else {
          state.sttError = `Неизвестная ошибка: ${err.name}`;
        }
        
        state.sttReady = false;
        updateMicButton();
      });
  };

  // Инициализация STT
  initSpeechRecognition();

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
        console.error('Ошибка отключения видеозвонка:', err);
        state.callActive = true; // Возвращаем состояние
      } finally {
        state.callConnecting = false;
        updateCallButton();
      }
    } else {
      // Попытка подключения
      state.callActive = true;
      state.callConnecting = true;
      updateCallButton();
      
      try {
        await onCallToggle(true);
      } catch (err) {
        console.error('Ошибка видеозвонка:', err);
        state.callActive = false;
        alert('Не удалось установить видеозвонок.\n\nПроверьте консоль для подробностей.');
      } finally {
        state.callConnecting = false;
        updateCallButton();
      }
    }
  };
  
  // Инициализация состояния кнопок
  updateMicButton();
  updateWebcamButton();
  updateCallButton();
}