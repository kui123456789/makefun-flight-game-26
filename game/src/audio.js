// Sound for Skyline Courier: everything is synthesised with WebAudio —
// an engine hum whose pitch follows the throttle, a chime when a ring is
// threaded, a thud on touchdown and a crunch on a crash. No audio files.
export function createAudio() {
  const audio = {
    context: null,
    engineOsc: null,
    engineGain: null,
    enabled: false,
    muted: false,
  };

  audio.ensure = function ensureAudio() {
    if (audio.context) {
      if (audio.context.state === 'suspended') audio.context.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio.context = new Ctx();
      audio.engineOsc = audio.context.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineGain = audio.context.createGain();
      audio.engineGain.gain.value = 0;
      const filter = audio.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.context.destination);
      audio.engineOsc.start();
      audio.enabled = true;
    } catch {
      audio.enabled = false;
    }
  };

  audio.setEngine = function setEngine(throttle, speed, flying) {
    if (!audio.enabled || audio.muted || !audio.engineOsc) return;
    if (!Number.isFinite(throttle) || !Number.isFinite(speed)) return;
    const target = flying ? 0.028 + throttle * 0.05 : 0;
    audio.engineGain.gain.setTargetAtTime(target, audio.context.currentTime, 0.15);
    audio.engineOsc.frequency.setTargetAtTime(48 + throttle * 70 + speed * 0.25, audio.context.currentTime, 0.1);
  };

  function blip(frequency, duration, type, volume) {
    if (!audio.enabled || audio.muted || !audio.context) return;
    const osc = audio.context.createOscillator();
    const gain = audio.context.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume || 0.12, audio.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.context.currentTime + duration);
    osc.connect(gain);
    gain.connect(audio.context.destination);
    osc.start();
    osc.stop(audio.context.currentTime + duration);
  }

  audio.ringChime = function ringChime() {
    blip(880, 0.35, 'sine', 0.14);
    setTimeout(() => blip(1318, 0.4, 'sine', 0.12), 90);
  };

  audio.touchdown = function touchdown() {
    blip(120, 0.3, 'triangle', 0.18);
  };

  audio.crash = function crash() {
    blip(70, 0.7, 'sawtooth', 0.22);
    setTimeout(() => blip(45, 0.9, 'sawtooth', 0.18), 120);
  };

  audio.click = function click() {
    blip(660, 0.08, 'square', 0.05);
  };

  return audio;
}
