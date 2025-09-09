export async function playAudio(url) {
  const audio = new Audio(url);
  audio.crossOrigin = 'anonymous';
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  return { audio, ctx, analyser, source };
}
