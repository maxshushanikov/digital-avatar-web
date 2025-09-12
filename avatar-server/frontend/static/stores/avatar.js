//digital_avatar/avatar-server/frontend/static/stores/avatar.js
import { map } from 'nanostores';

export const avatarState = map({
  morphTargets: {},
  emotions: {},
  animation: 'idle',
  isSpeaking: false,
  currentEmotion: 'neutral',
});