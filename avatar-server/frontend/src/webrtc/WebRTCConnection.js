export class WebRTCConnection {
  constructor() {
    this.pc = null;
    this.ws = null;
    this.room = 'default';
    this.isCallActive = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async startCall(stream) {
    try {
      this.isCallActive = true;
      
      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      };
      
      this.pc = new RTCPeerConnection(config);
      
      // Добавление треков в соединение
      stream.getTracks().forEach(track => {
        this.pc.addTrack(track, stream);
      });
      
      // Обработчики событий WebRTC
      this.pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', this.pc.iceConnectionState);
      };
      
      this.pc.onconnectionstatechange = () => {
        console.log('Connection state:', this.pc.connectionState);
      };
      
      // Подключение к сигнальному серверу
      await this.connectSignalingServer();
      
      // Создание и отправка оффера
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      
      this.ws.send(JSON.stringify({
        type: 'offer',
        sdp: offer.sdp
      }));
      
    } catch (error) {
      console.error('Ошибка начала звонка:', error);
      this.cleanup();
      throw error;
    }
  }

  async connectSignalingServer() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/${this.room}`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket соединение установлено');
        this.reconnectAttempts = 0;
        resolve();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        reject(error);
      };
      
      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'answer') {
            await this.pc.setRemoteDescription({
              type: 'answer',
              sdp: message.sdp
            });
          } else if (message.type === 'candidate') {
            await this.pc.addIceCandidate(message.candidate);
          }
        } catch (error) {
          console.error('Ошибка обработки сообщения WebSocket:', error);
        }
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket соединение закрыто');
        if (this.isCallActive && this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts++;
            this.connectSignalingServer();
          }, 1000 * this.reconnectAttempts);
        }
      };
    });
  }

  async endCall() {
    this.isCallActive = false;
    this.cleanup();
  }

  cleanup() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.reconnectAttempts = 0;
  }
}