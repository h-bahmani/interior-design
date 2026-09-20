// Small procedurally-drawn material swatches for the AI-generated texture presets.
// These are NOT what the model will actually produce — they're a rough, honest stand-in
// ("this button means stone-ish", "this one means wood-ish") so the preset buttons and the
// instant preview aren't just abstract icons/nothing while waiting on a real generation call.
const CACHE = new Map();

// Deterministic pseudo-random (mulberry32) so a swatch looks the same every time it's
// drawn instead of re-rolling speckle/noise positions on every render.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAINTERS = {
  natural_stone(ctx, w, h) {
    ctx.fillStyle = '#cfcac2'; ctx.fillRect(0, 0, w, h);
    const rnd = rng(1);
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(${140 + rnd() * 40},${135 + rnd() * 40},${125 + rnd() * 35},${0.25 + rnd() * 0.3})`;
      ctx.lineWidth = 0.6 + rnd() * 1.2;
      ctx.beginPath();
      let x = rnd() * w, y = rnd() * h;
      ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += (rnd() - 0.5) * w * 0.5; y += (rnd() - 0.5) * h * 0.5; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  wood_paneling(ctx, w, h) {
    const cols = 5, cw = w / cols, rnd = rng(2);
    for (let i = 0; i < cols; i++) {
      ctx.fillStyle = i % 2 ? '#8a5a2a' : '#9c6a35';
      ctx.fillRect(i * cw, 0, cw, h);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.15)';
    for (let i = 0; i < 22; i++) {
      ctx.beginPath(); const y = rnd() * h;
      ctx.moveTo(0, y); ctx.lineTo(w, y + (rnd() - 0.5) * 4); ctx.stroke();
    }
    for (let i = 1; i < cols; i++) { ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, h); ctx.stroke(); }
  },
  exposed_brick(ctx, w, h) {
    ctx.fillStyle = '#d9cdbe'; ctx.fillRect(0, 0, w, h);
    const bw = w / 4, bh = h / 6, rnd = rng(3);
    for (let row = 0; row < 6; row++) {
      const offset = row % 2 ? -bw / 2 : 0;
      for (let col = -1; col < 5; col++) {
        ctx.fillStyle = `rgb(${170 + rnd() * 30},${85 + rnd() * 20},${55 + rnd() * 15})`;
        ctx.fillRect(col * bw + offset + 1.5, row * bh + 1.5, bw - 3, bh - 3);
      }
    }
  },
  exposed_concrete(ctx, w, h) {
    ctx.fillStyle = '#9a9691'; ctx.fillRect(0, 0, w, h);
    const rnd = rng(4);
    for (let i = 0; i < 260; i++) {
      const v = 130 + rnd() * 50;
      ctx.fillStyle = `rgba(${v},${v},${v},.5)`;
      ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    }
  },
  geometric_wallpaper(ctx, w, h) {
    ctx.fillStyle = '#e3d5a8'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#a9822f'; ctx.lineWidth = 2;
    const step = w / 4;
    for (let y = -step; y < h + step; y += step) {
      for (let x = -step; x < w + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, y + step / 2); ctx.lineTo(x + step / 2, y); ctx.lineTo(x + step, y + step / 2); ctx.lineTo(x + step / 2, y + step); ctx.closePath();
        ctx.stroke();
      }
    }
  },
  ceramic_tile(ctx, w, h) {
    ctx.fillStyle = '#e4e0d6'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(110,110,105,.7)'; ctx.lineWidth = 2;
    const step = w / 3;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(w, i * step); ctx.stroke();
    }
    // a soft glossy diagonal highlight so it doesn't read as a flat empty square
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(255,255,255,.35)'); grad.addColorStop(0.35, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(80,80,75,.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
  },
  leather(ctx, w, h) {
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(0, 0, w, h);
    const rnd = rng(5);
    for (let i = 0; i < 90; i++) {
      const v = rnd() * 30 - 15;
      ctx.fillStyle = `rgba(${v > 0 ? 0 : 255},${v > 0 ? 0 : 240},${v > 0 ? 0 : 220},${Math.abs(v) / 60})`;
      ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 1);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.85); ctx.lineTo(w * 0.9, h * 0.85); ctx.stroke();
  },
  velvet_fabric(ctx, w, h) {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#234d39'); grad.addColorStop(0.5, '#2f5b45'); grad.addColorStop(1, '#234d39');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    for (let x = 0; x < w; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  },
  linen_fabric(ctx, w, h) {
    ctx.fillStyle = '#ddd3bd'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,105,80,.35)'; ctx.lineWidth = 0.6;
    for (let i = 0; i < w; i += 3) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let i = 0; i < h; i += 3) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
  },
  suede(ctx, w, h) {
    ctx.fillStyle = '#a68b6c'; ctx.fillRect(0, 0, w, h);
    const rnd = rng(6);
    for (let i = 0; i < 400; i++) {
      const v = rnd() * 24 - 12;
      ctx.fillStyle = `rgba(${v > 0 ? 60 : 220},${v > 0 ? 50 : 210},${v > 0 ? 40 : 190},${Math.abs(v) / 60})`;
      ctx.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
  },
  rattan_wicker(ctx, w, h) {
    ctx.fillStyle = '#c9a06a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,80,30,.5)'; ctx.lineWidth = 2;
    for (let i = -h; i < w; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,235,200,.35)';
    for (let i = 0; i < w + h; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - h, h); ctx.stroke();
    }
  },
};

export function swatchDataUrl(id, size = 64) {
  const key = `${id}:${size}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const painter = PAINTERS[id];
  if (!painter) return null;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  painter(c.getContext('2d'), size, size);
  const url = c.toDataURL('image/png');
  CACHE.set(key, url);
  return url;
}
