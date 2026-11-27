// SPDX-License-Identifier: MIT
// Zero-asset procedural WebAudio soundscape: twin prop hum, wind rush, stall horn, chimes, drops, thunder.

export function createFlightAudio() {
  let ctx = null;
  let muted = false;
  let unlocked = false;
  let propOsc1 = null;
  let propOsc2 = null;
  let propGain = null;
  let windGain = null;
  let windFilter = null;
  let stallOsc = null;
  let stallGain = null;

  function unlock() {
    if (unlocked || muted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      // Twin radial engine harmonics
      propOsc1 = ctx.createOscillator();
      propOsc2 = ctx.createOscillator();
      propOsc1.type = 'sawtooth';
      propOsc2.type = 'triangle';
      propOsc1.frequency.value = 62;
      propOsc2.frequency.value = 124;

      const propFilter = ctx.createBiquadFilter();
      propFilter.type = 'lowpass';
      propFilter.frequency.value = 260;

      propGain = ctx.createGain();
      propGain.gain.value = 0.0;

      propOsc1.connect(propFilter);
      propOsc2.connect(propFilter);
      propFilter.connect(propGain);
      propGain.connect(ctx.destination);
      propOsc1.start();
      propOsc2.start();

      // Filtered white noise for slipstream wind
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 1.2;

      windGain = ctx.createGain();
      windGain.gain.value = 0.0;

      noiseSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      noiseSrc.start();

      // Stall warning horn
      stallOsc = ctx.createOscillator();
      stallOsc.type = 'square';
      stallOsc.frequency.value = 780;
      stallGain = ctx.createGain();
      stallGain.gain.value = 0.0;
      stallOsc.connect(stallGain);
      stallGain.connect(ctx.destination);
      stallOsc.start();

      unlocked = true;
    } catch {
      unlocked = false;
    }
  }

  function updateEngine(plane, active) {
    if (!unlocked || !ctx || muted) {
      if (propGain && ctx) propGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      if (windGain && ctx) windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      if (stallGain && ctx) stallGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      return;
    }
    const now = ctx.currentTime;
    if (!active) {
      propGain.gain.setTargetAtTime(0, now, 0.08);
      windGain.gain.setTargetAtTime(0, now, 0.08);
      stallGain.gain.setTargetAtTime(0, now, 0.04);
      return;
    }
    const rpmFactor = plane.fuel <= 0 ? 0.25 : 0.55 + plane.throttle * 0.85 + (plane.boosting ? 0.3 : 0);
    propOsc1.frequency.setTargetAtTime(48 * rpmFactor, now, 0.08);
    propOsc2.frequency.setTargetAtTime(97 * rpmFactor, now, 0.08);
    propGain.gain.setTargetAtTime(plane.fuel <= 0 ? 0.01 : 0.045 + plane.throttle * 0.03, now, 0.08);

    const speedRatio = Math.min(1, Math.max(0, (plane.speedKts - 35) / 130));
    windFilter.frequency.setTargetAtTime(280 + speedRatio * 900, now, 0.1);
    windGain.gain.setTargetAtTime(0.01 + speedRatio * 0.04, now, 0.1);

    const stallPulse = plane.stalling && Math.floor(now * 6) % 2 === 0 ? 0.045 : 0;
    stallGain.gain.setTargetAtTime(stallPulse, now, 0.02);
  }

  function playTone(freq, duration, type = 'sine', vol = 0.08, endFreq = freq) {
    if (!unlocked || !ctx || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  return {
    unlock,
    updateEngine,
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      if (!muted) unlock();
      return muted;
    },
    playRing(streak = 1) {
      const base = 440 * Math.pow(1.06, Math.min(10, streak));
      playTone(base, 0.14, 'triangle', 0.09, base * 1.25);
      setTimeout(() => playTone(base * 1.5, 0.22, 'sine', 0.07), 70);
    },
    playDrop() {
      playTone(620, 0.32, 'sine', 0.07, 260);
    },
    playFlaps() {
      playTone(210, 0.12, 'sawtooth', 0.04, 280);
    },
    playTouchdown(greased) {
      playTone(greased ? 520 : 190, 0.26, greased ? 'triangle' : 'sawtooth', 0.09, greased ? 780 : 95);
    },
    playCrash() {
      playTone(135, 0.55, 'sawtooth', 0.14, 42);
    },
    playClick() {
      playTone(680, 0.07, 'triangle', 0.05, 820);
    },
  };
}
