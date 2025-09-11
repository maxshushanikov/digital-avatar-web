import { map } from 'nanostores';

export const avatarState = map({
  morphTargets: {},
  emotions: {},
  animation: 'idle',
  isSpeaking: false,
  currentEmotion: 'neutral',
});