//digital_avatar/avatar_server/frontend/avatar.js
/**
 * Контроллер для управления аватаром с поддержкой анимаций, эмоций и взаимодействия
 * 
 * Основные улучшения:
 * - Улучшенная система lip-sync с плавностью и правильной остановкой
 * - Расширенный поиск морф-таргетов (поддержка разных неймингов)
 * - Улучшенное WebRTC с обработкой состояний и повторными попытками
 * - Система эмоций с плавными переходами
 * - Поддержка мобильных устройств
 * - Fallback для lip-sync при использовании Web Speech API
 */

export class AvatarController {
  constructor(avatar, mixer, THREE) {
    this.avatar = avatar;
    this.mixer = mixer;
    this.THREE = THREE;
    
    // Поиск морф-таргетов с поддержкой разных неймингов
    this.morphs = this.findMorphTargets(avatar);
    
    // Таймеры для анимаций
    this._blinkTimer = null;
    this._emojiTimer = null;
    
    // Lip-sync состояние
    this._lipSync = {
      isActive: false,
      rafId: null,
      analyser: null,
      lastMouthValue: 0,
      smoothing: 0.3,
      fallback: {
        isActive: false,
        rafId: null
      }
    };
    
    // Состояние веб-камеры
    this._webcamStream = null;
    this._webcamVideo = null;
    
    // Состояние WebRTC
    this._pc = null;
    this._ws = null;
    this._callActive = false;
    this._connectionEstablished = false;
    this._pendingOffer = null; // Для хранения оффера, пока WebSocket подключается
    this._wsReconnectAttempts = 0;
    this._maxWsReconnectAttempts = 5;
    
    // Для отслеживания canvas
    this._canvas = null;
    
    // Запускаем базовые анимации, если аватар загружен
    if (avatar) {
      this.startBlinking();
    }
  }

  /**
   * Расширенный поиск морф-таргетов с поддержкой разных неймингов
   * @param {Object3D} root - Корневой объект сцены
   * @returns {Object} Объект с найденными морф-таргетами
   */
  findMorphTargets(root) {
    const morphs = { 
      mouthOpen: null, 
      blinkLeft: null, 
      blinkRight: null,
      smile: null,
      // Поддержка разных возможных имен для mouthOpen
      mouthOpenNames: ['mouthOpen', 'Mouth_Open', 'jawOpen', 'Viseme_ah', 'viseme_ah', 'Mouth.AH']
    };
    
    if (!root) return morphs;
    
    root.traverse((o) => {
      if (o.isMesh && o.morphTargetDictionary) {
        const dict = o.morphTargetDictionary;
        
        // Ищем mouthOpen по разным возможным именам
        for (const name of morphs.mouthOpenNames) {
          if (name in dict) {
            morphs.mouthOpen = { mesh: o, idx: dict[name] };
            break;
          }
        }
        
        // Остальные морфы
        if ('Blink_Left' in dict || 'blink_left' in dict) {
          morphs.blinkLeft = { 
            mesh: o, 
            idx: dict['Blink_Left'] || dict['blink_left'] 
          };
        }
        
        if ('Blink_Right' in dict || 'blink_right' in dict) {
          morphs.blinkRight = { 
            mesh: o, 
            idx: dict['Blink_Right'] || dict['blink_right'] 
          };
        }
        
        if ('Smile' in dict || 'smile' in dict) {
          morphs.smile = { 
            mesh: o, 
            idx: dict['Smile'] || dict['smile'] 
          };
        }
      }
    });
    
    return morphs;
  }

  /**
   * Устанавливает значение морф-таргета с ограничением
   * @param {Object} morph - Объект морф-таргета
   * @param {number} value - Значение (0-1)
   */
  setMorph(morph, value) {
    if (!morph) return;
    morph.mesh.morphTargetInfluences[morph.idx] = this.THREE.MathUtils.clamp(value, 0, 1);
  }

  /**
   * Запускает процесс моргания
   */
  startBlinking() {
    if (this._blinkTimer) return;
    
    const blink = () => {
      const dur = 120;
      this.animateBlink(1, dur / 2);
      
      setTimeout(() => this.animateBlink(0, dur / 2), dur / 2);
      
      // Случайная задержка между морганиями (2.5-5 сек)
      const next = 2500 + Math.random() * 2500;
      this._blinkTimer = setTimeout(blink, next);
    };
    
    blink();
  }

