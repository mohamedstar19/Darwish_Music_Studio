import { useEffect, useRef, useState } from 'react';
import { createAudioMeter } from '../audioMeter.js';
import { usePlayer } from '../state/PlayerContext.jsx';

/*
 * Synthwave grid background: striped neon sunset, stars, hills and a glowing grid
 * floor rushing toward you. It leans with the pointer, and the grid speed and sun
 * glow follow the song that's playing.
 *
 * Shown only in the dark theme and when the listener hasn't turned it off.
 * Pauses when the tab is hidden or the full player covers it; 30fps on phones;
 * a single still frame for people who prefer reduced motion.
 */

const MAG = '#ff2d9b';
const ORA = '#ff8a2a';
const YEL = '#ffd23f';
const CYA = '#22c4ff';
const BG = '#0e0930';
export const BG_SETTING_KEY = 'dms.bgAnim';
export const BG_SETTING_EVENT = 'dms:bg-setting';

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function backgroundEnabled() {
  try {
    return localStorage.getItem(BG_SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

function isDarkTheme() {
  const t = document.documentElement.dataset.theme;
  return !t || t === 'dark';
}

function useBackgroundActive() {
  const [active, setActive] = useState(() => isDarkTheme() && backgroundEnabled());
  useEffect(() => {
    const update = () => setActive(isDarkTheme() && backgroundEnabled());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener(BG_SETTING_EVENT, update);
    return () => {
      mo.disconnect();
      window.removeEventListener(BG_SETTING_EVENT, update);
    };
  }, []);
  return active;
}

function createScene() {
  let stars = [];
  let hills = [];
  let off = 0;
  let lean = 0.5;
  return {
    init(w, h) {
      const count = Math.min(170, Math.round((w * h) / 9000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random() * 0.6,
        r: 0.4 + Math.random() * 1.2,
        p: Math.random() * 6.28,
      }));
      hills = Array.from({ length: 16 }, (_, i) => (0.02 + Math.random() * 0.06) * (i % 3 === 0 ? 1.6 : 1));
    },
    draw(c, w, h, t, dt, s) {
      lean += (s.px / w - lean) * 0.04;
      const vx = w * (0.5 + (lean - 0.5) * 0.35);
      const hz = h * (0.62 + (s.py / h - 0.5) * 0.04);

      const sky = c.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, BG);
      sky.addColorStop(0.55, '#22105a');
      sky.addColorStop(1, '#55146c');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, hz);

      for (const st of stars) {
        c.globalAlpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.6 + st.p));
        c.fillStyle = st.r > 1.25 ? YEL : '#ffffff';
        c.beginPath();
        c.arc(st.x * w, st.y * h, st.r, 0, 6.283);
        c.fill();
      }
      c.globalAlpha = 1;

      // Striped sun
      const R = Math.min(w, h) * 0.19 * (1 + s.kick * 0.05);
      const sx = vx;
      const sy = hz - R * 0.35;
      const glow = c.createRadialGradient(sx, sy, R * 0.6, sx, sy, R * 2.4);
      glow.addColorStop(0, hexA(MAG, 0.35 + s.energy * 0.3));
      glow.addColorStop(1, hexA(MAG, 0));
      c.fillStyle = glow;
      c.fillRect(sx - R * 2.5, sy - R * 2.5, R * 5, R * 5);
      c.save();
      c.beginPath();
      c.rect(sx - R, sy - R, R * 2, R * 1.05);
      let y = sy + R * 0.05;
      let gap = R * 0.035;
      let band = R * 0.13;
      while (y < sy + R) {
        c.rect(sx - R, y + gap, R * 2, band);
        y += gap + band;
        gap *= 1.35;
        band *= 0.85;
      }
      c.clip();
      const sun = c.createLinearGradient(0, sy - R, 0, sy + R);
      sun.addColorStop(0, YEL);
      sun.addColorStop(0.5, ORA);
      sun.addColorStop(1, MAG);
      c.fillStyle = sun;
      c.beginPath();
      c.arc(sx, sy, R, 0, 6.283);
      c.fill();
      c.restore();

      // Hills
      c.fillStyle = '#1b0a45';
      c.beginPath();
      c.moveTo(0, hz);
      const n = hills.length;
      for (let i = 0; i <= n; i += 1) {
        const x = (i / n) * w;
        const hh = hills[i % n] * h * (Math.abs(x - vx) < R * 1.1 ? 0.25 : 1);
        c.lineTo(x, hz - hh);
      }
      c.lineTo(w, hz);
      c.closePath();
      c.fill();

      // Grid floor
      const floor = c.createLinearGradient(0, hz, 0, h);
      floor.addColorStop(0, '#2a0b52');
      floor.addColorStop(1, '#0b0726');
      c.fillStyle = floor;
      c.fillRect(0, hz, w, h - hz);
      c.save();
      c.beginPath();
      c.rect(0, hz, w, h - hz);
      c.clip();
      c.globalCompositeOperation = 'lighter';
      off = (off + dt * (0.12 + s.energy * 0.9)) % 1;
      const rows = 18;
      for (let i = 0; i < rows; i += 1) {
        const z = (i + off) / rows;
        const yy = hz + (h - hz) * Math.pow(z, 2.6);
        c.strokeStyle = hexA(MAG, 0.12 + z * 0.7);
        c.lineWidth = 1 + z * 1.6;
        c.beginPath();
        c.moveTo(0, yy);
        c.lineTo(w, yy);
        c.stroke();
      }
      const cols = 22;
      for (let k = -cols; k <= cols; k += 1) {
        c.strokeStyle = hexA(k % 2 ? MAG : CYA, 0.5);
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(vx + k * 3, hz);
        c.lineTo(vx + k * w * 0.11, h);
        c.stroke();
      }
      if (s.pointer && s.py > hz) {
        const spot = c.createRadialGradient(s.px, s.py, 0, s.px, s.py, 160);
        spot.addColorStop(0, hexA(CYA, 0.3));
        spot.addColorStop(1, hexA(CYA, 0));
        c.fillStyle = spot;
        c.fillRect(s.px - 160, s.py - 160, 320, 320);
      }
      c.restore();

      const haze = c.createLinearGradient(0, hz - 30, 0, hz + 40);
      haze.addColorStop(0, hexA(MAG, 0));
      haze.addColorStop(0.5, hexA(MAG, 0.3));
      haze.addColorStop(1, hexA(MAG, 0));
      c.fillStyle = haze;
      c.fillRect(0, hz - 30, w, 70);

      // Light scrim keeps text on top easy to read.
      c.fillStyle = 'rgba(14, 9, 48, 0.22)';
      c.fillRect(0, 0, w, h);
    },
  };
}

