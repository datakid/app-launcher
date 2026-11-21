import { LX_DEBUG, clamp } from './util.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.reverb = null;
    this.reverbHP = null;
    this.rvbSend = null;
    this.enabled = false;
    this.scale = [523.25, 587.33, 659.25, 783.99, 880];
    this._lastTick = 0;
    this._lastHover = 0;
  }

  async _boot() {
    if (this.ctx) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.5;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 6;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;

      master.connect(compressor);
      compressor.connect(ctx.destination);

      const sr = ctx.sampleRate;
      const len = sr * 2.5;
      const buf = ctx.createBuffer(2, len, sr);

      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5) * Math.exp(-i / sr * 0.6);
        }
      }

      const reverb = ctx.createConvolver();
      reverb.buffer = buf;
      const reverbHP = ctx.createBiquadFilter();
      reverbHP.type = 'highpass';
      reverbHP.frequency.value = 300;
      const rvbSend = ctx.createGain();
      rvbSend.gain.value = 0.25;
      reverb.connect(reverbHP);
      reverbHP.connect(rvbSend);
      rvbSend.connect(master);

      this.ctx = ctx;
      this.master = master;
      this.compressor = compressor;
      this.reverb = reverb;
      this.reverbHP = reverbHP;
      this.rvbSend = rvbSend;

      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) { this.ctx.suspend(); }
        else if (this.enabled) { this.ctx.resume(); }
      });
    } catch (e) { if (LX_DEBUG) console.warn(e); }
  }

  _v(freq, type, t, dur, vol, freqEnd) {
    if (!this.ctx) return;
    const jitter = 1 + (Math.random() * 2 - 1) * 0.003;
    const f0 = freq * jitter;
    const f1 = freqEnd ? freqEnd * jitter : null;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(2800, t);
    filter.frequency.exponentialRampToValueAtTime(1900, t + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + Math.min(0.005, dur * 0.1));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    filter.connect(env);
    env.connect(this.master);
    if (this.reverb) env.connect(this.reverb);

    [-4, 4].forEach((cents) => {
      const osc = this.ctx.createOscillator();
      osc.type = type || 'sine';
      const ratio = Math.pow(2, cents / 1200);
      osc.frequency.setValueAtTime(f0 * ratio, t);
      if (f1) osc.frequency.exponentialRampToValueAtTime(f1 * ratio, t + dur);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    });
  }

  async hover(idx = 0, opts = {}) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    if (opts.throttle !== false) {
      if (now - this._lastHover < 0.07) return;
      this._lastHover = now;
    }
    const octave = opts.octave || 0;
    const velocity = clamp(opts.velocity || 0, 0, 1);
    const g = 1 - velocity * 0.65;
    const f = this.scale[((idx % this.scale.length) + this.scale.length) % this.scale.length] * Math.pow(2, octave);
    this._v(f, 'sine', now, 0.18, 0.02 * g);
    this._v(f * 2, 'sine', now + 0.008, 0.12, 0.005 * g);
  }

  async switchSweep(fromKey, toKey) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const root = (k) => this.scale[((k % this.scale.length) + this.scale.length) % this.scale.length];
    const from = root(fromKey), to = root(toKey);
    const t = this.ctx.currentTime;
    this._v(from, 'sine', t, 0.18, 0.025, to);
    this._v(from * 1.5, 'sine', t, 0.18, 0.015, to * 1.5);
  }

  async click() {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this._v(900, 'sine', t, 0.02, 0.03, 300);
    this._v(1046.50, 'sine', t, 0.4, 0.025);
    this._v(1318.51, 'sine', t + 0.02, 0.35, 0.015);
  }

  async tick(idx = 0) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    if (now - this._lastTick < 0.045) return;
    this._lastTick = now;
    const f = this.scale[((idx % this.scale.length) + this.scale.length) % this.scale.length] * 0.5;
    this._v(f, 'sine', now, 0.09, 0.012);
    this._v(f * 3, 'sine', now + 0.004, 0.05, 0.0025);
  }

  _air(t, dur, vol) {
    if (!this.ctx) return;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    if (this.reverb) env.connect(this.reverb);

    src.start(t);
    src.stop(t + dur + 0.05);
  }

  async veil(opening) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const a = opening ? 392 : 587.33;
    const b = opening ? 587.33 : 392;
    this._v(a, 'sine', t, 0.42, 0.016, b);
    this._v(a * 2, 'sine', t + 0.03, 0.3, 0.006, b * 2);
    if (opening) this._air(t, 0.5, 0.02);
  }

  async arpUp() {
    await this._boot();
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._v(f, 'sine', t + i * 0.08, 0.25, 0.04 - i * 0.006));
  }

  async chime(toLight) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const ns = toLight ? [392, 493.88, 587.33, 698.46] : [698.46, 587.33, 493.88, 392];
    ns.forEach((f, i) => this._v(f, 'sine', t + i * 0.06, 0.25, 0.03));
  }

  ok() { return this.enabled && this.ctx && this.master && this.ctx.state === 'running'; }

  async resume() {
    await this._boot();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }
}

export const sfx = new AudioEngine();