  /**
   * Анимирует моргание
   * @param {number} value - Значение (0-1)
   * @param {number} ms - Длительность анимации в миллисекундах
   */
  animateBlink(value, ms) {
    const { blinkLeft, blinkRight } = this.morphs;
    
    // Если морфы не найдены, выходим
    if (!blinkLeft && !blinkRight) return;
    
    // Начальные значения
    const startL = blinkLeft ? blinkLeft.mesh.morphTargetInfluences[blinkLeft.idx] : 0;
    const startR = blinkRight ? blinkRight.mesh.morphTargetInfluences[blinkRight.idx] : 0;
    
    const t0 = performance.now();
    
    const step = () => {
      const t = (performance.now() - t0) / ms;
      const v = this.THREE.MathUtils.lerp(startL, value, Math.min(1, t));
      
      this.setMorph(blinkLeft, v);
      this.setMorph(blinkRight, v);
      
      if (t < 1) {
        this._blinkTimer = requestAnimationFrame(step);
      }
    };
    
    step();
  }

  /**
   * Устанавливает чувствительность lip-sync анимации
   * @param {number} value - Значение от 0.1 до 1.0
   */
  setLipSyncSensitivity(value) {
    this._lipSync.smoothing = this.THREE.MathUtils.clamp(value, 0.1, 1.0);
  }

  /**
   * Запускает lip-sync анимацию с использованием анализатора
   * @param {AnalyserNode} analyser - Аудио анализатор
   */
  lipSyncWithAnalyser(analyser) {
    this.stopLipSync(); // Сначала останавливаем текущую анимацию
    
    this._lipSync.isActive = true;
    this._lipSync.analyser = analyser;
    
    const data = new Uint8Array(analyser.frequencyBinCount);
    let lastTime = performance.now();
    
    const update = () => {
      if (!this._lipSync.isActive) return;
      
      const now = performance.now();
      const deltaTime = now - lastTime;
      lastTime = now;
      
      // Получаем данные из анализатора
      analyser.getByteFrequencyData(data);
      
      // Расчет среднеквадратичного значения (RMS)
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
      }
      const rms = Math.sqrt(sum / data.length) / 255;
      
      // Плавное изменение значения (фильтр низких частот)
      const targetValue = Math.min(rms * 1.5, 1);
      this._lipSync.lastMouthValue += (targetValue - this._lipSync.lastMouthValue) * 
                                     Math.min(1, deltaTime * this._lipSync.smoothing / 16);
      
      this.setMorph(this.morphs.mouthOpen, this._lipSync.lastMouthValue);
      
      this._lipSync.rafId = requestAnimationFrame(update);
    };
    
