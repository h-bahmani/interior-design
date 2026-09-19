import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./TransformAnimation.css";

const PRESETS = {
  fade:  { label: "Fade",  desc: "Smooth crossfade between before and after" },
  wipe:  { label: "Wipe",  desc: "Left-to-right reveal, like a curtain" },
  zoom:  { label: "Zoom",  desc: "Slow dolly-in while the room transforms" },
  slide: { label: "Slide", desc: "After pushes the before frame off-screen" },
};

const DURATIONS = [3000, 5000, 8000];

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// progress (0..1 across the whole clip) -> transition amount (0..1), with
// short holds on the pure before/after frames so the reveal reads clearly.
function transitionAmount(progress) {
  const holdIn = 0.12, holdOut = 0.12;
  if (progress <= holdIn) return 0;
  if (progress >= 1 - holdOut) return 1;
  const t = (progress - holdIn) / (1 - holdIn - holdOut);
  return easeInOutCubic(t);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draws `img` centered/contained into the canvas at the given uniform scale.
function drawContain(ctx, img, w, h, scale = 1) {
  const ratio = Math.min(w / img.width, h / img.height) * scale;
  const dw = img.width * ratio, dh = img.height * ratio;
  const dx = (w - dw) / 2, dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawFrame(ctx, w, h, beforeImg, afterImg, preset, amount) {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, w, h);

  if (preset === "fade") {
    drawContain(ctx, beforeImg, w, h);
    ctx.save();
    ctx.globalAlpha = amount;
    drawContain(ctx, afterImg, w, h);
    ctx.restore();
  } else if (preset === "wipe") {
    drawContain(ctx, beforeImg, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w * amount, h);
    ctx.clip();
    drawContain(ctx, afterImg, w, h);
    ctx.restore();
    if (amount > 0.003 && amount < 0.997) {
      ctx.fillStyle = "rgba(201,168,76,0.9)";
      ctx.fillRect(w * amount - 1.5, 0, 3, h);
    }
  } else if (preset === "zoom") {
    ctx.save();
    ctx.globalAlpha = 1 - amount;
    drawContain(ctx, beforeImg, w, h, 1 + amount * 0.08);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = amount;
    drawContain(ctx, afterImg, w, h, 1.08 - amount * 0.08);
    ctx.restore();
  } else if (preset === "slide") {
    const dx = w * amount;
    ctx.save();
    ctx.translate(-dx, 0);
    drawContain(ctx, beforeImg, w, h);
    ctx.restore();
    ctx.save();
    ctx.translate(w - dx, 0);
    drawContain(ctx, afterImg, w, h);
    ctx.restore();
  }
}

// Rendered once per (text, size) into an offscreen canvas — the live loop
// just blits this bitmap instead of paying for font measurement/fillText
// on every single animation frame.
function makeLabelBitmap(w, h, text) {
  const pad = Math.round(h * 0.03);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.font = `${Math.max(11, Math.round(h * 0.032))}px 'DM Sans', sans-serif`;
  ctx.textBaseline = "bottom";
  const metrics = ctx.measureText(text);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, h - pad * 2.4 - metrics.actualBoundingBoxAscent, metrics.width + pad * 2, pad * 2.4 + metrics.actualBoundingBoxAscent);
  ctx.fillStyle = "#c9a84c";
  ctx.fillText(text, pad, h - pad * 0.9);
  return c;
}

