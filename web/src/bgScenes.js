/*
 * Animated background scenes. Each scene is a factory returning { init(w, h), draw(c, w, h, t, dt, s) }.
 * `s` carries: pSmoothX/pSmoothY (smoothed pointer), pActive (mouse over the page),
 * energy/kick (0..1 from the music), intensity (1 = normal), bursts (taps to react to).
 */

const MAG = '#ff2d9b';
const ORA = '#ff8a2a';
const YEL = '#ffd23f';
const CYA = '#22c4ff';
const PUR = '#7b3cff';
const BG = '#0e0930';
const PALETTE = [MAG, ORA, YEL, CYA, PUR];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------- Synthwave grid ----------------
function grid() {
  let stars = [];
  let hills = [];
  let off = 0;
  let lean = 0.5;
  return {
    init(w, h) {
      const count = Math.min(170, Math.round((w * h) / 9000));
      stars = Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random() * 0.6, r: rand(0.4, 1.6), p: rand(0, 6.28) }));
      hills = Array.from({ length: 16 }, (_, i) => rand(0.02, 0.08) * (i % 3 === 0 ? 1.6 : 1));
    },
    draw(c, w, h, t, dt, s) {
      lean += (s.pSmoothX / w - lean) * 0.04;
      const vx = w * (0.5 + (lean - 0.5) * 0.35);
      const hz = h * (0.62 + (s.pSmoothY / h - 0.5) * 0.04);
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
      c.fillStyle = '#1b0a45';
      c.beginPath();
      c.moveTo(0, hz);
      const n = hills.length;
      for (let i = 0; i <= n; i += 1) {
        const x = (i / n) * w;
        c.lineTo(x, hz - hills[i % n] * h * (Math.abs(x - vx) < R * 1.1 ? 0.25 : 1));
      }
      c.lineTo(w, hz);
      c.closePath();
      c.fill();
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
      off = (off + dt * (0.12 + s.energy * 0.9) * s.intensity) % 1;
      for (let i = 0; i < 18; i += 1) {
        const z = (i + off) / 18;
        const yy = hz + (h - hz) * Math.pow(z, 2.6);
        c.strokeStyle = hexA(MAG, 0.12 + z * 0.7);
        c.lineWidth = 1 + z * 1.6;
        c.beginPath();
        c.moveTo(0, yy);
        c.lineTo(w, yy);
        c.stroke();
      }
      for (let k = -22; k <= 22; k += 1) {
        c.strokeStyle = hexA(k % 2 ? MAG : CYA, 0.5);
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(vx + k * 3, hz);
        c.lineTo(vx + k * w * 0.11, h);
        c.stroke();
      }
      if (s.pActive && s.pSmoothY > hz) {
        const spot = c.createRadialGradient(s.pSmoothX, s.pSmoothY, 0, s.pSmoothX, s.pSmoothY, 160);
        spot.addColorStop(0, hexA(CYA, 0.3));
        spot.addColorStop(1, hexA(CYA, 0));
        c.fillStyle = spot;
        c.fillRect(s.pSmoothX - 160, s.pSmoothY - 160, 320, 320);
      }
      c.restore();
      const haze = c.createLinearGradient(0, hz - 30, 0, hz + 40);
      haze.addColorStop(0, hexA(MAG, 0));
      haze.addColorStop(0.5, hexA(MAG, 0.3));
      haze.addColorStop(1, hexA(MAG, 0));
      c.fillStyle = haze;
      c.fillRect(0, hz - 30, w, 70);
    },
  };
}

// ---------------- Sound waves ----------------
function waves() {
  let amp = 0.2;
  return {
    init() {},
    draw(c, w, h, t, dt, s) {
      const bg = c.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, BG);
      bg.addColorStop(1, '#170b45');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      amp += (0.25 + s.energy * 1.1 - amp) * 0.12;
      c.globalCompositeOperation = 'lighter';
      const sig = w * 0.09;
      [MAG, ORA, YEL, CYA, PUR].forEach((col, i) => {
        const base = h * (0.32 + i * 0.09);
        const A = h * 0.05 * (1 + i * 0.25) * amp * s.intensity;
        const f = (0.006 + i * 0.0012) * (900 / Math.max(w, 400));
        const sp = 0.8 + i * 0.25;
        c.beginPath();
        for (let x = -10; x <= w + 10; x += 6) {
          const d = x - s.pSmoothX;
          const bulge = s.pActive ? Math.exp(-(d * d) / (2 * sig * sig)) * h * 0.09 * Math.sin(t * 3 + i) : 0;
          const yy = base + Math.sin(x * f + t * sp + i * 1.3) * A + Math.sin(x * f * 2.3 - t * sp * 1.4) * A * 0.35 - bulge;
          if (x === -10) c.moveTo(x, yy);
          else c.lineTo(x, yy);
        }
        c.strokeStyle = hexA(col, 0.12);
        c.lineWidth = 12;
        c.stroke();
        c.strokeStyle = hexA(col, 0.85);
        c.lineWidth = 2.2;
        c.stroke();
      });
    },
  };
}

