import { initScene } from './modules/scene.js';
import { AvatarController } from './modules/avatar.js';
import { playAudio } from './modules/audio.js';
import { setupUI } from './modules/ui.js';
import { isMobile } from './modules/utils.js';

const sessionId = localStorage.getItem('session_id') || crypto.randomUUID();
localStorage.setItem('session_id', sessionId);

const canvas = document.getElementById('scene');
const { renderer, scene, camera, mixer, avatar, THREE } =
  await initScene(canvas, '/assets/avatar.glb');

const avatarCtrl = new AvatarController(avatar, mixer, THREE);
avatarCtrl.startBlinking();

let analyser = null;
let sourceNode = null;

async function sendMessage(text) {
  addMsg('user', text);
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message: text,
      system_prompt: 'Ты дружелюбный, краткий ассистент. Отвечай на русском.',
      temperature: 0.6,
      model: 'llama3'
    })
  });
  const data = await res.json();
  addMsg('assistant', data.text);

  if (data.audio_url) {
    const { audio, ctx, analyser: an, source } = await playAudio(data.audio_url);
    analyser = an; sourceNode = source;
    avatarCtrl.lipSyncWithAnalyser(analyser);
    await audio.play();
  }
}

function addMsg(role, text) {
  const node = document.createElement('div');
  node.className = `message ${role}`;
  node.textContent = text;
  document.getElementById('history').appendChild(node);
  node.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

setupUI({
  onSubmit: (text) => sendMessage(text),
  onMicText: (text) => sendMessage(text),
  onEmoji: (emoji) => avatarCtrl.reactEmoji(emoji),
  onWebcamToggle: async (on) => avatarCtrl.toggleWebcam(on),
  onCallToggle: async (on) => avatarCtrl.toggleCall(on, canvas)
});
