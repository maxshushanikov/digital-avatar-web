//digital_avatar/avatar-server/frontend/src/components/Chat/Chat.js
import { chatState } from '../../stores/session.js';

export function setupChat() {
  const history = document.getElementById('history');
  const input = document.getElementById('textInput');
  const sendBtn = document.getElementById('sendBtn');
  
  // Подписка на изменения состояния чата
  chatState.listen((state) => {
    renderMessages(state.messages);
    input.disabled = state.isSending;
    sendBtn.disabled = state.isSending;
    sendBtn.textContent = state.isSending ? '⏳' : 'Отправить';
  });
  
  // Обработчик отправки сообщения
  function handleSubmit() {
    const text = input.value.trim();
    if (text && !chatState.get().isSending) {
      // Добавление сообщения пользователя
      const messages = [...chatState.get().messages];
      messages.push({
        role: 'user',
        content: text,
        timestamp: Date.now()
      });
      
      chatState.setKey('messages', messages);
      input.value = '';
      
      // Вызов колбэка отправки (будет передан из main.js)
      if (window.chatHandlers && window.chatHandlers.onSubmit) {
        window.chatHandlers.onSubmit(text);
      }
    }
  }
  
  // Обработчики событий
  sendBtn.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  });
  
  // Функция рендеринга сообщений
  function renderMessages(messages) {
    history.innerHTML = '';
    
    messages.forEach((msg) => {
      const messageEl = document.createElement('div');
      messageEl.className = `message ${msg.role}`;
      messageEl.textContent = msg.content;
      history.appendChild(messageEl);
    });
    
    history.scrollTop = history.scrollHeight;
  }
  
  // Инициализация
  renderMessages(chatState.get().messages);
}