// ---------------- Connected stars ----------------
function stars() {
  let p = [];
  let sparks = [];
  return {
    init(w, h) {
      const n = Math.min(150, Math.round((w * h) / 12000));
      p = Array.from({ length: n }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), c: pick(PALETTE), r: rand(1.2, 2.6) }));
      sparks = [];
    },
    draw(c, w, h, t, dt, s) {
      c.fillStyle = BG;
      c.fillRect(0, 0, w, h);
      const glow = c.createRadialGradient(w * 0.7, h * 0.2, 0, w * 0.7, h * 0.2, Math.max(w, h) * 0.7);
      glow.addColorStop(0, 'rgba(123,60,255,0.22)');
      glow.addColorStop(1, 'rgba(123,60,255,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);
      const speed = (0.6 + s.energy * 1.4) * s.intensity;
      for (const b of s.bursts) {
        for (let i = 0; i < 22; i += 1) {
          const a = rand(0, 6.283);
          const v = rand(60, 260);
          sparks.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: pick(PALETTE), note: i % 4 === 0 ? pick(['♪', '♫', '♬']) : null });
        }
      }
      for (const q of p) {
        if (s.pActive) {
          const dx = s.pSmoothX - q.x;
          const dy = s.pSmoothY - q.y;
          if (dx * dx + dy * dy < 200 * 200) {
            q.vx += (dx / 200) * 0.03;
            q.vy += (dy / 200) * 0.03;
          }
        }
        q.vx = q.vx * 0.985 + rand(-0.02, 0.02);
        q.vy = q.vy * 0.985 + rand(-0.02, 0.02);
        q.x += q.vx * speed * 60 * dt;
        q.y += q.vy * speed * 60 * dt;
        if (q.x < -20) q.x = w + 20;
        if (q.x > w + 20) q.x = -20;
        if (q.y < -20) q.y = h + 20;
        if (q.y > h + 20) q.y = -20;
      }
      c.globalCompositeOperation = 'lighter';
      const maxD = 120;
      for (let i = 0; i < p.length; i += 1) {
        const a = p[i];
        for (let j = i + 1; j < p.length; j += 1) {
          const b = p[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxD * maxD) {
            c.strokeStyle = hexA(a.c, (1 - Math.sqrt(d2) / maxD) * 0.45);
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(b.x, b.y);
            c.stroke();
          }
        }
        if (s.pActive) {
          const dx = a.x - s.pSmoothX;
          const dy = a.y - s.pSmoothY;
          const d2 = dx * dx + dy * dy;
          if (d2 < 170 * 170) {
            c.strokeStyle = hexA(YEL, (1 - Math.sqrt(d2) / 170) * 0.6);
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(s.pSmoothX, s.pSmoothY);
            c.stroke();
          }
        }
      }
      for (const q of p) {
        const r = q.r * (1 + s.kick * 0.6);
        c.fillStyle = hexA(q.c, 0.18);
        c.beginPath();
        c.arc(q.x, q.y, r * 3.2, 0, 6.283);
        c.fill();
        c.fillStyle = q.c;
        c.beginPath();
        c.arc(q.x, q.y, r, 0, 6.283);
        c.fill();
      }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const sp of sparks) {
        sp.life -= dt * 1.1;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= 0.96;
        sp.vy *= 0.96;
        if (sp.life <= 0) continue;
        c.globalAlpha = sp.life;
        c.fillStyle = sp.c;
        if (sp.note) {
          c.font = '700 22px Cairo, sans-serif';
          c.fillText(sp.note, sp.x, sp.y);
        } else {
          c.beginPath();
          c.arc(sp.x, sp.y, 2.2, 0, 6.283);
          c.fill();
        }
      }
      c.globalAlpha = 1;
      sparks = sparks.filter((sp) => sp.life > 0);
    },
  };
}

