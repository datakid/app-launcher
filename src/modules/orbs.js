import { MQ, Motion, Spring } from './motion.js';
import { ORB_SAT, hueFromHex, isLightTheme, paletteMode } from './theme.js';

class OrbField {
  constructor(canvas) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.t = 0;
    this.orbs = [];
    this.idleScale = 1;
    this.frameCount = 0;
    this.bloomStart = performance.now();
    this.lastActive = performance.now();
    this.resize();
    this.spawn();

    if (!MQ.reducedMotion) {
      Motion.add(this);
    } else {
      this.bloomStart = 0;
      this.render();
    }
  }

  resize() {
    const oldW = this.cv.width, oldH = this.cv.height;
    const scale = 0.35;
    const dpr = 1;
    this.cv.width = Math.round(window.innerWidth * scale * dpr);
    this.cv.height = Math.round(window.innerHeight * scale * dpr);
    this.cv.style.width = '100%';
    this.cv.style.height = '100%';
    if (oldW && oldH && this.orbs.length) {
      const rx = this.cv.width / oldW, ry = this.cv.height / oldH;
      this.orbs.forEach(o => {
        o.ax *= rx; o.ay *= ry;
        o.orbitR *= (rx + ry) / 2;
      });
    }
    this.lastActive = performance.now();
    Motion.wake();
  }

  spawn() {
    const n = window.innerWidth < 768 ? 4 : 6;
    const palette = isLightTheme ? [205, 225, 195] : [222, 258, 195];
    const minSide = Math.min(this.cv.width, this.cv.height);
    this.orbs = Array.from({ length: n }, (_, i) => {
      const hue = palette[i % 3];
      const ang = i * 2.399;
      const rad = 0.34 * minSide * Math.sqrt(i / n);
      const ax = this.cv.width / 2 + Math.cos(ang) * rad;
      const ay = this.cv.height / 2 + Math.sin(ang) * rad;
      return {
        ax, ay,
        x: ax, y: ay,
        orbitR: minSide * (0.06 + Math.random() * 0.03),
        orbitSpeed: 0.15 + Math.random() * 0.1,
        r: Math.random() * 160 + 120,
        hue,
        hueSpring: new Spring(40, 14, hue),
        phase: Math.random() * Math.PI * 2
      };
    });
  }

  retarget() {
    const palette = isLightTheme ? [205, 225, 195] : [222, 258, 195];
    const reduced = MQ.reducedMotion;
    this.orbs.forEach((o, i) => {
      o.hueSpring.to = palette[i % 3];
      if (reduced) { o.hueSpring.snap(); o.hue = o.hueSpring.v; }
    });
    this.lastActive = performance.now();
    if (reduced) this.render(performance.now() / 1000);
    else Motion.wake();
  }

  retargetCategory(hex, impulseDir = 0) {
    const hue = hueFromHex(hex);
    this.hotUntil = performance.now() + 1400;
    const reduced = MQ.reducedMotion;
    this.orbs.forEach((o, i) => {
      o.hueSpring.to = (hue + (i - (this.orbs.length - 1) / 2) * 22 + 360) % 360;
      if (reduced) { o.hueSpring.snap(); o.hue = o.hueSpring.v; }
      else if (impulseDir) o.hueSpring.dv += impulseDir * (i % 2 ? 26 : -26);
    });
    this.lastActive = performance.now();
    if (reduced) this.render(performance.now() / 1000);
    else Motion.wake();
  }

  fixed(dt) {
    const idleFor = performance.now() - this.lastActive;
    const idleTarget = idleFor > 20000 ? 0 : 1;
    this.idleScale += (idleTarget - this.idleScale) * Math.min(dt * 1.5, 1);
    if (this.idleScale < 0.0005) this.idleScale = 0;
    const scaledDt = dt * this.idleScale;
    this.t += scaledDt * 0.06;
    this.orbs.forEach(o => {
      o.hueSpring.fixed(scaledDt);
      o.hue = o.hueSpring.v;
      const ang = this.t * o.orbitSpeed + o.phase;
      o.x = o.ax + Math.cos(ang) * o.orbitR;
      o.y = o.ay + Math.sin(ang) * o.orbitR;
    });
  }

  render(now) {
    if (document.hidden) return true;

    const idleFor = performance.now() - this.lastActive;
    if (idleFor > 20000 && this.idleScale === 0) return false;

    const minInterval = performance.now() < (this.hotUntil || 0) ? 1 / 60 : (idleFor > 20000 ? 1 / 12 : 1 / 30);
    if (this._lastDraw && now - this._lastDraw < minInterval) return true;
    this._lastDraw = now;

    this.cx.clearRect(0, 0, this.cv.width, this.cv.height);
    this.cx.globalCompositeOperation = isLightTheme ? 'multiply' : 'screen';
    const bloom = Math.max(0, 1 - (performance.now() - this.bloomStart) / 7000) * 0.15;
    const sat = ORB_SAT[paletteMode()] ?? 1;
    const s1 = Math.round(52 * sat), s2 = Math.round(44 * sat);

    this.orbs.forEach(o => {
      const rr = o.r * (1 + bloom) * 1.25;
      const g = this.cx.createRadialGradient(o.x, o.y, 0, o.x, o.y, rr);
      const a = (isLightTheme ? 0.07 : 0.1) * (1 + bloom);
      g.addColorStop(0, `hsla(${o.hue}, ${s1}%, ${isLightTheme ? 62 : 38}%, ${a})`);
      g.addColorStop(0.3, `hsla(${o.hue}, ${s2}%, ${isLightTheme ? 72 : 28}%, ${a * 0.4})`);
      g.addColorStop(0.65, `hsla(${o.hue}, ${s2}%, ${isLightTheme ? 72 : 28}%, ${a * 0.12})`);
      g.addColorStop(1, 'transparent');

      this.cx.fillStyle = g;
      this.cx.beginPath();
      this.cx.arc(o.x, o.y, rr, 0, Math.PI * 2);
      this.cx.fill();
    });

    return true;
  }
}

export const initOrbs = () => {
  const canvas = document.getElementById('gradient-canvas');
  window.bgAnim = new OrbField(canvas);
};