export default function SynthBackground() {
  const active = useBackgroundActive();
  const player = usePlayer();
  const canvasRef = useRef(null);
  const playingRef = useRef(false);
  playingRef.current = player.isPlaying;
  const audio = player.audio;

  useEffect(() => {
    document.documentElement.classList.toggle('synth-bg', active);
    return () => document.documentElement.classList.remove('synth-bg');
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    const c = canvas.getContext('2d');
    const scene = createScene();
    const meter = createAudioMeter(audio);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    // Phones: 24fps, and no drawing while the page is being scrolled.
    const minFrameMs = coarse ? 1000 / 24 : 0;
    let scrollingUntil = 0;
    const onScroll = () => {
      scrollingUntil = performance.now() + 220;
    };
    const s = { px: 0, py: 0, tx: 0, ty: 0, pointer: false, energy: 0.06, kick: 0 };
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let frameNo = 0;
    let covered = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!s.pointer) {
        s.tx = w * 0.5;
        s.ty = h * 0.5;
        s.px = s.tx;
        s.py = s.ty;
      }
      scene.init(w, h);
      if (reduce) drawOnce();
    };

    const drawOnce = () => {
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      scene.draw(c, w, h, performance.now() / 1000, 0, s);
    };

    const onMove = (e) => {
      s.tx = e.clientX;
      s.ty = e.clientY;
      s.pointer = e.pointerType === 'mouse';
    };
    const onLeave = () => {
      s.pointer = false;
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      frameNo += 1;
      if (frameNo % 30 === 0) covered = !!document.querySelector('.full-player, .car-mode');
      if (covered) return;
      if (coarse && now < scrollingUntil) return;
      if (now - lastDraw < minFrameMs) return;
      lastDraw = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const lv = meter.sample(t, playingRef.current);
      s.energy += (lv.energy - s.energy) * 0.25;
      s.kick += (lv.kick - s.kick) * 0.5;
      s.px += (s.tx - s.px) * 0.08;
      s.py += (s.ty - s.py) * 0.08;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      scene.draw(c, w, h, t, dt, s);
    };

    resize();
    window.addEventListener('resize', resize);
    if (!reduce) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      document.addEventListener('mouseleave', onLeave);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('mouseleave', onLeave);
      meter.destroy();
    };
  }, [active, audio]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="synth-canvas" aria-hidden="true" />;
}
