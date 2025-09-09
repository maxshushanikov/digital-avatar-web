// // digital_avatar/avatar-server/frontend/modules/avatar.js
export class AvatarController {
  constructor(avatar, mixer, THREE) {
    this.avatar = avatar;
    this.mixer = mixer;
    this.THREE = THREE;
    this.morphs = this.findMorphTargets(avatar);
    this._blinkTimer = null;
    this._emojiTimer = null;
    this._lipSyncRAF = null;
    this._webcamStream = null;
    this._pc = null;
    this._ws = null;
  }

  findMorphTargets(root) {
    const morphs = { mouthOpen: null, blinkLeft: null, blinkRight: null, smile: null };
    root.traverse((o) => {
      if (o.isMesh && o.morphTargetDictionary) {
        const dict = o.morphTargetDictionary;
        if ('mouthOpen' in dict) morphs.mouthOpen = { mesh: o, idx: dict['mouthOpen'] };
        if ('Blink_Left' in dict) morphs.blinkLeft = { mesh: o, idx: dict['Blink_Left'] };
        if ('Blink_Right' in dict) morphs.blinkRight = { mesh: o, idx: dict['Blink_Right'] };
        if ('Smile' in dict) morphs.smile = { mesh: o, idx: dict['Smile'] };
      }
    });
    return morphs;
  }

  setMorph(m, v) {
    if (!m) return;
    m.mesh.morphTargetInfluences[m.idx] = this.THREE.MathUtils.clamp(v, 0, 1);
  }

  startBlinking() {
    const blink = () => {
      const dur = 120;
      this.animateBlink(1, dur / 2);
      setTimeout(() => this.animateBlink(0, dur / 2), dur / 2);
      const next = 2500 + Math.random() * 2500;
      this._blinkTimer = setTimeout(blink, next);
    };
    blink();
  }

  animateBlink(value, ms) {
    const { blinkLeft, blinkRight } = this.morphs;
    const startL = blinkLeft ? blinkLeft.mesh.morphTargetInfluences[blinkLeft.idx] : 0;
    const startR = blinkRight ? blinkRight.mesh.morphTargetInfluences[blinkRight.idx] : 0;
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / ms;
      const v = this.THREE.MathUtils.lerp(startL, value, Math.min(1, t));
      this.setMorph(blinkLeft, v);
      this.setMorph(blinkRight, v);
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }
  
  /**
   * Останавливает lip-sync анимацию
   */
  stopLipSync() {
    if (this._lipSyncRAF) {
      cancelAnimationFrame(this._lipSyncRAF);
      this._lipSyncRAF = null;
      
      // Сбрасываем анимацию губ
      this.setMorph(this.morphs.mouthOpen, 0);
    }
  }

  lipSyncWithAnalyser(analyser) {
    // Сначала останавливаем предыдущую анимацию, если она есть
    this.stopLipSync();
    const data = new Uint8Array(analyser.fftSize);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const mouth = this.THREE.MathUtils.clamp((rms - 0.02) * 10.0, 0, 1);
      this.setMorph(this.morphs.mouthOpen, mouth);
      this._lipSyncRAF = requestAnimationFrame(loop);
    };
    loop();
  }

  reactEmoji(emoji) {
    if (!emoji) return;
    this.flashEmoji(emoji);
    if (emoji === '😊' || emoji === '😉' || emoji === '👍') this.easeMorph(this.morphs.smile, 1, 250);
    if (emoji === '😮') this.easeMorph(this.morphs.mouthOpen, 0.8, 250);
    clearTimeout(this._emojiTimer);
    this._emojiTimer = setTimeout(() => {
      this.easeMorph(this.morphs.smile, 0, 250);
      this.easeMorph(this.morphs.mouthOpen, 0, 250);
    }, 1000);
  }

  easeMorph(morph, target, ms) {
    if (!morph) return;
    const start = morph.mesh.morphTargetInfluences[morph.idx];
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / ms;
      const v = this.THREE.MathUtils.lerp(start, target, Math.min(1, t));
      this.setMorph(morph, v);
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }

  flashEmoji(emoji) {
    let el = document.getElementById('emoji-fx');
    if (!el) {
      el = document.createElement('div');
      el.id = 'emoji-fx';
      Object.assign(el.style, {
        position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)',
        fontSize: '64px', pointerEvents: 'none', transition: 'opacity .2s', opacity: '0'
      });
      document.body.appendChild(el);
    }
    el.textContent = emoji;
    el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 600);
  }

  async toggleWebcam(on) {
    if (on && !this._webcamStream) {
      try {
        this._webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 256, height: 256 } });
      } catch (e) {
        console.warn('Webcam error', e);
      }
    } else if (!on && this._webcamStream) {
      this._webcamStream.getTracks().forEach(t => t.stop());
      this._webcamStream = null;
    }
  }

    async toggleCall(on, canvas) {
    if (on) {
      const stream = canvas.captureStream(30);
      this._pc = new RTCPeerConnection({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
      });
      stream.getTracks().forEach(t => this._pc.addTrack(t, stream));

      const room = 'default';
      this._ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws/${room}`);

      this._ws.onmessage = async (e) => {
        const msg = JSON.parse(e.data);
        if (msg.answer) await this._pc.setRemoteDescription(msg.answer);
        if (msg.candidate) await this._pc.addIceCandidate(msg.candidate);
        if (msg.offer) {
          await this._pc.setRemoteDescription(msg.offer);
          const ans = await this._pc.createAnswer();
          await this._pc.setLocalDescription(ans);
          this._ws.send(JSON.stringify({ answer: ans }));
        }
      };

      this._pc.onicecandidate = (e) => {
		if (e.candidate && this._ws && this._ws.readyState === WebSocket.OPEN) {
		  this._ws.send(JSON.stringify({ candidate: e.candidate }));
		}
	  };

      // Создаём оффер и отправляем на сервер
      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);
      this._ws.onopen = () => {
        this._ws.send(JSON.stringify({ offer }));
      };

    } else {
      // Отключение звонка
      if (this._pc) {
        this._pc.close();
        this._pc = null;
      }
      if (this._ws) {
        this._ws.close();
        this._ws = null;
      }
    }
  }
}