// ---------------- Floating notes & cassettes ----------------
function notes() {
  let items = [];
  const make = (w, h, y) => {
    const cassette = Math.random() < 0.22;
    return {
      x: rand(0, w),
      y: y ?? h + 40,
      vy: rand(14, 38),
      sway: rand(0.4, 1.2),
      ph: rand(0, 6.28),
      rot: rand(-0.6, 0.6),
      vr: rand(-0.4, 0.4),
      size: cassette ? rand(26, 40) : rand(18, 40),
      c: pick(PALETTE),
      g: cassette ? 'cassette' : pick(['♪', '♫', '♬', '♩']),
      a: rand(0.45, 0.9),
      pushX: 0,
      pushY: 0,
    };
  };
  const cassette = (c, size, col) => {
    const w = size * 1.6;
    const h = size;
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(-w / 2, -h / 2, w, h, 4);
    c.stroke();
    c.beginPath();
    c.roundRect(-w * 0.32, -h * 0.28, w * 0.64, h * 0.32, 3);
    c.stroke();
    c.beginPath();
    c.arc(-w * 0.18, -h * 0.12, h * 0.1, 0, 6.283);
    c.arc(w * 0.18, -h * 0.12, h * 0.1, 0, 6.283);
    c.fillStyle = col;
    c.fill();
  };
  const target = (w, h) => Math.round((w * h) / 26000);
  return {
    init(w, h) {
      items = Array.from({ length: target(w, h) }, () => make(w, h, rand(0, h)));
    },
    draw(c, w, h, t, dt, s) {
      const bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#120a3a');
      bg.addColorStop(1, '#1d0d4d');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      for (const b of s.bursts) {
        for (let i = 0; i < 8; i += 1) {
          const it = make(w, h, b.y);
          it.x = b.x;
          it.vy = rand(60, 140);
          it.pushX = rand(-160, 160);
          it.a = 1;
          items.push(it);
        }
      }
      const speed = (0.7 + s.energy * 1.3) * s.intensity;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const it of items) {
        if (s.pActive) {
          const dx = it.x - s.pSmoothX;
          const dy = it.y - s.pSmoothY;
          const d = Math.hypot(dx, dy);
          if (d < 130 && d > 0.1) {
            it.pushX += (dx / d) * (130 - d) * 0.8;
            it.pushY += (dy / d) * (130 - d) * 0.8;
          }
        }
        it.pushX *= 0.9;
        it.pushY *= 0.9;
        it.y -= it.vy * speed * dt;
        it.x += (Math.sin(t * it.sway + it.ph) * 12 + it.pushX) * dt;
        it.y += it.pushY * dt;
        it.rot += it.vr * dt;
        const scale = 1 + s.kick * 0.15;
        c.save();
        c.translate(it.x, it.y);
        c.rotate(it.rot + Math.sin(t + it.ph) * 0.2);
        c.scale(scale, scale);
        c.globalAlpha = it.a;
        if (it.g === 'cassette') cassette(c, it.size, it.c);
        else {
          c.fillStyle = hexA(it.c, 0.25);
          c.font = `700 ${it.size * 1.25}px Cairo, sans-serif`;
          c.fillText(it.g, 0, 0);
          c.fillStyle = it.c;
          c.font = `700 ${it.size}px Cairo, sans-serif`;
          c.fillText(it.g, 0, 0);
        }
        c.restore();
      }
      c.globalAlpha = 1;
      items = items.filter((it) => it.y > -60);
      while (items.length < target(w, h)) items.push(make(w, h));
    },
  };
}

