// Synthesized sounds (no audio files): club strike, landing thud.
let ctx = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// quality 0..1 (pure strike = 1), kind: 'wood' | 'iron' ...
export function playStrike(speed, quality, kind) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const gain = Math.min(1, 0.25 + speed / 50);
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(ctx.destination);

  // broadband click
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(0.12);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  const wood = kind === 'wood' || kind === 'hybrid';
  bp.frequency.value = wood ? 2600 : 4200;
  bp.Q.value = wood ? 0.9 : 1.6;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(1.0, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + (wood ? 0.09 : 0.05));
  n.connect(bp).connect(ng).connect(out);
  n.start(t);

  // ringing body: drivers "ping", irons "click", mishits thud
  const o = ctx.createOscillator();
  o.type = 'triangle';
  const base = wood ? 1350 : 2300;
  o.frequency.setValueAtTime(base * (0.7 + 0.3 * quality), t);
  o.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.15);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.35 * quality, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + (wood ? 0.25 : 0.12));
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.3);
}

export function playThud(volume = 0.3) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.2);
}
