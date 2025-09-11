export class ErrorHandler {
  static setupGlobalHandlers() {
    window.addEventListener('error', this.handleError);
    window.addEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  static handleError(event) {
    console.error('Global error:', event.error);
    
    // Показать пользователю сообщение об ошибке
    this.showErrorNotification('Произошла ошибка в приложении');
  }

  static handlePromiseRejection(event) {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
    
    // Показать пользователю сообщение об ошибке
    this.showErrorNotification('Произошла непредвиденная ошибка');
  }

  static showErrorNotification(message) {
    // Создание уведомления об ошибке
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: #ff6b6b;
      color: white;
      border-radius: 8px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 300px;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Автоматическое скрытие через 5 секунд
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  static captureError(error, context = {}) {
    console.error('Captured error:', error, context);
    
    // Здесь можно добавить логику отправки ошибок на сервер
    if (window.app && window.app.stores) {
      // Сохраняем информацию об ошибке в состоянии
      window.app.stores.session.set('error');
    }
  }
}