import { useEffect, useRef, useState } from 'react';
import { createAudioMeter } from '../audioMeter.js';
import { SCENES } from '../bgScenes.js';
import { usePlayer } from '../state/PlayerContext.jsx';

/*
 * Animated site background (dark theme): one of six scenes the listener picks in
 * Settings, reacting to the pointer, taps and the song that's playing.
 * Pauses when the tab is hidden or the full player covers it; on phones it runs
 * at 24fps, at 1x resolution and pauses while scrolling; one still frame for
 * reduced motion.
 */

export const BG_SETTING_KEY = 'dms.bgScene';
export const BG_SETTING_EVENT = 'dms:bg-setting';
const OLD_KEY = 'dms.bgAnim'; // earlier on/off switch

export function getBackgroundScene() {
  try {
    const v = localStorage.getItem(BG_SETTING_KEY);
    if (v === 'none' || SCENES.some((s) => s.id === v)) return v;
    if (localStorage.getItem(OLD_KEY) === 'off') return 'none';
  } catch {
    // storage blocked
  }
  return 'grid';
}

export function setBackgroundScene(id) {
  try {
    localStorage.setItem(BG_SETTING_KEY, id);
  } catch {
    // storage blocked: still applies for this visit
  }
  window.__dmsBgScene = id;
  window.dispatchEvent(new Event(BG_SETTING_EVENT));
}

export function backgroundEnabled() {
  return getBackgroundScene() !== 'none';
}

function currentScene() {
  return window.__dmsBgScene || getBackgroundScene();
}

function isDarkTheme() {
  const t = document.documentElement.dataset.theme;
  return !t || t === 'dark';
}

function useActiveScene() {
  const read = () => (isDarkTheme() ? currentScene() : 'none');
  const [scene, setScene] = useState(read);
  useEffect(() => {
    const update = () => setScene(read());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener(BG_SETTING_EVENT, update);
    return () => {
      mo.disconnect();
      window.removeEventListener(BG_SETTING_EVENT, update);
    };
  }, []);
  return scene;
}

export default function SynthBackground() {
  const sceneId = useActiveScene();
  const active = sceneId !== 'none';
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
    const def = SCENES.find((x) => x.id === sceneId) || SCENES[0];
    const canvas = canvasRef.current;
    const c = canvas.getContext('2d');
    const scene = def.make();
    const meter = createAudioMeter(audio);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    // Phones: 24fps, and no drawing while the page is being scrolled.
    const minFrameMs = coarse ? 1000 / 24 : 0;
    let scrollingUntil = 0;
    const s = {
      pSmoothX: 0,
      pSmoothY: 0,
      tx: 0,
      ty: 0,
      pActive: false,
      energy: 0.06,
      kick: 0,
      intensity: 1,
      bursts: [],
    };
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let frameNo = 0;
    let covered = false;

    const drawFrame = (t, dt) => {
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      scene.draw(c, w, h, t, dt, s);
      s.bursts.length = 0;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      // Light scrim keeps text on top easy to read.
      c.fillStyle = 'rgba(14, 9, 48, 0.22)';
      c.fillRect(0, 0, w, h);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!s.pActive) {
        s.tx = w * 0.5;
        s.ty = h * 0.5;
        s.pSmoothX = s.tx;
        s.pSmoothY = s.ty;
      }
      scene.init(w, h);
      if (reduce) drawFrame(performance.now() / 1000, 0);
    };

    const onMove = (e) => {
      s.tx = e.clientX;
      s.ty = e.clientY;
      s.pActive = e.pointerType === 'mouse';
    };
    const onDown = (e) => {
      // Taps on buttons and links are for the UI, not the background.
      if (e.target instanceof Element && e.target.closest('button, a, input, textarea, select, label, [role="button"]')) return;
      s.bursts.push({ x: e.clientX, y: e.clientY });
    };
    const onLeave = () => {
      s.pActive = false;
    };
    const onScroll = () => {
      scrollingUntil = performance.now() + 220;
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
      s.pSmoothX += (s.tx - s.pSmoothX) * 0.08;
      s.pSmoothY += (s.ty - s.pSmoothY) * 0.08;
      drawFrame(t, dt);
    };

    // On phones the address bar hiding/showing while scrolling fires resize; ignore those.
    const onResize = () => {
      if (coarse && w && Math.abs(window.innerWidth - w) < 2 && Math.abs(window.innerHeight - h) < 160) return;
      resize();
    };

    resize();
    window.addEventListener('resize', onResize);
    if (!reduce) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
      document.addEventListener('mouseleave', onLeave);
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('scroll', onScroll, { capture: true });
      meter.destroy();
    };
  }, [active, sceneId, audio]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="synth-canvas" aria-hidden="true" />;
}
