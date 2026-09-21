import { useEffect, useState } from 'react';
import './ColorPaletteSelector.css';

const PRESET_PALETTES = [
  { id: "warm_earth", name: "Warm Earth", desc: "Terracotta, beige, warm brown", mood: "warm", colors: ["#C4784A", "#D9B99B", "#8B5E3C", "#F2E4D4", "#6B3F2A"] },
  { id: "cool_nordic", name: "Cool Nordic", desc: "White, pale grey, soft blue", mood: "cool", colors: ["#F0F4F8", "#B8C8D8", "#7A9BB5", "#D4DDE6", "#4A6B8A"] },
  { id: "luxury_gold", name: "Luxury Gold", desc: "Black, gold, ivory cream", mood: "bold", colors: ["#1A1A1A", "#C9A84C", "#F5F0E8", "#8B7355", "#2D2D2D"] },
  { id: "natural_green", name: "Natural Green", desc: "Sage, forest, warm white", mood: "neutral", colors: ["#7A9B7A", "#4A7A4A", "#B8D4B8", "#F5F2EC", "#2D5A2D"] },
  { id: "bold_dramatic", name: "Bold Dramatic", desc: "Deep navy, burgundy, brass", mood: "bold", colors: ["#1A2744", "#8B2E42", "#B8924A", "#F0E8D8", "#0D1A33"] },
  { id: "pastel_soft", name: "Pastel Soft", desc: "Blush, lavender, mint", mood: "pastel", colors: ["#F2C4C4", "#B0A0D4", "#9FD4B0", "#F9F0F0", "#C9A8E0"] },
  { id: "moody_dark", name: "Moody Dark", desc: "Charcoal, slate, copper", mood: "dark", colors: ["#2D2D2D", "#4A4A5A", "#8B6B4A", "#1A1A2A", "#C4844A"] },
  { id: "coastal_fresh", name: "Coastal Fresh", desc: "Ocean blue, sandy white, driftwood", mood: "cool", colors: ["#4A8BA8", "#F5F0E0", "#C4A87A", "#4F92B0", "#8B7355"] },
  { id: "desert_sand", name: "Desert Sand", desc: "Sandy beige, terracotta, cream", mood: "warm", colors: ["#D9B896", "#C79765", "#EDE0C8", "#8B6F47", "#F5EBD8"] },
  { id: "monochrome_mist", name: "Monochrome Mist", desc: "White, grey, charcoal minimalism", mood: "neutral", colors: ["#EDEDED", "#C7C7C7", "#9B9B9B", "#5A5A5A", "#2E2E2E"] },
  { id: "spring_blossom", name: "Spring Blossom", desc: "Blush pink, mint, soft lilac", mood: "pastel", colors: ["#F5D6DC", "#9FD8AE", "#FBF6EE", "#CFB8E8", "#F0C9D0"] },
  { id: "industrial_steel", name: "Industrial Steel", desc: "Charcoal, steel grey, rust accent", mood: "neutral", colors: ["#3A3F44", "#6B7176", "#B0B4B8", "#8C5A3C", "#1F2226"] },
  { id: "autumn_rust", name: "Autumn Rust", desc: "Burnt orange, mustard, deep brown", mood: "warm", colors: ["#B5542A", "#D9A441", "#5C3A22", "#F0E1C4", "#7A2E1D"] },
  { id: "midnight_blue", name: "Midnight Blue", desc: "Navy, indigo, brushed silver", mood: "dark", colors: ["#1B2A4A", "#2E4374", "#8A97AE", "#D8DEE9", "#0D1626"] },
  { id: "sage_cream", name: "Sage & Cream", desc: "Sage green, cream, warm taupe", mood: "neutral", colors: ["#A3B18A", "#DDD5BE", "#F8F5EF", "#C9BBA8", "#7D8C64"] },
  { id: "terracotta_sunset", name: "Terracotta Sunset", desc: "Terracotta, coral, warm gold", mood: "warm", colors: ["#C1553A", "#E08A5B", "#F0C987", "#F7E6D3", "#8C3B26"] },
];

const MOODS = [["all","All"],["warm","Warm"],["cool","Cool"],["neutral","Neutral"],["bold","Bold"],["pastel","Pastel"],["dark","Dark"]];

// No separate "confirm" step — every change here takes effect immediately.
// (There used to be a "Use this palette" button; picking a card without
// pressing it looked selected but silently sent no palette at all — fatal
// once Colors Only mode came to depend on a palette actually being set.)
export default function ColorPaletteSelector({ busy, onPaletteChange }) {
  const [mode, setMode] = useState('none'); // none | preset | custom
  const [preset, setPreset] = useState(PRESET_PALETTES[0].id);
  const [moodFilter, setMoodFilter] = useState('all');
  const [colors, setColors] = useState(['#D0B090', '#607060', '#EEE8DD']);
  const [prompt, setPrompt] = useState('');
  const chosen = PRESET_PALETTES.find(p => p.id === preset);
  const visible = moodFilter === 'all' ? PRESET_PALETTES : PRESET_PALETTES.filter(p => p.mood === moodFilter);

  useEffect(() => {
    if (mode === 'none') return onPaletteChange(null);
    if (mode === 'preset') return onPaletteChange({ name: chosen.name, colors: chosen.colors, prompt: chosen.desc });
    onPaletteChange({ name: 'Custom Palette', colors, prompt: prompt.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, preset, colors, prompt]);

  const addColor = () => colors.length < 5 && setColors(c => [...c, '#B0A090']);
  const removeColor = i => colors.length > 2 && setColors(c => c.filter((_, k) => k !== i));

  return <section className="tool-panel">
    <h2>Color Palettes</h2>
    <p>Change the room's color theme independently of its design style. Generated colors are approximate.</p>

    <div className="cps-tabs">
      <button className={`cps-tab ${mode === 'none' ? 'active' : ''}`} aria-pressed={mode === 'none'} disabled={busy} onClick={() => setMode('none')}>No palette</button>
      <button className={`cps-tab ${mode === 'preset' ? 'active' : ''}`} aria-pressed={mode === 'preset'} disabled={busy} onClick={() => setMode('preset')}>Preset palettes</button>
      <button className={`cps-tab ${mode === 'custom' ? 'active' : ''}`} aria-pressed={mode === 'custom'} disabled={busy} onClick={() => setMode('custom')}>Custom palette</button>
    </div>

    {mode === 'preset' && (<>
      <div className="cps-mood-filter" role="group" aria-label="Filter palettes by mood">
        {MOODS.map(([id, label]) => <button type="button" key={id} className={`cps-mood-chip ${moodFilter === id ? 'active' : ''}`}
          disabled={busy} aria-pressed={moodFilter === id} onClick={() => setMoodFilter(id)}>{label}</button>)}
      </div>
      <div className="cps-presets">
        {visible.map(p => (
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
    </>)}

    {mode === 'custom' && (
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
  </section>;
}
