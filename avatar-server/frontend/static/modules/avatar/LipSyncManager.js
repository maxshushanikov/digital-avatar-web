//digital_avatar/avatar-server/frontend/static/modules/avatar/LipSyncManager.js
export class LipSyncManager {
  constructor(avatarController) {
    this.controller = avatarController;
    this.isActive = false;
    this.analyser = null;
    this.lastMouthValue = 0;
    this.smoothing = 0.3;
  }

  start(analyser = null) {
    this.isActive = true;
    this.analyser = analyser;
  }

  stop() {
    this.isActive = false;
    this.analyser = null;
    
    // Плавное закрытие рта
    this.animateMouthClose();
  }

  update() {
    if (!this.isActive) return;

    if (this.analyser) {
      // Режим с анализатором аудио
      this.updateWithAnalyser();
    } else {
      // Fallback режим (без аудиоанализа)
      this.updateFallback();
    }
  }

  updateWithAnalyser() {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    
    const rms = Math.sqrt(sum / data.length) / 255;
    const targetValue = Math.min(rms * 1.5, 1);
    
    this.lastMouthValue += (targetValue - this.lastMouthValue) * this.smoothing;
    this.controller.setMorph('mouthOpen', this.lastMouthValue);
  }

  updateFallback() {
    // Простая синусоидальная анимация для fallback
    const time = performance.now() / 1000;
    const value = 0.5 + 0.5 * Math.sin(time * 5);
    this.controller.setMorph('mouthOpen', value * 0.7);
  }

  animateMouthClose() {
    let value = this.lastMouthValue;
    const animate = () => {
      if (value > 0.01) {
        value *= 0.7;
        this.controller.setMorph('mouthOpen', value);
        requestAnimationFrame(animate);
      }
    };
    animate();
  }
}