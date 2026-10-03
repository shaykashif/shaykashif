// A desert night sketched in ink for the homepage: a star field, a crescent
// moon the quote flows around, and dunes made of text that the wind pushes along.
// Text layout (line fitting around the moon and inside the dunes) is done with
// pretext, so nothing here touches the DOM to measure text.
import { prepareWithSegments, layoutNextLine } from '/vendor/pretext.js';

const TAU = Math.PI * 2;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

function sizeCanvas(cv, w, h) {
  const k = dpr();
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  const ctx = cv.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return ctx;
}

// Eight-pointed star made of two overlapping squares, added to the current path.
function octagram(c, x, y, s, rot = 0) {
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 4; i++) {
      const a = rot + (k * Math.PI) / 4 + (i * Math.PI) / 2;
      const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  }
}

// ── Wind ─────────────────────────────────────────────────────────────────
// A slow, breathing breeze blowing left to right, plus gusts from the pointer.
const wind = { base: 1, gust: 0, value: 1 };
function updateWind(t, dt) {
  wind.gust *= Math.exp(-dt * 0.9);
  wind.value = wind.base * (1 + 0.45 * Math.sin(t * 0.11) + 0.25 * Math.sin(t * 0.37 + 1.3)) + wind.gust;
}

// ── Sky ──────────────────────────────────────────────────────────────────
// Drawn like a pen sketch on a scroll: stippled stars, a few eight-rayed
// stars, and now and then the quick stroke of a shooting star.
const PAPER = '#f6f2e6';
const ink = a => `rgba(28,27,23,${a})`;

