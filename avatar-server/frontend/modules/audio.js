/**
 * Модуль для работы с аудио: воспроизведение, анализ для lip-sync
 * 
 * Ключевые улучшения:
 * - Единый аудиоконтекст (предотвращает утечки памяти)
 * - Автоматическое возобновление контекста после первого клика
 * - Поддержка мобильных устройств
 * - Оптимизация для lip-sync анимации
 * - Корректная обработка ошибок
 */

let audioContext = null;
let contextResumePromise = null;

/**
 * Получает или инициализирует общий аудиоконтекст
 * @returns {AudioContext} Аудиоконтекст
 */
export function getAudioContext() {
  if (!audioContext) {
    // Создаем аудиоконтекст
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Подготовка к возобновлению контекста после первого клика
    contextResumePromise = new Promise((resolve) => {
      const resumeContext = () => {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().then(resolve);
        } else {
          resolve();
        }
        document.removeEventListener('click', resumeContext);
        document.removeEventListener('touchstart', resumeContext);
      };
      
      document.addEventListener('click', resumeContext, { once: true });
      document.addEventListener('touchstart', resumeContext, { once: true });
    });
  }
  
  return audioContext;
}

/**
 * Убеждается, что аудиоконтекст возобновлен
 * @returns {Promise<void>}
 */
async function ensureContextResumed() {
  if (!audioContext) {
    getAudioContext();
  }
  
  if (audioContext.state === 'suspended') {
    await contextResumePromise;
  }
}

/**
 * Воспроизводит аудио и возвращает объект с аудиоэлементом и анализатором
 * @param {string} url - URL аудиофайла
 * @returns {Promise<{audio: HTMLAudioElement, analyser: AnalyserNode}>}
 */
export async function playAudio(url) {
  try {
    // Убедимся, что контекст возобновлен
    await ensureContextResumed();
    
    // Создаем аудиоэлемент
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    
    // Получаем аудиоконтекст
    const ctx = getAudioContext();
    
    // Настройка графа аудио
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    
    // Оптимизация для мобильных устройств
    const fftSize = isMobile() ? 1024 : 2048;
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.5;
    
    // Подключаем узлы
    source.connect(analyser);
    analyser.connect(ctx.destination);
    
    // Возвращаем объект с аудиоэлементом и анализатором
    return {
      audio,
      analyser,
      cleanup: () => cleanupAudio(audio, source, analyser)
    };
  } catch (error) {
    console.error('Ошибка инициализации аудио:', error);
    throw new Error(`Не удалось инициализировать аудио: ${error.message}`);
  }
}

/**
 * Освобождает аудиоресурсы
 * @param {HTMLAudioElement} audio
 * @param {MediaElementAudioSourceNode} source
 * @param {AnalyserNode} analyser
 */
function cleanupAudio(audio, source, analyser) {
  try {
    // Останавливаем воспроизведение
    if (!audio.paused) {
      audio.pause();
    }
    
    // Отключаем узлы
    source.disconnect();
    analyser.disconnect();
    
    // Очищаем источник
    audio.src = '';
    audio.load();
  } catch (error) {
    console.warn('Ошибка при очистке аудио:', error);
  }
}

/**
 * Проверяет, является ли устройство мобильным
 * @returns {boolean}
 */
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Безопасно воспроизводит аудио с обработкой ошибок
 * @param {HTMLAudioElement} audio
 * @returns {Promise<void>}
 */
export async function safePlay(audio) {
  try {
    await ensureContextResumed();
    
    // Пытаемся воспроизвести
    await audio.play();
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      // Требуется взаимодействие пользователя
      throw new Error('Требуется взаимодействие с пользователем для запуска аудио');
    } else if (error.name === 'AbortError') {
      // Загрузка прервана
      console.log('Загрузка аудио прервана');
    } else {
      console.error('Ошибка воспроизведения:', error);
      throw error;
    }
  }
}

/**
 * Устанавливает обработчик для завершения аудио
 * @param {HTMLAudioElement} audio
 * @param {Function} onEnd
 */
export function setupAudioEndHandler(audio, onEnd) {
  const cleanup = () => {
    audio.removeEventListener('ended', handleEnd);
    audio.removeEventListener('error', handleError);
  };
  
  const handleEnd = () => {
    cleanup();
    onEnd?.(true);
  };
  
  const handleError = (e) => {
    console.error('Ошибка аудио:', e);
    cleanup();
    onEnd?.(false);
  };
  
  audio.addEventListener('ended', handleEnd);
  audio.addEventListener('error', handleError);
}