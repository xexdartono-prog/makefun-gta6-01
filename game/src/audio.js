// All sound is synthesized with WebAudio: engine, siren, gunshots, jingles, music.
export function createAudio() {
  const A = {
    ctx: null, master: null, muted: false,
    engineOsc: null, engineGain: null, engineFilter: null,
    sirenOsc: null, sirenGain: null, sirenT: 0, sirenOn: false,
    musicT: 0, musicStep: 0,
    init() {
      if (A.ctx) { A.ctx.resume(); return; }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.5;
      A.master.connect(A.ctx.destination);
      // engine: sawtooth through a lowpass
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 55;
      A.engineFilter = A.ctx.createBiquadFilter();
      A.engineFilter.type = 'lowpass';
      A.engineFilter.frequency.value = 320;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      A.engineOsc.connect(A.engineFilter).connect(A.engineGain).connect(A.master);
      A.engineOsc.start();
      // siren: square wave, frequency flipped by update()
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'square';
      A.sirenOsc.frequency.value = 720;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain).connect(A.master);
      A.sirenOsc.start();
    },
    tone(freq, dur, type, vol, when = 0) {
      if (!A.ctx || A.muted) return;
      const t0 = A.ctx.currentTime + when;
      const o = A.ctx.createOscillator();
      const g = A.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(A.master);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    },
    noise(dur, vol, freq) {
      if (!A.ctx || A.muted) return;
      const len = Math.floor(A.ctx.sampleRate * dur);
      const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = A.ctx.createBufferSource();
      src.buffer = buf;
      const f = A.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq || 1800;
      const g = A.ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f).connect(g).connect(A.master);
      src.start();
    },
    gunshot() { A.noise(0.16, 0.5, 2600); A.tone(90, 0.12, 'sine', 0.35); },
    punch() { A.tone(140, 0.12, 'sine', 0.3); A.noise(0.08, 0.2, 900); },
    thud() { A.tone(70, 0.18, 'sine', 0.4); },
    pickup() { A.tone(880, 0.1, 'sine', 0.25); A.tone(1318, 0.16, 'sine', 0.25, 0.09); },
    jingle() { [523, 659, 784, 1046].forEach((f, i) => A.tone(f, 0.22, 'triangle', 0.22, i * 0.11)); },
    siren() { if (A.ctx) A.sirenOn = true; },
    toggleMute() {
      A.muted = !A.muted;
      if (A.master) A.master.gain.value = A.muted ? 0 : 0.5;
      return A.muted;
    },
    /** Per-frame: engine pitch, siren wail, music step sequencer. */
    update(dt, speed01, driving, wanted) {
      if (!A.ctx) return;
      if (A.engineGain) {
        A.engineGain.gain.value = driving ? 0.05 + speed01 * 0.06 : 0.015;
        A.engineOsc.frequency.value = 55 + speed01 * 160;
      }
      const sirenActive = A.sirenOn && wanted > 0;
      if (A.sirenGain) {
        A.sirenGain.gain.value = sirenActive ? 0.045 : 0;
        if (sirenActive) {
          A.sirenT += dt;
          if (A.sirenT > 0.42) { A.sirenT = 0; A.sirenOsc.frequency.value = A.sirenOsc.frequency.value > 800 ? 700 : 950; }
        }
      }
      // music: lazy A-minor groove, one step every 0.24s
      A.musicT += dt;
      if (A.musicT > 0.24) {
        A.musicT -= 0.24;
        const bass = [110, 0, 110, 130.8, 110, 0, 98, 130.8];
        const n = bass[A.musicStep % 8];
        if (n) A.tone(n, 0.22, 'triangle', 0.07);
        if (A.musicStep % 2 === 1) A.noise(0.03, 0.04, 6000);
        A.musicStep += 1;
      }
    },
  };
  return A;
}