function makeSky() {
  const cv = document.createElement('canvas');
  cv.id = 'sky';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const bg = document.createElement('canvas');
  let ctx, w = 0, h = 0, stars = [], bright = [], ornaments = [], meteors = [], nextMeteor = rand(6, 12);

  function seed() {
    const area = innerWidth * innerHeight;
    const n = clamp(Math.round(area / 2800), 130, 640);
    for (let i = 0; i < n; i++) {
      let x = Math.random(), y;
      if (Math.random() < 0.38) {
        // Milky Way: a loose diagonal band rising to the right
        y = 0.95 - x * 0.8 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.13;
        if (y < 0 || y > 1) y = Math.random();
      } else {
        y = Math.pow(Math.random(), 1.25);
      }
      stars.push({
        x, y,
        r: Math.random() < 0.85 ? rand(0.4, 0.75) : rand(0.75, 1.15),
        a: rand(0.18, 0.45),
        sp: rand(0.3, 1.6),
        ph: rand(0, TAU),
        d: rand(0.2, 1),
      });
    }
    const nb = clamp(Math.round(area / 50000), 8, 22);
    for (let i = 0; i < nb; i++) {
      bright.push({ x: Math.random(), y: Math.pow(Math.random(), 1.2) * 0.85, s: rand(3, 5.5), rot: rand(-0.25, 0.25), a: rand(0.3, 0.5), ph: rand(0, TAU), sp: rand(0.3, 0.8), d: rand(0.2, 1) });
    }
    const no = clamp(Math.round(innerWidth / 380), 2, 5);
    for (let i = 0; i < no; i++) {
      ornaments.push({ x: i % 2 ? rand(0.82, 0.95) : rand(0.05, 0.18), y: rand(0.06, 0.9), s: rand(5, 8), rot: rand(0, TAU), vr: rand(-0.06, 0.06), a: rand(0.3, 0.45), d: rand(0.2, 1) });
    }
  }

  function paintBackdrop() {
    const c = sizeCanvas(bg, w, h);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);
    // Edges a shade warmer, like the margins of an old scroll
    const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(140,110,60,0)');
    v.addColorStop(1, 'rgba(140,110,60,0.08)');
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
    // Paper grain
    c.fillStyle = 'rgb(120,100,70)';
    for (let i = 0, n = (w * h) / 110; i < n; i++) {
      c.globalAlpha = rand(0.015, 0.05);
      c.fillRect(rand(0, w), rand(0, h), rand(0.5, 1.4), rand(0.5, 1.4));
    }
    c.globalAlpha = 1;
  }

  function resize() {
    w = cv.clientWidth;
    h = cv.clientHeight;
    if (!w || !h) return;
    ctx = sizeCanvas(cv, w, h);
    paintBackdrop();
  }

  // Eight rays drawn as four pen strokes: long cardinals, short diagonals
  function rayStar(x, y, s, rot, a) {
    ctx.strokeStyle = ink(a);
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = rot + (i * Math.PI) / 4, r = i % 2 ? s * 0.5 : s;
      const dx = Math.cos(ang) * r, dy = Math.sin(ang) * r;
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
    }
    ctx.stroke();
  }

  // Keep the sky clear behind the writing: page-space boxes around each
  // block of text, re-measured whenever the layout changes.
  const TEXT_BLOCKS = '.head, .quote, .bio p, h2.label, .list li, .credit p, .photos';
  let blocks = [], onScreen = [], sand = null;
  function measureBlocks() {
    blocks = [...document.querySelectorAll(TEXT_BLOCKS)].map(el => {
      const r = el.getBoundingClientRect();
      return [r.left - 10, r.top + scrollY - 8, r.right + 10, r.bottom + scrollY + 8];
    });
  }
  function behindText(x, y, m) {
    for (const b of onScreen) {
      if (x > b[0] - m && x < b[2] + m && y > b[1] - m && y < b[3] + m) return true;
    }
    if (!sand) return false;
    const i = Math.round((x - sand.left) / sand.step);
    return i >= 0 && i < sand.top.length && y + m > sand.y + sand.top[i];
  }

  function draw(t, dt) {
    if (!w || !h) { resize(); if (!w || !h) return; }
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0, w, h);
    const sy = still ? 0 : scrollY;
    onScreen = blocks
      .filter(b => b[3] > scrollY && b[1] < scrollY + h)
      .map(b => [b[0], b[1] - scrollY, b[2], b[3] - scrollY]);
    const moonEl = document.querySelector('.quote .moon');
    if (moonEl) {
      const r = moonEl.getBoundingClientRect();
      onScreen.push([r.left, r.top, r.right, r.bottom]);
    }
    sand = dunes ? dunes.outline() : null;
    ctx.fillStyle = ink(1);
    for (const s of stars) {
      let y = (s.y * h - sy * 0.04 * s.d) % h;
      if (y < 0) y += h;
      if (behindText(s.x * w, y, s.r)) continue;
      ctx.globalAlpha = s.a * (still ? 1 : 0.75 + 0.25 * Math.sin(t * s.sp + s.ph));
      ctx.beginPath();
      ctx.arc(s.x * w, y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const b of bright) {
      let y = (b.y * h - sy * 0.04 * b.d) % h;
      if (y < 0) y += h;
      if (behindText(b.x * w, y, b.s)) continue;
      rayStar(b.x * w, y, b.s, b.rot, b.a * (still ? 1 : 0.8 + 0.2 * Math.sin(t * b.sp + b.ph)));
    }
    // Ornamental eight-pointed stars, turning very slowly
    ctx.lineWidth = 0.7;
    ctx.lineJoin = 'round';
    for (const o of ornaments) {
      let y = (o.y * h - sy * 0.04 * o.d) % h;
      if (y < 0) y += h;
      const x = o.x * w;
      if (behindText(x, y, o.s)) continue;
      ctx.strokeStyle = ink(o.a);
      ctx.beginPath();
      octagram(ctx, x, y, o.s, o.rot + (still ? 0 : t * o.vr));
      ctx.moveTo(x + o.s * 0.32, y);
      ctx.arc(x, y, o.s * 0.32, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = ink(o.a);
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, TAU);
      ctx.fill();
    }
    if (still) return;

    nextMeteor -= dt;
    if (nextMeteor <= 0) {
      nextMeteor = rand(10, 22);
      const dir = Math.random() < 0.5 ? -1 : 1, sp = rand(600, 850), ang = rand(0.35, 0.6);
      meteors.push({ x: rand(0.15, 0.85) * w, y: rand(0.02, 0.3) * h, vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, life: 0, max: rand(0.6, 0.9) });
    }
    meteors = meteors.filter(m => (m.life += dt) < m.max);
    for (const m of meteors) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const a = Math.sin((m.life / m.max) * Math.PI);
      const tx = m.x - m.vx * 0.12, ty = m.y - m.vy * 0.12;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, ink(0.5 * a));
      g.addColorStop(1, ink(0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }

  seed();
  resize();
  measureBlocks();
  addEventListener('resize', resize);
  new ResizeObserver(measureBlocks).observe(document.querySelector('main') || document.body);
  return { draw, resize, measureBlocks };
}

