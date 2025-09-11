import { audioState } from '../../stores/audio.js';

export class AudioManager {
  constructor() {
    this.audioContext = null;
    this.recorder = null;
    this.mediaStream = null;
    this.isRecording = false;
  }

  getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  async playAudio(url) {
    try {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.src = url;
      
      audioState.setKey('isPlaying', true);
      audioState.setKey('currentUrl', url);
      
      await audio.play();
      
      // Обработка завершения воспроизведения
      audio.addEventListener('ended', () => {
        audioState.setKey('isPlaying', false);
        audioState.setKey('currentUrl', null);
      });
      
      return audio;
    } catch (error) {
      console.error('Ошибка воспроизведения аудио:', error);
      audioState.setKey('isPlaying', false);
      throw error;
    }
  }

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;
      
      const audioContext = this.getAudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      
      this.recorder = new MediaRecorder(stream);
      this.chunks = [];
      
      this.recorder.ondataavailable = (e) => {
        this.chunks.push(e.data);
      };
      
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/wav' });
        this.onRecordingComplete(blob);
      };
      
      this.recorder.start();
      this.isRecording = true;
      
      return analyser;
    } catch (error) {
      console.error('Ошибка начала записи:', error);
      throw error;
    }
  }

  async stopRecording() {
    if (this.recorder && this.isRecording) {
      this.recorder.stop();
      this.isRecording = false;
      
      // Остановка всех треков
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
    }
  }

  onRecordingComplete(blob) {
    // Здесь можно отправить аудио на сервер для обработки
    console.log('Запись завершена, размер:', blob.size);
    
    // Для демонстрации создаем временный URL
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
  }
}