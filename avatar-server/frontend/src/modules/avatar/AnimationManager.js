export class AnimationManager {
  constructor(avatarController) {
    this.controller = avatarController;
    this.blinkTimer = null;
    this.idleAnimations = [];
    this.currentAnimation = null;
  }

  startBlinking() {
    if (this.blinkTimer) return;
    
    const blink = () => {
      const duration = 120;
      this.animateBlink(1, duration / 2);
      
      setTimeout(() => this.animateBlink(0, duration / 2), duration / 2);
      
      // Случайная задержка между морганиями (2.5-5 сек)
      const next = 2500 + Math.random() * 2500;
      this.blinkTimer = setTimeout(blink, next);
    };
    
    blink();
  }

  animateBlink(value, duration) {
    const { blinkLeft, blinkRight } = this.controller.morphs;
    
    if (!blinkLeft && !blinkRight) return;
    
    const startL = blinkLeft ? blinkLeft.mesh.morphTargetInfluences[blinkLeft.idx] : 0;
    const startR = blinkRight ? blinkRight.mesh.morphTargetInfluences[blinkRight.idx] : 0;
    
    const startTime = performance.now();
    
    const step = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const currentValue = startL + (value - startL) * progress;
      
      if (blinkLeft) this.controller.setMorph('blinkLeft', currentValue);
      if (blinkRight) this.controller.setMorph('blinkRight', currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    
    step();
  }

  playAnimation(name, loop = true) {
    if (this.currentAnimation) {
      this.currentAnimation.stop();
    }
    
    const clip = this.controller.mixer.clipAction(name);
    if (clip) {
      clip.setLoop(loop ? this.controller.THREE.LoopRepeat : this.controller.THREE.LoopOnce);
      clip.play();
      this.currentAnimation = clip;
    }
  }

  stopCurrentAnimation() {
    if (this.currentAnimation) {
      this.currentAnimation.stop();
      this.currentAnimation = null;
    }
  }

  update() {
    // Обновление анимаций
  }
}