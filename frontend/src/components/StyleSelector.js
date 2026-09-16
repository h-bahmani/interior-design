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


export default function StyleSelector({ image, busy, onGenerate, onPreview, onUsePreview }) {
  const [selected, setSelected] = useState('minimalist');
  const [custom, setCustom] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [palette, setPalette] = useState(null);
  return <section className="tool-panel">
    <h2>8 Design Styles</h2><p>Choose a style and optionally a color palette.</p>
    <label><input type="checkbox" checked={custom} onChange={e => setCustom(e.target.checked)} disabled={busy} /> Use Custom Style Prompt</label>
    {custom ? <label className="field-label">Describe the design style
      <textarea value={prompt} maxLength={600} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="Simple geometric forms with natural textures…" />
    </label> : <div className="tool-grid">{STYLES.map(s => <button key={s.id} disabled={busy} aria-pressed={selected===s.id}
      className={selected===s.id ? 'selected' : ''} onClick={() => setSelected(s.id)}><strong>{s.emoji} {s.name}</strong><small>{s.desc}</small></button>)}</div>}
    <ColorPaletteSelector busy={busy} onPaletteChange={setPalette} />
    <button className="primary-action" disabled={busy || (custom && !prompt.trim())}
      onClick={() => onGenerate(custom ? {customPrompt:prompt.trim(),palette} : {style:selected,palette})}>Apply style</button>
    {!custom && <StyleComparison key={image} selectedStyle={selected} busy={busy} palette={palette} onPreview={onPreview} onUsePreview={onUsePreview} />}
  </section>;
}
