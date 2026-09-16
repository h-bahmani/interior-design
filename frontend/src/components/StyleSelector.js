import { useState } from 'react';
import ColorPaletteSelector from './ColorPaletteSelector';
import StyleComparison from './StyleComparison';
const STYLES = [
  { id: "minimalist", name: "Minimalist", desc: "Simple forms, clean lines, restrained details", emoji: "◻", color: "#e8e6df" },
  { id: "industrial", name: "Industrial", desc: "Raw concrete, metal, exposed brick", emoji: "⬡", color: "#8a7a6a" },
  { id: "cyberpunk", name: "Cyberpunk", desc: "Futuristic geometry and technical details", emoji: "◈", color: "#4fc3f7" },
  { id: "modern_luxury", name: "Modern Luxury", desc: "Refined textures and sculptural details", emoji: "◇", color: "#c9a84c" },
  { id: "scandinavian", name: "Scandinavian", desc: "Hygge warmth, natural wood, cozy", emoji: "❋", color: "#a8b89a" },
  { id: "midcentury_modern", name: "Mid-Century", desc: "Retro 1960s, teak, geometric", emoji: "◑", color: "#c4774a" },
  { id: "japanese_zen", name: "Japanese Zen", desc: "Wabi-sabi, tatami, bamboo peace", emoji: "⬤", color: "#8aa88e" },
  { id: "bohemian", name: "Bohemian", desc: "Woven textures and eclectic patterns", emoji: "✦", color: "#c47aad" },
];

const MODES = [
  ["preset", "Design Style"],
  ["custom", "Custom Prompt"],
  ["colors", "Colors Only"],
];

export default function StyleSelector({ image, busy, onGenerate, onPreview, onUsePreview }) {
  const [mode, setMode] = useState('preset');
  const [selected, setSelected] = useState('minimalist');
  const [prompt, setPrompt] = useState('');
  const [extra, setExtra] = useState('');
  const [palette, setPalette] = useState(null);

  const canApply =
    mode === 'preset' ? !busy :
    mode === 'custom' ? !busy && !!prompt.trim() :
    !busy && !!palette; // colors-only needs a palette to do anything

  const apply = () => {
    if (mode === 'custom') return onGenerate({ customPrompt: prompt.trim(), palette });
    if (mode === 'colors') return onGenerate({ colorsOnly: true, palette });
    return onGenerate({ style: selected, extraDetails: extra.trim() || undefined, palette });
  };

  return <section className="tool-panel">
    <h2>8 Design Styles</h2><p>Choose a style and optionally a color palette — or skip the style entirely and just change the colors.</p>

    <div className="tool-actions" role="group" aria-label="Style mode">
      {MODES.map(([id, label]) => <button key={id} disabled={busy} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}
    </div>

    {mode === 'preset' && <>
      <div className="tool-grid">{STYLES.map(s => <button key={s.id} disabled={busy} aria-pressed={selected === s.id}
        className={selected === s.id ? 'selected' : ''} onClick={() => setSelected(s.id)}><strong>{s.emoji} {s.name}</strong><small>{s.desc}</small></button>)}</div>
      <label className="field-label">Extra details for this style (optional)
        <textarea value={extra} maxLength={300} disabled={busy} onChange={e => setExtra(e.target.value)} placeholder="Add a reading nook by the window…" />
      </label>
    </>}

    {mode === 'custom' && <label className="field-label">Describe the design style
      <textarea value={prompt} maxLength={600} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="Simple geometric forms with natural textures…" />
    </label>}

    {mode === 'colors' && <p>The room's layout, furniture and structure stay exactly as they are — only wall and decor colors change. Pick a palette below, then apply.</p>}

    <ColorPaletteSelector busy={busy} onPaletteChange={setPalette} />
    <button className="primary-action" disabled={!canApply} onClick={apply}>Apply style</button>
    {mode === 'preset' && <StyleComparison key={image} selectedStyle={selected} busy={busy} palette={palette} onPreview={onPreview} onUsePreview={onUsePreview} />}
  </section>;
}
