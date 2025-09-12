//digital_avatar/avatar-server/frontend/static/stores/session.js
import { atom, map } from 'nanostores';

export const sessionState = atom('disconnected');

export const chatState = map({
  messages: [],
  input: '',
  isSending: false,
});

export const connectionState = map({
  isWebcamActive: false,
  isCallActive: false,
  isCallConnecting: false,
});