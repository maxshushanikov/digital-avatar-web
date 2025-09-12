//digital_avatar/avatar-server/frontend/static/utils/performance.js
export class PerformanceMonitor {
  static metrics = {
    fps: 0,
    memory: {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0
    },
    render: {
      calls: 0,
      triangles: 0
    }
  };

  static init() {
    this.frames = 0;
    this.lastTime = performance.now();
    
    // Запуск мониторинга FPS
    this.monitorFPS();
    
    // Запуск мониторинга памяти (если доступно)
    if (window.performance && window.performance.memory) {
      this.monitorMemory();
    }
    
    console.log('Performance monitoring initialized');
  }

  static monitorFPS() {
    const now = performance.now();
    this.frames++;
    
    if (now >= this.lastTime + 1000) {
      this.metrics.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
      this.frames = 0;
      this.lastTime = now;
      
      // Логирование FPS при необходимости
      if (this.metrics.fps < 30) {
        console.warn(`Low FPS: ${this.metrics.fps}`);
      }
    }
    
    requestAnimationFrame(() => this.monitorFPS());
  }

  static monitorMemory() {
    if (window.performance && window.performance.memory) {
      const memory = window.performance.memory;
      this.metrics.memory = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize
      };
      
      // Логирование использования памяти при необходимости
      if (memory.usedJSHeapSize > memory.totalJSHeapSize * 0.8) {
        console.warn('High memory usage:', this.metrics.memory);
      }
    }
    
    setTimeout(() => this.monitorMemory(), 5000);
  }

  static updateRenderMetrics(renderer) {
    if (renderer && renderer.info) {
      this.metrics.render = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles
      };
    }
  }

  static getMetrics() {
    return this.metrics;
  }
}