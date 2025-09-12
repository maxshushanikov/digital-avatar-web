//digital_avatar/avatar-server/frontend/static/modules/avatar/EmotionManager.js
export class EmotionManager {
  constructor(avatarController) {
    this.controller = avatarController;
    this.currentEmotion = 'neutral';
    this.emojiTimer = null;
  }

  reactEmoji(emoji) {
    if (!emoji) return;
    
    this.flashEmoji(emoji);
    
    // Сброс предыдущих анимаций
    clearTimeout(this.emojiTimer);
    
    // Эмодзи-специфичные реакции
    if (emoji === '😊' || emoji === '😉' || emoji === '👍') {
      this.easeMorph('smile', 1, 250);
    } else if (emoji === '😮') {
      this.easeMorph('mouthOpen', 0.8, 250);
    } else if (emoji === '😡') {
      this.easeMorph('mouthOpen', 0.5, 250);
    }
    
    // Возврат в исходное состояние через время
    this.emojiTimer = setTimeout(() => {
      if (this.controller.morphs.smile) {
        this.easeMorph('smile', 0, 250);
      }
      if (this.controller.morphs.mouthOpen) {
        this.easeMorph('mouthOpen', 0, 250);
      }
    }, 1000);
  }

  easeMorph(morphName, target, duration) {
    const morph = this.controller.morphs[morphName];
    if (!morph) return;
    
    const start = morph.mesh.morphTargetInfluences[morph.idx];
    const startTime = performance.now();
    
    const step = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Кубическое easing
      const easedProgress = progress < 0.5 ? 
        4 * progress * progress * progress : 
        1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      const value = start + (target - start) * easedProgress;
      this.controller.setMorph(morphName, value);
      
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    
    step();
  }

  flashEmoji(emoji) {
    let el = document.getElementById('emoji-fx');
    if (!el) {
      el = document.createElement('div');
      el.id = 'emoji-fx';
      Object.assign(el.style, {
        position: 'absolute',
        left: '50%',
        top: '40%',
        transform: 'translate(-50%, -50%)',
        fontSize: '64px',
        pointerEvents: 'none',
        transition: 'opacity 0.3s',
        opacity: '0',
        zIndex: '1000'
      });
      document.body.appendChild(el);
    }
    
    el.textContent = emoji;
    el.style.opacity = '1';
    
    setTimeout(() => {
      el.style.opacity = '0';
    }, 600);
  }

  update() {
    // Обновление эмоционального состояния
  }
}