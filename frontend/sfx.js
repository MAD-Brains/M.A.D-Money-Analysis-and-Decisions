// ═══════════════════════════════════════════════
// M.A.D — Sound & Haptic Feedback
// Synthesized tones via Web Audio API (no audio files) + navigator.vibrate
// ═══════════════════════════════════════════════

let audioCtx = null;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function isSfxEnabled() {
  return localStorage.getItem('mad-sfx') !== 'off';
}

function setSfxEnabled(on) {
  localStorage.setItem('mad-sfx', on ? 'on' : 'off');
}

// Recipes: each note plays `duration` seconds starting `offset` seconds
// after playSound() is called, with an exponential decay to silence.
const SFX_RECIPES = {
  success: [
    { frequency: 660, offset: 0,    duration: 0.1,  type: 'sine' },
    { frequency: 880, offset: 0.08, duration: 0.16, type: 'sine' },
  ],
  error: [
    { frequency: 160, offset: 0, duration: 0.22, type: 'sawtooth', volume: 0.1 },
  ],
  tap: [
    { frequency: 520, offset: 0, duration: 0.05, type: 'square', volume: 0.06 },
  ],
  celebration: [
    { frequency: 523.25, offset: 0,    duration: 0.12, type: 'sine' }, // C5
    { frequency: 659.25, offset: 0.1,  duration: 0.12, type: 'sine' }, // E5
    { frequency: 783.99, offset: 0.2,  duration: 0.25, type: 'sine' }, // G5
  ],
};

function playTone(ctx, { frequency, startTime, duration, type, volume }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playSound(name) {
  if (!isSfxEnabled()) return;
  const recipe = SFX_RECIPES[name];
  if (!recipe) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  recipe.forEach((note) => {
    playTone(ctx, {
      frequency: note.frequency,
      startTime: now + note.offset,
      duration: note.duration,
      type: note.type,
      volume: note.volume ?? 0.15,
    });
  });
}

function vibrate(pattern) {
  if (!isSfxEnabled()) return;
  if (navigator.vibrate) navigator.vibrate(pattern);
}
