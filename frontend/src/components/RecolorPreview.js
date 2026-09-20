import { useEffect, useRef, useState } from 'react';
import { imageSource } from '../services/api';
import { rgbToLab, labToRgb, hexToRgb } from '../utils/labColor';

const loadImg = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error('load failed'));
  im.src = src;
});

// Client-side, no backend call: an approximation of the real recolor_object
// (LAB a/b blend) and apply_texture (tiled swatch, lit by local luminance),
// run against a downscaled canvas so the user can try a color+texture combo
// instantly across every selected area instead of waiting on a real
// generation for each guess. No edge feathering (unlike the real ops), and
// texture tiles from a fixed global origin rather than per-region — close
// enough for "does this combination look right", not the final image.
const PREVIEW_MAX_DIM = 640;

async function maskDataFor(selection, regions, cw, ch) {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = cw; maskCanvas.height = ch;
  const mctx = maskCanvas.getContext('2d');
  if (selection.bbox) {
    const [x1, y1, x2, y2] = selection.bbox;
    mctx.fillStyle = '#fff';
    mctx.fillRect(x1 * cw, y1 * ch, (x2 - x1) * cw, (y2 - y1) * ch);
    return mctx.getImageData(0, 0, cw, ch).data;
  }
  const maskSrc = selection.region_id
    ? regions.find((r) => r.id === selection.region_id)?.mask
    : selection.mask;
  if (!maskSrc) return null;
  const maskImg = await loadImg(imageSource(maskSrc));
  mctx.drawImage(maskImg, 0, 0, cw, ch);
  return mctx.getImageData(0, 0, cw, ch).data;
}

export default function RecolorPreview({ image, regions, selections, useColor, color, strength, useTexture, textureImage, opacity }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const active = (selections || []).filter(Boolean);

  useEffect(() => {
    if (!image || !active.length || (!useColor && !useTexture)) { setStatus('idle'); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      setStatus('loading');
      (async () => {
        const baseImg = await loadImg(image);
        const w = baseImg.width, h = baseImg.height;
        const scale = Math.min(1, PREVIEW_MAX_DIM / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));

        const masks = await Promise.all(active.map(s => maskDataFor(s, regions, cw, ch)));
        const combined = new Uint8Array(cw * ch);
        for (const m of masks) { if (!m) continue; for (let i = 0; i < combined.length; i++) if (m[i * 4] >= 128) combined[i] = 1; }
        if (cancelled || !combined.some(Boolean)) { if (!cancelled) setStatus('idle'); return; }

        let textureImg = null, tCanvas = null, tData = null;
        if (useTexture && textureImage) {
          textureImg = await loadImg(textureImage);
          tCanvas = document.createElement('canvas');
          tCanvas.width = textureImg.width; tCanvas.height = textureImg.height;
          tCanvas.getContext('2d').drawImage(textureImg, 0, 0);
          tData = tCanvas.getContext('2d').getImageData(0, 0, tCanvas.width, tCanvas.height).data;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(baseImg, 0, 0, cw, ch);
        const imgData = ctx.getImageData(0, 0, cw, ch);
        const d = imgData.data;

        // Local lighting reference: mean brightness across every selected pixel,
        // so a tiled texture is lit relative to the room it's being placed in.
        let meanGray = 128, count = 0;
        if (tData) {
          let sum = 0;
          for (let i = 0; i < combined.length; i++) if (combined[i]) {
            const o = i * 4;
            sum += 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]; count++;
          }
          meanGray = count ? Math.max(1, sum / count) : 128;
        }

        const [tr, tg, tb] = useColor ? hexToRgb(color) : [0, 0, 0];
        const [, ta, tbb] = useColor ? rgbToLab(tr, tg, tb) : [0, 0, 0];
        const amount = strength;

        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const i = y * cw + x;
          if (!combined[i]) continue;
          const o = i * 4;
          let r = d[o], g = d[o + 1], b = d[o + 2];
          if (tData) {
            const tw = tCanvas.width, th = tCanvas.height;
            const tx = x % tw, ty = y % th, to = (ty * tw + tx) * 4;
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const lighting = Math.min(1.8, Math.max(0.35, gray / meanGray));
            const op = opacity ?? 0.85;
            r = tData[to] * lighting * op + r * (1 - op);
            g = tData[to + 1] * lighting * op + g * (1 - op);
            b = tData[to + 2] * lighting * op + b * (1 - op);
          }
          if (useColor) {
            const [l, a, bb] = rgbToLab(r, g, b);
            [r, g, b] = labToRgb(l, a * (1 - amount) + ta * amount, bb * (1 - amount) + tbb * amount);
          }
          d[o] = Math.max(0, Math.min(255, r)); d[o + 1] = Math.max(0, Math.min(255, g)); d[o + 2] = Math.max(0, Math.min(255, b));
        }
        ctx.putImageData(imgData, 0, 0);
        if (!cancelled) setStatus('ready');
      })().catch(() => { if (!cancelled) setStatus('error'); });
    }, 120); // debounce slider drags
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, JSON.stringify(active), regions, useColor, color, strength, useTexture, textureImage, opacity]);

  if (!active.length || (!useColor && !useTexture)) return null;
  return (
    <div className="recolor-preview">
      <p className="field-hint">
        Instant estimate, computed in your browser — no waiting, no generation used
        {active.length > 1 ? `, combined across all ${active.length} selected areas` : ''}.
        Click "Apply changes" below for the final, lighting-matched result.
      </p>
      {status === 'error'
        ? <p role="alert">Could not build a preview for this selection.</p>
        : <canvas ref={canvasRef} className="recolor-preview-canvas" aria-label="Instant color/texture preview" />}
    </div>
  );
}
