import { map } from 'nanostores';

export const audioState = map({
  isPlaying: false,
  currentUrl: null,
  volume: 1.0,
  isMuted: false,
});