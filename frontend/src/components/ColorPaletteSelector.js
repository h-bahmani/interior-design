import { useState } from 'react';
import './ColorPaletteSelector.css';

const PRESET_PALETTES = [
  { id: "warm_earth", name: "Warm Earth", desc: "Terracotta, beige, warm brown", colors: ["#C4784A", "#D9B99B", "#8B5E3C", "#F2E4D4", "#6B3F2A"] },
  { id: "cool_nordic", name: "Cool Nordic", desc: "White, pale grey, soft blue", colors: ["#F0F4F8", "#B8C8D8", "#7A9BB5", "#D4DDE6", "#4A6B8A"] },
  { id: "luxury_gold", name: "Luxury Gold", desc: "Black, gold, ivory cream", colors: ["#1A1A1A", "#C9A84C", "#F5F0E8", "#8B7355", "#2D2D2D"] },
  { id: "natural_green", name: "Natural Green", desc: "Sage, forest, warm white", colors: ["#7A9B7A", "#4A7A4A", "#B8D4B8", "#F5F2EC", "#2D5A2D"] },
  { id: "bold_dramatic", name: "Bold Dramatic", desc: "Deep navy, burgundy, brass", colors: ["#1A2744", "#6B1E2E", "#B8924A", "#F0E8D8", "#0D1A33"] },
  { id: "pastel_soft", name: "Pastel Soft", desc: "Blush, lavender, mint", colors: ["#F2C4C4", "#C4B8D9", "#B8D9C4", "#F9F0F0", "#D9C4E8"] },
  { id: "moody_dark", name: "Moody Dark", desc: "Charcoal, slate, copper", colors: ["#2D2D2D", "#4A4A5A", "#8B6B4A", "#1A1A2A", "#C4844A"] },
  { id: "coastal_fresh", name: "Coastal Fresh", desc: "Ocean blue, sandy white, driftwood", colors: ["#4A8BA8", "#F5F0E0", "#C4A87A", "#7AB8D0", "#8B7355"] },
];

export default function ColorPaletteSelector({ busy, onPaletteChange }) {
  const [mode, setMode] = useState('preset');
  const [preset, setPreset] = useState(PRESET_PALETTES[0].id);
  const [colors, setColors] = useState(['#D0B090', '#607060', '#EEE8DD']);
  const [prompt, setPrompt] = useState('');
  const chosen = PRESET_PALETTES.find(p => p.id === preset);

  const addColor = () => colors.length < 5 && setColors(c => [...c, '#B0A090']);
  const removeColor = i => colors.length > 2 && setColors(c => c.filter((_, k) => k !== i));

  const apply = () => onPaletteChange(
    mode === 'preset'
      ? { name: chosen.name, colors: chosen.colors, prompt: chosen.desc }
      : { name: 'Custom Palette', colors, prompt: prompt.trim() }
  );

  return <section className="tool-panel">
    <h2>Color Palettes</h2>
    <p>Change the room's color theme independently of its design style. Generated colors are approximate.</p>

    <div className="cps-tabs">
      <button className={`cps-tab ${mode === 'preset' ? 'active' : ''}`} aria-pressed={mode === 'preset'} disabled={busy} onClick={() => setMode('preset')}>Preset palettes</button>
      <button className={`cps-tab ${mode === 'custom' ? 'active' : ''}`} aria-pressed={mode === 'custom'} disabled={busy} onClick={() => setMode('custom')}>Custom palette</button>
    </div>

    {mode === 'preset' ? (
      <div className="cps-presets">
        {PRESET_PALETTES.map(p => (
          <button type="button" key={p.id} className={`cps-preset-item ${preset === p.id ? 'selected' : ''}`}
            disabled={busy} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
            {preset === p.id && <span className="cps-selected-check">✓</span>}
            <div className="cps-preset-colors">
              {p.colors.map(c => <span key={c} className="cps-preset-color" style={{ background: c }} title={c} />)}
            </div>
            <div className="cps-preset-info">
              <span className="cps-preset-name">{p.name}</span>
              <span className="cps-preset-desc">{p.desc}</span>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <div className="cps-custom">
        <p className="cps-custom-label">Pick 2–5 colors for the room's palette</p>
        <div className="cps-custom-colors">
          {colors.map((c, i) => (
            <div className="cps-custom-item" key={i}>
              <div className="cps-custom-swatch" style={{ background: c }}>
                <input className="cps-color-input" type="color" value={c} disabled={busy}
                  onChange={e => setColors(old => old.map((v, k) => k === i ? e.target.value : v))} />
              </div>
              <span className="cps-custom-hex">{c}</span>
              {colors.length > 2 && <button type="button" className="cps-custom-remove" disabled={busy} onClick={() => removeColor(i)} aria-label={`Remove color ${i + 1}`}>×</button>}
            </div>
          ))}
          {colors.length < 5 && <button type="button" className="cps-custom-add" disabled={busy} onClick={addColor}>+ Add color</button>}
        </div>
        <label className="field-label">Optional color description
          <textarea maxLength={300} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="Muted earth tones…" />
        </label>
      </div>
    )}

    <button className="primary-action" disabled={busy} onClick={apply}>Use this palette with style</button>
  </section>;
}