export default function TransformAnimation({ original, generated, style, open, onClose }) {
  const [preset, setPreset] = useState("fade");
  const [duration, setDuration] = useState(5000);
  const [playKey, setPlayKey] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const canvasRef = useRef(null);
  const imagesRef = useRef({ before: null, after: null });
  const rafRef = useRef(null);
  // Read by the running loop so changing preset/duration/replay never has to
  // reload the images or restart the loop — just changes what the next frame draws.
  const presetRef = useRef(preset);
  const durationRef = useRef(duration);
  const startRef = useRef(performance.now());

  const label = `InteriorAI — ${(style || "").replace(/_/g, " ")}`;

  presetRef.current = preset;
  durationRef.current = duration;

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  // Restart the clock (not the loop) whenever preset/duration/replay changes,
  // so a preset switch always starts from the "before" frame instead of
  // jumping in mid-transition.
  useEffect(() => {
    startRef.current = performance.now();
  }, [preset, duration, playKey]);

  // Load both images once per open, then run a single persistent draw loop
  // for as long as the modal stays open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([loadImage(original), loadImage(generated)]).then(([before, after]) => {
      if (cancelled) return;
      imagesRef.current = { before, after };
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext("2d");
      const labelBitmap = makeLabelBitmap(w, h, label);
      startRef.current = performance.now();
      const frameInterval = 1000 / 30; // 30fps preview is smooth enough and halves per-frame cost
      let lastDraw = 0;
      const loop = (now) => {
        rafRef.current = requestAnimationFrame(loop);
        if (now - lastDraw < frameInterval) return;
        lastDraw = now;
        const dur = durationRef.current;
        const elapsed = (now - startRef.current) % dur;
        const progress = elapsed / dur;
        drawFrame(ctx, w, h, before, after, presetRef.current, transitionAmount(progress));
        ctx.drawImage(labelBitmap, 0, 0);
      };
      rafRef.current = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, original, generated]);

  const handleExport = async () => {
    const canvas = canvasRef.current;
    const { before, after } = imagesRef.current;
    if (!canvas || !before || !after || isRecording) return;

    stopLoop();
    setIsRecording(true);
    setRecordProgress(0);

    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext("2d");
    const labelBitmap = makeLabelBitmap(w, h, label);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const done = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();

    const start = performance.now();
    let lastProgressUpdate = 0;
    await new Promise((resolve) => {
      const renderLoop = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        drawFrame(ctx, w, h, before, after, preset, transitionAmount(progress));
        ctx.drawImage(labelBitmap, 0, 0);
        if (now - lastProgressUpdate > 100 || progress >= 1) {
          lastProgressUpdate = now;
          setRecordProgress(progress);
        }
        if (progress < 1) {
          requestAnimationFrame(renderLoop);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(renderLoop);
    });

    recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `InteriorAI-${style}-${preset}.webm`;
    a.click();
    URL.revokeObjectURL(url);

    setIsRecording(false);
    setRecordProgress(0);
    setPlayKey((k) => k + 1); // resume the live preview loop
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="anim-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="anim-modal"
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="anim-toolbar">
            <span className="anim-title">Animate Transformation</span>
            <button className="anim-close-btn" onClick={onClose}>✕</button>
          </div>

          <div className="anim-canvas-wrap">
            <canvas ref={canvasRef} width={960} height={640} className="anim-canvas" />
            {isRecording && (
              <div className="anim-record-overlay">
                <div className="anim-record-dot" />
                <span>Rendering video… {Math.round(recordProgress * 100)}%</span>
              </div>
            )}
          </div>

          <div className="anim-controls">
            <div className="anim-preset-row">
              {Object.entries(PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  className={`anim-preset-btn ${preset === key ? "active" : ""}`}
                  onClick={() => setPreset(key)}
                  title={p.desc}
                  disabled={isRecording}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="anim-duration-row">
              <span className="anim-duration-label">Duration</span>
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  className={`anim-duration-btn ${duration === d ? "active" : ""}`}
                  onClick={() => setDuration(d)}
                  disabled={isRecording}
                >
                  {d / 1000}s
                </button>
              ))}
            </div>

            <div className="anim-action-row">
              <button className="anim-btn secondary" onClick={() => setPlayKey((k) => k + 1)} disabled={isRecording}>
                ↺ Replay
              </button>
              <button className="anim-btn primary" onClick={handleExport} disabled={isRecording}>
                {isRecording ? "Rendering…" : "⬇ Export Video (.webm)"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