// ── Moon + quote ─────────────────────────────────────────────────────────
// The quote is re-laid out line by line around the lit part of a crescent.
// Lines run into the crescent's hollow, and the moon can be dragged around.
function makeMoonQuote(p) {
  const text = p.textContent.replace(/\s+/g, ' ').trim();
  const cs = getComputedStyle(p);
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} "Schibsted Grotesk"`;
  const lh = parseFloat(cs.lineHeight);
  const prepared = prepareWithSegments(text, font);

  p.textContent = '';
  p.classList.add('flow');
  const moonCv = document.createElement('canvas');
  moonCv.className = 'moon';
  moonCv.title = 'Drag the moon';
  moonCv.setAttribute('aria-hidden', 'true');
  p.append(moonCv);
  const spans = [];

  // The shadow circle sits up and to the left, so the lit limb faces the
  // horizon and the horns point up, the way a young moon hangs in the east.
  const SHADOW_ANGLE = -2.2;
  const LIT_ANGLE = SHADOW_ANGLE + Math.PI;
  const RING_SPAN = 1.75, RING_IN = 1.14, RING_OUT = 1.32;
  const art = document.createElement('canvas');
  let ringRot = 0, moonSeen = true;
  let W = 0, R = 0, Ri = 0, off = { x: 0, y: 0 }, home = { x: 0, y: 0 }, H0 = 0, S = 0;
  const moon = { x: 0, y: 0, vx: 0, vy: 0, opacity: 1 };
  let mode = 'rest', rise = null, drag = null, lastKey = '';

  function lit(y, out) {
    const dy = y - moon.y;
    if (Math.abs(dy) >= R) return;
    const hw = Math.sqrt(R * R - dy * dy);
    const oa = moon.x - hw, ob = moon.x + hw;
    const idy = y - (moon.y + off.y);
    if (Math.abs(idy) >= Ri) { out.push([oa, ob]); return; }
    const ihw = Math.sqrt(Ri * Ri - idy * idy);
    const ia = moon.x + off.x - ihw, ib = moon.x + off.x + ihw;
    if (ia > oa) out.push([oa, Math.min(ob, ia)]);
    if (ib < ob) out.push([Math.max(oa, ib), ob]);
  }

  // The ring around the lit side, treated as a solid sector cut off by the
  // chord between its two ends.
  function ring(y, out) {
    const Rr = R * (RING_OUT + 0.06), dy = y - moon.y;
    if (Math.abs(dy) >= Rr) return;
    const hw = Math.sqrt(Rr * Rr - dy * dy);
    let a = moon.x - hw, b = moon.x + hw;
    const lx = Math.cos(LIT_ANGLE), ly = Math.sin(LIT_ANGLE);
    const k = Math.cos(RING_SPAN) * Rr - dy * ly;
    if (Math.abs(lx) > 1e-3) {
      const xb = moon.x + k / lx;
      if (lx > 0) a = Math.max(a, xb); else b = Math.min(b, xb);
    } else if (k > 0) return;
    if (b > a) out.push([a, b]);
  }

  function freeIntervals(y0, y1, withMoon) {
    if (!withMoon) return [[0, W]];
    const padX = R * 0.22, padY = 3, blocked = [];
    const ys = [y0 - padY, (y0 + y1) / 2, y1 + padY];
    if (moon.y > y0 && moon.y < y1) ys.push(moon.y);
    if (moon.y + off.y > y0 && moon.y + off.y < y1) ys.push(moon.y + off.y);
    for (const y of ys) { lit(y, blocked); ring(y, blocked); }
    blocked.sort((a, b) => a[0] - b[0]);
    const free = [];
    let x = 0;
    for (const [a, b] of blocked) {
      if (a - padX > x) free.push([x, a - padX]);
      x = Math.max(x, b + padX);
    }
    if (x < W) free.push([x, W]);
    return free.filter(([a, b]) => b - a >= 40);
  }

  function flow(withMoon = true) {
    const items = [];
    let cursor = { segmentIndex: 0, graphemeIndex: 0 }, done = false, rows = 0;
    for (let row = 0; row < 80 && !done; row++) {
      const y = row * lh;
      for (const [a, b] of freeIntervals(y, y + lh, withMoon)) {
        const line = layoutNextLine(prepared, cursor, b - a);
        if (!line) { done = true; break; }
        // Too narrow for the next whole word: leave this gap empty.
        if (line.end.graphemeIndex > 0) continue;
        items.push({ t: line.text, x: a, y });
        cursor = line.end;
        rows = row + 1;
      }
    }
    return { items, height: rows * lh };
  }

  function render() {
    const { items, height } = flow();
    const key = items.map(i => i.t + i.x.toFixed(0) + ',' + i.y).join('|');
    if (key !== lastKey) {
      lastKey = key;
      items.forEach((it, i) => {
        let s = spans[i];
        if (!s) { s = spans[i] = document.createElement('span'); s.className = 'ln'; p.append(s); }
        const t = /\s$/.test(it.t) || i === items.length - 1 ? it.t : it.t + ' ';
        if (s.textContent !== t) s.textContent = t;
        s.style.transform = `translate(${it.x.toFixed(1)}px,${it.y}px)`;
      });
      while (spans.length > items.length) spans.pop().remove();
      p.style.height = height + 'px';
    }
    moonCv.style.transform = `translate(${(moon.x - S / 2).toFixed(1)}px,${(moon.y - S / 2).toFixed(1)}px)`;
    moonCv.style.opacity = moon.opacity.toFixed(3);
  }

  // The moon is etched like an astrolabe plate: contour lines and stippling
  // shade the crescent, a lattice of eight-pointed stars fills the shadow,
  // and a ring of graduation ticks turns slowly around the lit limb.
  function paintMoon() {
    S = Math.ceil(R * 2.8 + 8);
    moonCv.style.width = moonCv.style.height = S + 'px';
    sizeCanvas(moonCv, S, S);
    const c = sizeCanvas(art, S, S);
    const cx = S / 2, cy = S / 2, ix = cx + off.x, iy = cy + off.y;
    const j = () => rand(-0.45, 0.45);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // Paper disc, so the stars behind don't show through
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.fillStyle = PAPER;
    c.fill();

    // Shadowed part: a girih-style lattice of touching eight-pointed stars
    c.save();
    c.clip();
    c.beginPath();
    c.arc(ix, iy, Ri, 0, TAU);
    c.clip();
    const T = R * 0.34;
    c.strokeStyle = ink(0.2);
    c.lineWidth = 0.6;
    c.beginPath();
    for (let gx = cx - R - T; gx <= cx + R + T; gx += T) {
      for (let gy = cy - R - T; gy <= cy + R + T; gy += T) octagram(c, gx, gy, T * 0.5);
    }
    c.stroke();
    c.fillStyle = ink(0.25);
    for (let gx = cx - R - T / 2; gx <= cx + R + T; gx += T) {
      for (let gy = cy - R - T / 2; gy <= cy + R + T; gy += T) {
        c.beginPath();
        c.arc(gx, gy, 0.55, 0, TAU);
        c.fill();
      }
    }
    c.restore();

    // Lit crescent: nested contour arcs that gather toward the terminator,
    // with stippling along the shadow edge
    c.save();
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.clip();
    c.beginPath();
    c.rect(0, 0, S, S);
    c.moveTo(ix + Ri, iy);
    c.arc(ix, iy, Ri, 0, TAU);
    c.clip('evenodd');
    c.lineWidth = 0.55;
    for (let k = 1; k <= 7; k++) {
      const u = Math.pow(k / 8, 0.8);
      c.strokeStyle = ink(0.06 + 0.3 * u);
      c.beginPath();
      c.arc(cx + off.x * u, cy + off.y * u, R + (Ri - R) * u, 0, TAU);
      c.stroke();
    }
    c.fillStyle = ink(0.35);
    for (let i = 0; i < R * 7; i++) {
      const a = rand(0, TAU), d = Ri + Math.pow(Math.random(), 2.2) * R * 0.22;
      c.beginPath();
      c.arc(ix + Math.cos(a) * d, iy + Math.sin(a) * d, rand(0.3, 0.6), 0, TAU);
      c.fill();
    }
    c.restore();

    // Faint dotted edge of the dark limb
    c.setLineDash([1.2, 3]);
    c.strokeStyle = ink(0.3);
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.stroke();
    c.setLineDash([]);

    // The crescent's outline, in two loose passes of the pen
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = ink(pass ? 0.4 : 0.8);
      c.lineWidth = pass ? 0.7 : 1.2;
      c.save();
      c.beginPath();
      c.rect(0, 0, S, S);
      c.moveTo(ix + Ri, iy);
      c.arc(ix, iy, Ri, 0, TAU);
      c.clip('evenodd');
      c.beginPath();
      c.arc(cx + j(), cy + j(), R + j() * 0.6, 0, TAU);
      c.stroke();
      c.restore();
      c.save();
      c.beginPath();
      c.arc(cx, cy, R + 0.8, 0, TAU);
      c.clip();
      c.beginPath();
      c.arc(ix + j(), iy + j(), Ri + j() * 0.6, 0, TAU);
      c.stroke();
      c.restore();
    }
    drawMoon();
  }

  function drawMoon() {
    const c = moonCv.getContext('2d');
    c.clearRect(0, 0, S, S);
    c.drawImage(art, 0, 0, S, S);
    const cx = S / 2, cy = S / 2, r1 = R * RING_IN;
    c.lineCap = 'round';

    // Limb of the astrolabe: an arc hugging the lit side of the moon
    c.strokeStyle = ink(0.5);
    c.lineWidth = 0.7;
    c.beginPath();
    c.arc(cx, cy, r1, LIT_ANGLE - RING_SPAN, LIT_ANGLE + RING_SPAN);
    c.stroke();

    // Graduation ticks, every fifth one longer, fading toward the arc's ends
    const step = TAU / 72, shift = ((ringRot % step) + step) % step, base = Math.floor(ringRot / step);
    c.lineWidth = 0.6;
    for (let i = -20; i <= 20; i++) {
      const a = LIT_ANGLE + i * step + shift, d = Math.abs(a - LIT_ANGLE);
      if (d > RING_SPAN) continue;
      const long = (((i - base) % 5) + 5) % 5 === 0;
      const r2 = r1 + R * (long ? 0.14 : 0.07);
      c.strokeStyle = ink((long ? 0.6 : 0.4) * (1 - Math.pow(d / RING_SPAN, 3)));
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      c.stroke();
    }

    // Outer dotted ring, a little shorter, finished with a star at each end
    const r3 = R * RING_OUT, span = RING_SPAN * 0.86;
    c.fillStyle = ink(0.4);
    for (let a = -span; a <= span + 1e-6; a += span / 16) {
      c.beginPath();
      c.arc(cx + Math.cos(LIT_ANGLE + a) * r3, cy + Math.sin(LIT_ANGLE + a) * r3, 0.6, 0, TAU);
      c.fill();
    }
    c.strokeStyle = ink(0.55);
    c.lineWidth = 0.6;
    c.beginPath();
    for (const e of [-1, 1]) {
      const a = LIT_ANGLE + e * (RING_SPAN + 0.12);
      octagram(c, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, R * 0.07, a);
    }
    c.stroke();
  }

  function resize() {
    const w = p.clientWidth;
    if (!w || w === W) return;
    W = w;
    R = clamp(W * 0.085, 26, 46);
    Ri = R * 0.97;
    off = { x: Math.cos(SHADOW_ANGLE) * R * 0.5, y: Math.sin(SHADOW_ANGLE) * R * 0.5 };
    home = { x: W - R * 1.05, y: R + 4 };
    H0 = flow(false).height;
    paintMoon();
    if (mode === 'rest') Object.assign(moon, { x: home.x, y: home.y });
    lastKey = '';
    render();
  }

  // Moonrise: climb up through the quote into place, parting the text.
  function startRise() {
    if (still) return;
    rise = { t: 0, dur: 3.2, sx: home.x - R * 0.6, sy: home.y + lh * 3.2 };
    Object.assign(moon, { x: rise.sx, y: rise.sy, opacity: 0 });
    mode = 'rise';
    render();
  }

  function local(e) {
    const r = p.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  moonCv.addEventListener('pointerdown', e => {
    const q = local(e);
    drag = { dx: q.x - moon.x, dy: q.y - moon.y, id: e.pointerId };
    moonCv.setPointerCapture(e.pointerId);
    moonCv.classList.add('drag');
    Object.assign(moon, { opacity: 1, vx: 0, vy: 0 });
    mode = 'drag';
    kick();
  });
  moonCv.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const q = local(e);
    moon.x = clamp(q.x - drag.dx, -R * 0.3, W + R * 0.3);
    moon.y = clamp(q.y - drag.dy, -R * 0.3, Math.max(H0, lh * 4) + R * 0.3);
    kick();
  });
  const release = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    moonCv.classList.remove('drag');
    mode = 'return';
    kick();
  };
  moonCv.addEventListener('pointerup', release);
  moonCv.addEventListener('pointercancel', release);

  function tick(dt) {
    if (!still && moonSeen) {
      ringRot += dt * 0.04;
      drawMoon();
    }
    if (mode === 'rise') {
      rise.t += dt;
      const u = clamp(rise.t / rise.dur, 0, 1);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      moon.x = rise.sx + (home.x - rise.sx) * e;
      moon.y = rise.sy + (home.y - rise.sy) * e - Math.sin(Math.PI * e) * R * 0.5;
      moon.opacity = clamp(u * 2.5, 0, 1);
      if (u >= 1) mode = 'rest';
      render();
    } else if (mode === 'return') {
      // Slightly underdamped spring back home
      const k = 38, c = 9;
      moon.vx += ((home.x - moon.x) * k - moon.vx * c) * dt;
      moon.vy += ((home.y - moon.y) * k - moon.vy * c) * dt;
      moon.x += moon.vx * dt;
      moon.y += moon.vy * dt;
      if (Math.hypot(home.x - moon.x, home.y - moon.y) < 0.3 && Math.hypot(moon.vx, moon.vy) < 2) {
        Object.assign(moon, { x: home.x, y: home.y, vx: 0, vy: 0 });
        mode = 'rest';
      }
      render();
    } else if (mode === 'drag') {
      render();
    }
  }

  resize();
  new ResizeObserver(resize).observe(p);
  new IntersectionObserver(([e]) => { moonSeen = e.isIntersecting; }).observe(p);
  return { tick, startRise, busy: () => mode !== 'rest' };
}

// ── Dunes ────────────────────────────────────────────────────────────────
// Each dune is a silhouette filled with rows of text. Every row is an endless
// strip of words sliding downwind; pretext fits each run of words into the
// part of the row that lies inside the sand, so words appear on the windward
// edge and are blown off the crest as loose letters.
function makeDunes(el, texts) {
  const cv = document.createElement('canvas');
  el.append(cv);
  let ctx, cw = 0, ch = 0;
  const STEP = 4;
  const particles = [];

  const layers = [
    { text: texts.far, font: '450 8px "Schibsted Grotesk"', size: 8, lh: 10, base: 0.3, amp: 0.15, wl: 340, drift: 2.5, flow: 6, ink: '28,27,23', alpha: 0.32, spawn: 0, waves: [[1, 1, 0.3], [0.45, 2.3, 1.7], [0.3, 0.47, 4.1]] },
    { text: texts.mid, font: '450 10px "Schibsted Grotesk"', size: 10, lh: 12.5, base: 0.46, amp: 0.17, wl: 480, drift: 4, flow: 10, ink: '28,27,23', alpha: 0.45, spawn: 0.25, waves: [[1, 1, 2.2], [0.4, 2.1, 0.4], [0.35, 0.55, 5.3]] },
    { text: texts.near, font: 'italic 450 12px "Schibsted Grotesk"', size: 12, lh: 15, base: 0.64, amp: 0.18, wl: 640, drift: 6, flow: 15, ink: '28,27,23', alpha: 0.62, spawn: 0.45, waves: [[1, 1, 4.6], [0.42, 1.9, 2.9], [0.3, 0.6, 0.8]] },
  ];

  const measure = document.createElement('canvas').getContext('2d');
  function setText(L, text) {
    const prep = prepareWithSegments(text, L.font);
    const pos = [];
    let x = 0;
    for (let j = 0; j < prep.widths.length; j++) { pos.push(x); x += prep.widths[j]; }
    measure.font = L.font;
    const words = [];
    for (let j = 0; j < prep.kinds.length; j++) if (prep.kinds[j] === 'text') words.push(j);
    Object.assign(L, {
      text, prep, pos, words,
      period: x + measure.measureText(' ').width,
      chars: text.replace(/[\s·—]/g, ''),
      rows: [],
    });
  }
  for (const L of layers) {
    Object.assign(L, { phase: Math.random() * 1000, h: null });
    setText(L, L.text);
  }

  // First word that starts at or after strip coordinate s (0 ≤ s < period).
  function firstWordFrom(L, s) {
    let lo = 0, hi = L.words.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (L.pos[L.words[mid]] < s) lo = mid + 1; else hi = mid;
    }
    return lo < L.words.length ? { j: L.words[lo], dx: L.pos[L.words[lo]] - s } : { j: L.words[0], dx: L.period - s };
  }

  function surface(L) {
    const n = Math.ceil(cw / STEP) + 1;
    if (!L.h || L.h.length !== n) L.h = new Float32Array(n);
    const norm = L.waves.reduce((s, w) => s + w[0], 0);
    const wl = L.wl * clamp(cw / 1100, 0.5, 1.3);
    let min = Infinity;
    for (let i = 0; i < n; i++) {
      const x = i * STEP;
      let f = 0;
      for (const [a, m, ph] of L.waves) {
        const th = ((x - L.phase * (m < 1 ? 0.6 : 1)) / (wl / m)) * TAU + ph;
        // Skewed wave: gentle windward slope, steeper slip face downwind
        f += a * Math.sin(th - 0.45 * Math.cos(th));
      }
      const y = ch * (L.base - L.amp * (f / norm));
      L.h[i] = y;
      if (y < min) min = y;
    }
    L.min = min;
  }

  function sandRuns(L, yT) {
    const h = L.h, runs = [];
    let start = -1;
    for (let i = 0; i < h.length; i++) {
      const inside = h[i] <= yT;
      if (inside && start < 0) {
        start = i === 0 ? 0 : (i - 1 + (yT - h[i - 1]) / (h[i] - h[i - 1])) * STEP;
      } else if (!inside && start >= 0) {
        runs.push([start, (i - 1 + (yT - h[i - 1]) / (h[i] - h[i - 1])) * STEP]);
        start = -1;
      }
    }
    if (start >= 0) runs.push([start, cw + 40]);
    return runs;
  }

  function drawRow(L, row, a, b, baseline) {
    if (!L.words.length) return;
    let s = (a - row.off) % L.period;
    if (s < 0) s += L.period;
    let { j, dx } = firstWordFrom(L, s);
    let x = a + dx;
    for (let guard = 0; guard < 6 && x < b; guard++) {
      if (b - x < L.prep.widths[j]) break;
      const line = layoutNextLine(L.prep, { segmentIndex: j, graphemeIndex: 0 }, b - x);
      if (!line) break;
      ctx.fillText(line.text, x, baseline);
      if (line.end.segmentIndex < L.prep.segments.length) break;
      // Ran off the end of the text: carry on with the next repetition.
      x += L.period - L.pos[j];
      j = L.words[0];
    }
  }

  function spawn(L, x, y, vx, vy) {
    if (particles.length > 260) return;
    particles.push({
      ch: L.chars[(Math.random() * L.chars.length) | 0],
      font: L.font, ink: L.ink,
      x, y, vx, vy,
      rot: rand(-0.4, 0.4), vr: rand(-3, 3),
      life: 0, max: rand(1.4, 2.8), ph: rand(0, TAU),
    });
  }

  function step(t, dt) {
    const wf = wind.value;
    ctx.clearRect(0, 0, cw, ch);
    ctx.textBaseline = 'alphabetic';
    for (const L of layers) {
      L.phase += dt * L.drift * wf;
      surface(L);

      ctx.beginPath();
      ctx.moveTo(0, ch);
      for (let i = 0; i < L.h.length; i++) ctx.lineTo(i * STEP, L.h[i]);
      ctx.lineTo(cw, ch);
      ctx.closePath();
      // Erase the dunes behind rather than painting paper over them, so the
      // grain behind the canvas shows through and the dune has no edge.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.font = L.font;
      const nRows = Math.ceil(ch / L.lh);
      for (let k = 0; k < nRows; k++) {
        const row = L.rows[k] || (L.rows[k] = { off: rand(0, L.period) });
        const y0 = k * L.lh;
        // Rows near the surface move faster than the packed sand beneath.
        const depth = clamp((y0 - L.min) / (ch - L.min + 1), 0, 1);
        row.off += dt * L.flow * wf * (1.25 - 0.75 * depth);
        if (y0 + L.lh * 0.22 < L.min) continue;
        ctx.fillStyle = `rgba(${L.ink},${(L.alpha * (1 - 0.55 * depth)).toFixed(3)})`;
        for (const [a, b] of sandRuns(L, y0 + L.lh * 0.22)) {
          drawRow(L, row, a + 2, b - 2, y0 + L.lh * 0.78);
          // Loose letters lift off the downwind edge of each crest.
          if (!still && L.spawn && b < cw && b > 0 && Math.random() < dt * L.spawn * Math.max(0, wf) * 2) {
            spawn(L, b - L.size * 0.5, y0 + L.lh * 0.6, wf * rand(18, 34), rand(-26, -8));
          }
        }
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life += dt;
      if (q.life >= q.max || q.x > cw + 20 || q.x < -20) { particles.splice(i, 1); continue; }
      q.vx += (wf * 30 - q.vx) * dt * 0.8;
      q.vy += (20 + Math.sin(t * 4 + q.ph) * 30) * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      const u = q.life / q.max;
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.font = q.font;
      ctx.fillStyle = `rgba(${q.ink},${(Math.min(1, u * 6) * (1 - u) * 0.9).toFixed(3)})`;
      ctx.fillText(q.ch, 0, 0);
      ctx.restore();
    }
  }

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h || (w === cw && h === ch)) return;
    cw = w;
    ch = h;
    ctx = sizeCanvas(cv, cw, ch);
    if (still) step(0, 0);
  }

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '80px' }).observe(el);

  // Sweeping the pointer across the dunes gusts the wind and kicks up letters.
  let lastPointer = null;
  const near = layers[layers.length - 1];
  function surfaceAt(L, x) {
    return L.h ? L.h[clamp(Math.round(x / STEP), 0, L.h.length - 1)] : ch;
  }
  function kickUp(x, y, vx, n) {
    for (const L of [near, layers[1]]) {
      const sy = surfaceAt(L, x);
      if (y < sy - 60) continue;
      for (let i = 0; i < n; i++) spawn(L, x + rand(-14, 14), sy + rand(2, 10), vx * rand(0.4, 0.9) + rand(-20, 20), rand(-70, -25));
      return;
    }
  }
  if (!still) {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (lastPointer && e.pointerType === 'mouse') {
        const dx = x - lastPointer.x, dtp = Math.max(8, e.timeStamp - lastPointer.t) / 1000;
        const v = clamp(dx / dtp, -1600, 1600);
        wind.gust = clamp(wind.gust + v * 0.0009, -2.6, 3.2);
        if (Math.abs(dx) > 3) kickUp(x, y, v * 0.25, Math.min(3, Math.abs(dx) / 8) | 0);
      }
      lastPointer = { x, y, t: e.timeStamp };
    });
    el.addEventListener('pointerleave', () => { lastPointer = null; });
    el.addEventListener('pointerdown', e => {
      const r = el.getBoundingClientRect();
      kickUp(e.clientX - r.left, e.clientY - r.top, wind.value * 40, 14);
      wind.gust = clamp(wind.gust + 1.2, -2.6, 3.2);
    });
  }

  resize();
  new ResizeObserver(resize).observe(el);
  return {
    tick: (t, dt) => { if (visible && !still) step(t, dt); },
    // Where the sand starts, for the sky to keep clear of: the highest dune
    // surface at each sample, in viewport coordinates. Null when off screen.
    outline() {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || !layers[0].h) return null;
      const top = Float32Array.from(layers[0].h);
      for (const L of layers) {
        if (!L.h) continue;
        for (let i = 0; i < top.length && i < L.h.length; i++) top[i] = Math.min(top[i], L.h[i]);
      }
      return { left: r.left, y: r.top, step: STEP, top };
    },
    // Swap in new text for any of the layers, back to front.
    setTexts(texts) {
      texts.forEach((t, i) => { if (t) setText(layers[i], t); });
      if (still && cw) step(0, 0);
    },
  };
}

// The dunes are made of the essays themselves: fetch each piece in the
// Writing list and pull out its body text (skipping epigraphs, which quote
// other writers).
async function loadEssays() {
  const label = [...document.querySelectorAll('h2.label')].find(h => h.textContent.trim() === 'Writing');
  const list = label && label.nextElementSibling;
  if (!list) return [];
  const links = [...list.querySelectorAll('a[href^="/"]')];
  const essays = await Promise.all(links.map(async a => {
    const href = a.getAttribute('href');
    // Clean URLs in production; fall back to the .html file for local servers.
    for (const url of [href, href + '.html']) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const body = [...doc.querySelectorAll('.article-body p:not(.article-epigraph), .prose p, .essay-text p')]
          .map(p => p.textContent.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' ');
        if (body) return a.querySelector('.t').firstChild.textContent.trim() + ' — ' + body;
      } catch {}
    }
    return '';
  }));
  return essays.filter(Boolean);
}

// ── Main loop ────────────────────────────────────────────────────────────
let sky = null, quote = null, dunes = null, running = false, last = 0, T = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  T += dt;
  updateWind(T, dt);
  if (!still) sky.draw(T, dt);
  quote?.tick(dt);
  dunes?.tick(T, dt);
  if (!still || quote?.busy()) requestAnimationFrame(frame);
  else running = false;
}

function kick() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

async function init() {
  sky = makeSky();
  if (still) {
    // No animation loop: redraw the still sky as the page scrolls past the text.
    let queued = false;
    const redraw = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; sky.draw(0, 0); });
    };
    redraw();
    addEventListener('resize', redraw);
    addEventListener('scroll', redraw, { passive: true });
  } else {
    kick();
  }

  await Promise.all([
    'italic 450 17px "Schibsted Grotesk"',
    'italic 450 12px "Schibsted Grotesk"',
    '450 10px "Schibsted Grotesk"',
  ].map(f => document.fonts.load(f).catch(() => {})));

  const q = document.querySelector('.quote p');
  const quoteText = q ? q.textContent.replace(/\s+/g, ' ').trim() : '';
  const titles = [...document.querySelectorAll('.list .t')].map(t => t.firstChild.textContent.trim());
  const bio = [...document.querySelectorAll('.bio p')].map(p => p.textContent.replace(/\s+/g, ' ').trim()).join(' · ');

  if (q) {
    quote = makeMoonQuote(q);
    setTimeout(() => { quote.startRise(); kick(); }, 350);
  }
  const el = document.querySelector('.dunes');
  if (el) {
    dunes = makeDunes(el, {
      far: bio + ' ·',
      mid: titles.join(' · ') + ' ·',
      near: quoteText.replace(/[“”"]/g, '') + ' ·',
    });
    // Once the page has settled, deal the essays out across the three layers.
    setTimeout(async () => {
      const essays = await loadEssays();
      if (!essays.length) return;
      dunes.setTexts([0, 1, 2].map(i => {
        const mine = essays.filter((_, k) => k % 3 === i);
        return mine.length ? mine.join(' · ') + ' ·' : '';
      }));
    }, 1200);
  }
}

init();
