/**
* Audio module: playback, analysis for lip-sync
*
* Key improvements:
* - Single audio context (prevents memory leaks)
* - Automatic context resumption after first click
* - Mobile support
* - Optimization for lip-sync animation
* - Correct error handling
*/

let audioContext = null;
let contextResumePromise = null;

/**
* Gets or initializes the shared audio context
* @returns {AudioContext} Audio context
*/
export function getAudioContext() {
  if (!audioContext) {
    // Creates an audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Prepare to resume context after first click
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
* Chaks the audio context is resumed
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
* Plays audio and returns an object with the audio element and analyzer
* @param {string} url - URL of the audio file
* @returns {Promise<{audio: HTMLAudioElement, analyzer: AnalyserNode}>}
*/
export async function playAudio(url) {
  try {
    // Checks if the context is resumed
    await ensureContextResumed();
    
    // Creates an audio element
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    
    // Gets audio context
    const ctx = getAudioContext();
    
    // Configures the audio graph
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    
    // Optimized for mobile devices
    const fftSize = isMobile() ? 1024 : 2048;
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.5;
    
    // Connects the nodes
    source.connect(analyser);
    analyser.connect(ctx.destination);
    
    // Returns an object with an audio element and an analyzer
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
* Frees audio resources
* @param {HTMLAudioElement} audio
* @param {MediaElementAudioSourceNode} source
* @param {AnalyserNode} analyser
*/
function cleanupAudio(audio, source, analyser) {
  try {
    // Stops playback
    if (!audio.paused) {
      audio.pause();
    }
    
    // Disables nodes
    source.disconnect();
    analyser.disconnect();
    
    // Clears the source
    audio.src = '';
    audio.load();
  } catch (error) {
    console.warn('Ошибка при очистке аудио:', error);
  }
}

/**
* Checks if the device is mobile
* @returns {boolean}
*/
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
* Plays audio with error handling
* @param {HTMLAudioElement} audio
* @returns {Promise<void>}
*/
export async function safePlay(audio) {
  try {
    await ensureContextResumed();
    
    // Trying to reproduce
    await audio.play();
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Требуется взаимодействие с пользователем для запуска аудио');
    } else if (error.name === 'AbortError') {
      console.log('Загрузка аудио прервана');
    } else {
      console.error('Ошибка воспроизведения:', error);
      throw error;
    }
  }
}

/**
* Sets a handler for audio end
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