// ---------------- Neon aurora ----------------
function aurora() {
  const blobs = [
    { c: MAG, ax: 0.32, ay: 0.3, fx: 0.07, fy: 0.05, r: 0.55 },
    { c: CYA, ax: 0.72, ay: 0.62, fx: 0.05, fy: 0.08, r: 0.5 },
    { c: ORA, ax: 0.6, ay: 0.2, fx: 0.06, fy: 0.04, r: 0.42 },
    { c: PUR, ax: 0.22, ay: 0.75, fx: 0.04, fy: 0.06, r: 0.6 },
  ];
  const f = { x: 0.5, y: 0.5 };
  return {
    init() {},
    draw(c, w, h, t, dt, s) {
      c.fillStyle = BG;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'lighter';
      const m = Math.max(w, h);
      const tt = t * s.intensity;
      blobs.forEach((b, i) => {
        const x = w * (b.ax + Math.sin(tt * b.fx * 6.28 + i) * 0.18);
        const y = h * (b.ay + Math.cos(tt * b.fy * 6.28 + i * 2) * 0.16);
        const r = m * b.r * (1 + s.kick * 0.06);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hexA(b.c, 0.33));
        g.addColorStop(1, hexA(b.c, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      });
      f.x += (s.pSmoothX / w - f.x) * 0.05;
      f.y += (s.pSmoothY / h - f.y) * 0.05;
      const g = c.createRadialGradient(f.x * w, f.y * h, 0, f.x * w, f.y * h, m * 0.28);
      g.addColorStop(0, hexA(YEL, 0.22));
      g.addColorStop(1, hexA(YEL, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
  };
}

// ---------------- Radio equalizer ----------------
function eq() {
  let n = 16;
  let hgt = [];
  let peak = [];
  let ph = [];
  let st = [];
  return {
    init(w, h) {
      n = Math.max(16, Math.floor(w / 22));
      hgt = Array.from({ length: n }, () => 0);
      peak = Array.from({ length: n }, () => 0);
      ph = Array.from({ length: n }, () => rand(0, 6.28));
      st = Array.from({ length: Math.round((w * h) / 12000) }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: rand(0.4, 1.4), p: rand(0, 6.28) }));
    },
    draw(c, w, h, t, dt, s) {
      const bg = c.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, BG);
      bg.addColorStop(0.7, '#1c0b4c');
      bg.addColorStop(1, '#3a0f5c');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      for (const q of st) {
        c.globalAlpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.5 + q.p));
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(q.x * w, q.y * h, q.r, 0, 6.283);
        c.fill();
      }
      c.globalAlpha = 1;
      const bw = w / n;
      const maxH = h * 0.42;
      const seg = 9;
      for (let i = 0; i < n; i += 1) {
        const x = i * bw;
        const wave = 0.5 + 0.5 * Math.sin(t * (1.3 + (i % 5) * 0.31) + ph[i]);
        const low = Math.max(0, 1 - Math.abs(i / n - 0.25) * 2.2);
        let target = (0.12 + wave * 0.45 * (0.35 + s.energy) + low * s.kick * 0.5) * s.intensity;
        if (s.pActive) target += Math.max(0, 1 - Math.abs(x + bw / 2 - s.pSmoothX) / (w * 0.12)) * 0.5;
        target = Math.min(1, target);
        hgt[i] += (target - hgt[i]) * (target > hgt[i] ? 0.35 : 0.08);
        peak[i] = Math.max(peak[i] - dt * 0.35, hgt[i]);
        const blocks = Math.floor((hgt[i] * maxH) / seg);
        c.globalAlpha = 0.85;
        for (let b = 0; b < blocks; b += 1) {
          const frac = (b * seg) / maxH;
          c.fillStyle = frac < 0.45 ? MAG : frac < 0.75 ? ORA : YEL;
          c.fillRect(x + 3, h - (b + 1) * seg, bw - 6, seg - 3);
        }
        c.globalAlpha = 1;
        c.fillStyle = CYA;
        c.fillRect(x + 3, h - peak[i] * maxH - 6, bw - 6, 3);
      }
      const glow = c.createLinearGradient(0, h - maxH, 0, h);
      glow.addColorStop(0, hexA(MAG, 0));
      glow.addColorStop(1, hexA(MAG, 0.18));
      c.fillStyle = glow;
      c.fillRect(0, h - maxH, w, maxH);
    },
  };
}

/** Background choices, in the order shown in Settings. */
export const SCENES = [
  { id: 'grid', name: 'شبكة السينث ويف', swatch: `linear-gradient(180deg, ${PUR}, ${MAG} 55%, ${BG} 56%)`, make: grid },
  { id: 'waves', name: 'موجات الصوت', swatch: `linear-gradient(135deg, ${MAG}, ${YEL} 50%, ${CYA})`, make: waves },
  { id: 'stars', name: 'نجوم متصلة', swatch: `radial-gradient(circle at 30% 30%, ${CYA} 0 3px, transparent 4px), radial-gradient(circle at 70% 60%, ${MAG} 0 3px, transparent 4px), ${BG}`, make: stars },
  { id: 'notes', name: 'نوتات وكاسيتات', swatch: `linear-gradient(135deg, #2a1470, ${PUR})`, make: notes },
  { id: 'aurora', name: 'شفق النيون', swatch: `radial-gradient(circle at 30% 40%, ${MAG}, transparent 60%), radial-gradient(circle at 75% 70%, ${CYA}, transparent 60%), ${BG}`, make: aurora },
  { id: 'eq', name: 'إكوالايزر الراديو', swatch: `linear-gradient(0deg, ${MAG} 0 30%, ${ORA} 30% 55%, ${YEL} 55% 70%, ${BG} 70%)`, make: eq },
];
