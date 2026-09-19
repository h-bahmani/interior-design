import { useEffect, useRef, useState } from 'react';
import { imageSource } from '../services/api';
import { rgbToLab, labToRgb, hexToRgb } from '../utils/labColor';

const loadImg = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error('load failed'));
  im.src = src;
});

// Client-side, no backend call: same LAB a/b-channel blend as the real
// recolor_object, run against a downscaled canvas so the user can try colors
// instantly instead of waiting on a real generation for every guess. No edge
// feathering (unlike the real op) — this is an estimate, not the final image.
const PREVIEW_MAX_DIM = 640;

export default function RecolorPreview({ image, regions, selection, color, strength }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!image || !selection) { setStatus('idle'); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      setStatus('loading');
      (async () => {
        const baseImg = await loadImg(image);
        const w = baseImg.width, h = baseImg.height;
        const scale = Math.min(1, PREVIEW_MAX_DIM / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));

        let maskData = null;
        if (selection.bbox) {
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = cw; maskCanvas.height = ch;
          const mctx = maskCanvas.getContext('2d');
          const [x1, y1, x2, y2] = selection.bbox;
          mctx.fillStyle = '#fff';
          mctx.fillRect(x1 * cw, y1 * ch, (x2 - x1) * cw, (y2 - y1) * ch);
          maskData = mctx.getImageData(0, 0, cw, ch).data;
        } else {
          const maskSrc = selection.region_id
            ? regions.find((r) => r.id === selection.region_id)?.mask
            : selection.mask;
          if (maskSrc) {
            const maskImg = await loadImg(imageSource(maskSrc));
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = cw; maskCanvas.height = ch;
            const mctx = maskCanvas.getContext('2d');
            mctx.drawImage(maskImg, 0, 0, cw, ch);
            maskData = mctx.getImageData(0, 0, cw, ch).data;
          }
        }
        if (cancelled || !maskData) { if (!cancelled) setStatus('idle'); return; }

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(baseImg, 0, 0, cw, ch);
        const imgData = ctx.getImageData(0, 0, cw, ch);
        const d = imgData.data;

        const [tr, tg, tb] = hexToRgb(color);
        const [, ta, tbb] = rgbToLab(tr, tg, tb);
        const amount = strength;

        for (let i = 0; i < d.length; i += 4) {
          if (maskData[i] < 128) continue; // outside the selected area
          const [l, a, b] = rgbToLab(d[i], d[i + 1], d[i + 2]);
          const [nr, ng, nb] = labToRgb(l, a * (1 - amount) + ta * amount, b * (1 - amount) + tbb * amount);
          d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
        }
        ctx.putImageData(imgData, 0, 0);
        if (!cancelled) setStatus('ready');
      })().catch(() => { if (!cancelled) setStatus('error'); });
    }, 120); // debounce slider drags
    return () => { cancelled = true; clearTimeout(timer); };
  }, [image, selection, regions, color, strength]);

  if (!selection) return null;
  return (
    <div className="recolor-preview">
      <p className="field-hint">
        Instant estimate, computed in your browser — no waiting, no generation used.
        Click "Apply Color" below for the final, lighting-matched result.
      </p>
      {status === 'error'
        ? <p role="alert">Could not build a preview for this selection.</p>
        : <canvas ref={canvasRef} className="recolor-preview-canvas" aria-label="Instant color preview" />}
    </div>
  );
}
