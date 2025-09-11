import { LipSyncManager } from './LipSyncManager.js';
import { EmotionManager } from './EmotionManager.js';
import { AnimationManager } from './AnimationManager.js';
import { avatarState } from '../../stores/avatar.js';

export class AvatarController {
  constructor(avatar, mixer, THREE) {
    this.avatar = avatar;
    this.mixer = mixer;
    this.THREE = THREE;
    this.morphs = {};
    
    this.lipSync = new LipSyncManager(this);
    this.emotions = new EmotionManager(this);
    this.animations = new AnimationManager(this);
    
    this.init();
  }

  init() {
    this.findMorphTargets();
    this.setupEventListeners();
  }

  findMorphTargets() {
    this.avatar.traverse((object) => {
      if (object.isMesh && object.morphTargetDictionary) {
        const dict = object.morphTargetDictionary;
        
        // Поиск морф-таргетов с поддержкой разных имен
        const mouthOpenNames = ['mouthOpen', 'Mouth_Open', 'jawOpen', 'Viseme_ah', 'viseme_ah', 'Mouth.AH'];
        for (const name of mouthOpenNames) {
          if (name in dict) {
            this.morphs.mouthOpen = { mesh: object, idx: dict[name] };
            break;
          }
        }
        
        // Поиск других морф-таргетов
        if ('Blink_Left' in dict || 'blink_left' in dict) {
          this.morphs.blinkLeft = { 
            mesh: object, 
            idx: dict['Blink_Left'] || dict['blink_left'] 
          };
        }
        
        if ('Blink_Right' in dict || 'blink_right' in dict) {
          this.morphs.blinkRight = { 
            mesh: object, 
            idx: dict['Blink_Right'] || dict['blink_right'] 
          };
        }
        
        if ('Smile' in dict || 'smile' in dict) {
          this.morphs.smile = { 
            mesh: object, 
            idx: dict['Smile'] || dict['smile'] 
          };
        }
      }
    });
    
    // Сохраняем найденные морф-таргеты в состоянии
    avatarState.setKey('morphTargets', this.morphs);
  }

  setMorph(morphName, value) {
    const morph = this.morphs[morphName];
    if (morph) {
      const clampedValue = Math.max(0, Math.min(1, value));
      morph.mesh.morphTargetInfluences[morph.idx] = clampedValue;
    }
  }

  setupEventListeners() {
    // Подписка на изменения состояния
    avatarState.listen((state) => {
      if (state.isSpeaking && !this.lipSync.isActive) {
        this.lipSync.start();
      } else if (!state.isSpeaking && this.lipSync.isActive) {
        this.lipSync.stop();
      }
    });
  }

  update(deltaTime) {
    if (this.mixer) this.mixer.update(deltaTime);
    this.lipSync.update();
    this.emotions.update();
  }
}