    update();
  }

  /**
   * Запускает анимацию губ для Web Speech API fallback
   * @param {number} intensity - Интенсивность анимации (0-1)
   */
  startFallbackLipSync(intensity = 0.5) {
    this.stopFallbackLipSync();
    
    this._lipSync.fallback.isActive = true;
    
    let progress = 0;
    const duration = 2000; // Длительность одного цикла анимации
    
    const update = () => {
      if (!this._lipSync.fallback.isActive) return;
      
      // Синусоидальная анимация для имитации речи
      progress = (progress + 16) % duration; // 16ms ~ 60fps
      const wave = Math.sin(progress * Math.PI / (duration/2));
      const value = intensity * (wave > 0 ? wave : 0);
      
      this.setMorph(this.morphs.mouthOpen, value);
      
      this._lipSync.fallback.rafId = requestAnimationFrame(update);
    };
    
    update();
  }

  /**
   * Останавливает основную lip-sync анимацию
   */
  stopLipSync() {
    if (this._lipSync.rafId) {
      cancelAnimationFrame(this._lipSync.rafId);
      this._lipSync.rafId = null;
    }
    this._lipSync.isActive = false;
    
    // Плавное возвращение в исходное положение
    const reset = () => {
      if (this._lipSync.lastMouthValue > 0.01) {
        this._lipSync.lastMouthValue *= 0.7;
        this.setMorph(this.morphs.mouthOpen, this._lipSync.lastMouthValue);
        requestAnimationFrame(reset);
      } else {
        this.setMorph(this.morphs.mouthOpen, 0);
      }
    };
    reset();
  }

  /**
   * Останавливает fallback lip-sync анимацию
   */
  stopFallbackLipSync() {
    if (this._lipSync.fallback.rafId) {
      cancelAnimationFrame(this._lipSync.fallback.rafId);
      this._lipSync.fallback.rafId = null;
    }
    this._lipSync.fallback.isActive = false;
    
    // Плавное возвращение в исходное положение
    let value = this.morphs.mouthOpen ? 
                this.morphs.mouthOpen.mesh.morphTargetInfluences[this.morphs.mouthOpen.idx] : 0;
    
    const reset = () => {
      if (value > 0.01) {
        value *= 0.7;
        this.setMorph(this.morphs.mouthOpen, value);
        requestAnimationFrame(reset);
      } else {
        this.setMorph(this.morphs.mouthOpen, 0);
      }
    };
    reset();
  }

  /**
   * Реагирует на эмодзи, запуская соответствующую анимацию
   * @param {string} emoji - Эмодзи для отображения
   */
  reactEmoji(emoji) {
    if (!emoji || !this.morphs) return;
    
    this.flashEmoji(emoji);
    
    // Сброс предыдущих анимаций
    clearTimeout(this._emojiTimer);
    
    // Эмодзи-специфичные реакции
    if (emoji === '😊' || emoji === '😉' || emoji === '👍') {
      this.easeMorph(this.morphs.smile, 1, 250);
    } else if (emoji === '😮') {
      this.easeMorph(this.morphs.mouthOpen, 0.8, 250);
    } else if (emoji === '😡') {
      this.easeMorph(this.morphs.mouthOpen, 0.5, 250);
    } else if (emoji === '😢') {
      // Можно добавить поддержку других эмоций
      this.easeMorph(this.morphs.mouthOpen, 0.3, 250);
    }
    
    // Возврат в исходное состояние через время
    this._emojiTimer = setTimeout(() => {
      if (this.morphs.smile) {
        this.easeMorph(this.morphs.smile, 0, 250);
      }
      if (this.morphs.mouthOpen) {
        this.easeMorph(this.morphs.mouthOpen, 0, 250);
      }
    }, 1000);
  }

  /**
   * Плавно изменяет морф-таргет к целевому значению
   * @param {Object} morph - Морф-таргет
   * @param {number} target - Целевое значение (0-1)
   * @param {number} ms - Длительность анимации в миллисекундах
   */
  easeMorph(morph, target, ms) {
    if (!morph) return;
    
    const start = morph.mesh.morphTargetInfluences[morph.idx];
    const t0 = performance.now();
    
    const step = () => {
      const t = (performance.now() - t0) / ms;
      const v = this.THREE.MathUtils.lerp(start, target, Math.min(1, t));
      this.setMorph(morph, v);
      
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    
    step();
  }

  /**
   * Отображает эмодзи-эффект на экране
   * @param {string} emoji - Эмодзи для отображения
   */
  flashEmoji(emoji) {
    let el = document.getElementById('emoji-fx');
    if (!el) {
      el = document.createElement('div');
      el.id = 'emoji-fx';
      Object.assign(el.style, {
        position: 'absolute', 
        left: '50%', 
        top: '40%', 
        transform: 'translate(-50%,-50%)',
        fontSize: '64px', 
        pointerEvents: 'none', 
        transition: 'opacity .2s', 
        opacity: '0',
        zIndex: '1000'
      });
      document.body.appendChild(el);
    }
    el.textContent = emoji;
    el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 600);
  }

  /**
   * Переключает веб-камеру
   * @param {boolean} on - Включить или выключить
   */
  async toggleWebcam(on) {
    if (on && !this._webcamStream) {
      try {
        // Проверяем, не активен ли видеозвонок
        if (this._callActive) {
          console.warn('Нельзя включить веб-камеру во время звонка');
          return;
        }
        
        // Запрашиваем доступ к камере
        this._webcamStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 }
          } 
        });
        
        // Создаем видео элемент для отображения
        if (!this._webcamVideo) {
          this._webcamVideo = document.createElement('video');
          this._webcamVideo.autoplay = true;
          this._webcamVideo.playsInline = true;
          this._webcamVideo.style.position = 'absolute';
          this._webcamVideo.style.top = '0';
          this._webcamVideo.style.left = '0';
          this._webcamVideo.style.width = '100%';
          this._webcamVideo.style.height = '100%';
          this._webcamVideo.style.objectFit = 'cover';
          
          // Добавляем в сцену Three.js
          const sceneContainer = document.getElementById('app');
          if (sceneContainer) {
            sceneContainer.appendChild(this._webcamVideo);
          }
        }
        
        // Назначаем поток видео
        this._webcamVideo.srcObject = this._webcamStream;
        
      } catch (e) {
        console.warn('Webcam error:', e);
        if (e.name === 'NotAllowedError') {
          alert('Разрешите доступ к камере в настройках браузера');
        }
      }
    } else if (!on && this._webcamStream) {
      // Останавливаем все треки
      this._webcamStream.getTracks().forEach(t => t.stop());
      this._webcamStream = null;
      
      // Удаляем видео элемент
      if (this._webcamVideo) {
        if (this._webcamVideo.parentNode) {
          this._webcamVideo.parentNode.removeChild(this._webcamVideo);
        }
        this._webcamVideo = null;
      }
    }
  }

  /**
   * Переключает видеозвонок
   * @param {boolean} on - Включить или выключить
   * @param {HTMLCanvasElement} canvas - Canvas элемент сцены
   */
  async toggleCall(on, canvas) {
    this._canvas = canvas;
    
    if (on) {
      if (this._callActive) return; // Защита от двойного вызова
      
      this._callActive = true;
      this._connectionEstablished = false;
      this._wsReconnectAttempts = 0;
      
	  if (typeof window.updateCallButton === 'function') {
		window.updateCallButton = () => {
		  const callBtn = document.getElementById('callBtn');
		  if (callBtn) {
			callBtn.textContent = '📹 Подключение...';
			callBtn.disabled = true;
		  }
		};
		window.updateCallButton();
	  }
	  
      try {
        // Настройка WebRTC
        const config = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
          ]
        };
        
        this._pc = new RTCPeerConnection(config);
        
        // Обработка состояния соединения
        this._setupConnectionStateHandlers();
        
        // Захват видео с canvas
        const stream = canvas.captureStream(30);
        stream.getTracks().forEach(track => {
          this._pc.addTrack(track, stream);
        });
        
        // WebSocket для сигнализации
        this._setupWebSocket();
        
      } catch (err) {
        console.error('WebRTC setup error:', err);
        this._cleanupCall();
        throw err;
      }
    } else {
      this._cleanupCall();
    }
  }

  /**
   * Настраивает обработчики состояния WebRTC соединения
   */
  _setupConnectionStateHandlers() {
    this._pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', this._pc.iceConnectionState);
      
      if (this._pc.iceConnectionState === 'failed') {
        console.log('🔄 Попытка перезапуска ICE');
        this._pc.restartIce();
      }
    };
    
    this._pc.onconnectionstatechange = () => {
      console.log('Connection state:', this._pc.connectionState);
      
      if (this._pc.connectionState === 'connected') {
        this._connectionEstablished = true;
      }
      
      if (this._pc.connectionState === 'failed' || this._pc.connectionState === 'disconnected') {
        console.log('🔄 Перезапуск соединения');
        this._pc.close();
        // Попытка переподключения
        setTimeout(() => {
          if (this._callActive && this._canvas) {
            this.toggleCall(true, this._canvas);
          }
        }, 2000);
      }
    };
    
    this._pc.onsignalingstatechange = () => {
      console.log('Signaling state:', this._pc.signalingState);
      
      // Если мы создали оффер, но WebSocket еще не готов
      if (this._pc.signalingState === 'have-local-offer' && this._ws && this._ws.readyState !== WebSocket.OPEN) {
        console.log('Оффер готов, ожидаем WebSocket...');
      }
    };
  }

  /**
   * Настраивает WebSocket для сигнализации WebRTC
   */
  _setupWebSocket() {
    const room = 'default';
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${location.host}/ws/${room}`;
    
    console.log('Создание WebSocket соединения:', wsUrl);
    
    this._ws = new WebSocket(wsUrl);
    
    // Обработчик успешного подключения
    this._ws.onopen = () => {
      console.log('WebSocket соединение установлено');
      this._wsReconnectAttempts = 0;
      
      // Если у нас уже есть оффер, отправляем его
      if (this._pendingOffer) {
        this._sendOffer(this._pendingOffer);
        this._pendingOffer = null;
      } else {
        // Иначе создаем и отправляем новый оффер
        this._createAndSendOffer();
      }
    };
    
    // Обработчик сообщений
    this._ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        console.log('Получено сообщение через WebSocket:', msg);
        
        if (msg.offer) {
          console.log('Получен оффер, устанавливаем как remote description');
          await this._pc.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: msg.sdp
          }));
          
          console.log('Создаем ответ');
          const answer = await this._pc.createAnswer();
          await this._pc.setLocalDescription(answer);
          
          console.log('Отправляем ответ');
          if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({
              type: 'answer',
              sdp: answer.sdp
            }));
          }
        } else if (msg.answer) {
          console.log('Получен ответ, устанавливаем как remote description');
          await this._pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: msg.sdp
          }));
        } else if (msg.candidate) {
          console.log('Получен ICE кандидат');
          try {
            await this._pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.error('Ошибка добавления ICE кандидата:', e);
          }
        }
      } catch (err) {
        console.error('Ошибка обработки WebSocket сообщения:', err);
      }
    };
    
    // Обработчик ошибок
    this._ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
    
    // Обработчик закрытия
    this._ws.onclose = (event) => {
      console.log(`WebSocket закрыт код=${event.code} причина=${event.reason}`);
      
      if (this._callActive) {
        if (this._wsReconnectAttempts < this._maxWsReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this._wsReconnectAttempts), 5000);
          console.log(`Попытка переподключения WebSocket через ${delay}ms (попытка ${this._wsReconnectAttempts + 1}/${this._maxWsReconnectAttempts})`);
          
          this._wsReconnectAttempts++;
          
          setTimeout(() => {
            if (this._callActive) {
              this._setupWebSocket();
            }
          }, delay);
        } else {
          console.error('Достигнуто максимальное количество попыток переподключения WebSocket');
          this._cleanupCall();
        }
      }
    };
  }

  /**
   * Отправляет оффер через WebSocket
   * @param {Object} offer - Оффер для отправки
   */
  _sendOffer(offer) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      console.log('Отправка оффера через WebSocket');
      this._ws.send(JSON.stringify({
        type: 'offer',
        sdp: offer.sdp
      }));
    } else if (this._ws && this._ws.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket еще подключается, сохраняем оффер для отправки позже');
      this._pendingOffer = offer;
    } else {
      console.error('WebSocket недоступен для отправки оффера');
      this._pendingOffer = offer;
      
      // Пересоздаем WebSocket, если он закрыт
      if (this._callActive && this._ws && this._ws.readyState === WebSocket.CLOSED) {
        console.log('Пересоздаем WebSocket соединение');
        this._setupWebSocket();
      }
    }
  }

  /**
   * Создает и отправляет оффер WebRTC
   */
  async _createAndSendOffer() {
    try {
      console.log('Создание WebRTC оффера...');
      const offer = await this._pc.createOffer({
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1
      });
      
      console.log('Установка локального описания');
      await this._pc.setLocalDescription(offer);
      
      console.log('Попытка отправки оффера');
      this._sendOffer(offer);
    } catch (error) {
      console.error('Ошибка создания оффера:', error);
      this._cleanupCall();
    }
  }

  /**
   * Очищает ресурсы WebRTC
   */
  _cleanupCall() {
    this._callActive = false;
    this._connectionEstablished = false;
    this._pendingOffer = null;
    this._wsReconnectAttempts = 0;
    
    // Очистка WebRTC
    if (this._pc) {
      if (this._pc.getSenders) {
        this._pc.getSenders().forEach(sender => {
          if (sender.track) sender.track.stop();
        });
      }
      this._pc.close();
      this._pc = null;
    }
    
    // Очистка WebSocket
    if (this._ws) {
      // Удаляем обработчики, чтобы избежать утечек памяти
      this._ws.onopen = null;
      this._ws.onmessage = null;
      this._ws.onerror = null;
      this._ws.onclose = null;
      
      // Закрываем соединение
      if (this._ws.readyState === WebSocket.OPEN || 
          this._ws.readyState === WebSocket.CONNECTING) {
        this._ws.close();
      }
      this._ws = null;
    }
  }
}