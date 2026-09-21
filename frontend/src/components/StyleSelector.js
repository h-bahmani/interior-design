import { useState } from 'react';
import ColorPaletteSelector from './ColorPaletteSelector';
import StyleComparison from './StyleComparison';
import StyleGallery from './StyleGallery';
export const STYLES = [
  { id: "minimalist", name: "Minimalist", desc: "Simple forms, clean lines, restrained details", emoji: "◻", color: "#e8e6df" },
  { id: "industrial", name: "Industrial", desc: "Raw concrete, metal, exposed brick", emoji: "⬡", color: "#8a7a6a" },
  { id: "cyberpunk", name: "Cyberpunk", desc: "Futuristic geometry and technical details", emoji: "◈", color: "#4fc3f7" },
  { id: "modern_luxury", name: "Modern Luxury", desc: "Refined textures and sculptural details", emoji: "◇", color: "#c9a84c" },
  { id: "scandinavian", name: "Scandinavian", desc: "Hygge warmth, natural wood, cozy", emoji: "❋", color: "#a8b89a" },
  { id: "midcentury_modern", name: "Mid-Century", desc: "Retro 1960s, teak, geometric", emoji: "◑", color: "#c4774a" },
  { id: "japanese_zen", name: "Japanese Zen", desc: "Wabi-sabi, tatami, bamboo peace", emoji: "⬤", color: "#8aa88e" },
  { id: "bohemian", name: "Bohemian", desc: "Woven textures and eclectic patterns", emoji: "✦", color: "#c47aad" },
  { id: "art_deco", name: "Art Deco", desc: "Geometric glamour, brass, black lacquer", emoji: "◆", color: "#c9a84c" },
  { id: "coastal", name: "Coastal", desc: "Whitewashed wood, linen, ocean light", emoji: "≈", color: "#a8c4d4" },
  { id: "french_country", name: "French Country", desc: "Provincial toile, limewash, wrought iron", emoji: "✿", color: "#c4b8a8" },
  { id: "farmhouse_rustic", name: "Rustic Farmhouse", desc: "Reclaimed barn wood, shiplap, cozy", emoji: "⌂", color: "#a68a68" },
  { id: "contemporary_glam", name: "Contemporary Glam", desc: "Velvet, mirrors, Hollywood Regency", emoji: "✧", color: "#d4a8b8" },
  { id: "dark_academia", name: "Dark Academia", desc: "Walnut library, leather, brass lamps", emoji: "❧", color: "#4a3a2a" },
  { id: "tropical_modern", name: "Tropical Modern", desc: "Rattan, palms, breezy Bali resort", emoji: "❁", color: "#7a9b6a" },
  { id: "brutalist", name: "Brutalist", desc: "Raw concrete, monolithic minimalism", emoji: "▦", color: "#6a6a6a" },
  { id: "mediterranean", name: "Mediterranean", desc: "Whitewashed stucco, azulejo tile, wrought iron", emoji: "⛲", color: "#6b9bb3" },
  { id: "shabby_chic", name: "Shabby Chic", desc: "Distressed white furniture, vintage florals", emoji: "❦", color: "#e8c4d4" },
  { id: "southwestern_desert", name: "Southwestern Desert", desc: "Adobe clay, Navajo textiles, turquoise", emoji: "☀", color: "#c1703f" },
  { id: "memphis_postmodern", name: "Memphis Postmodern", desc: "Bold color blocks, playful 80s geometry", emoji: "◫", color: "#2ec4b6" },
];

const MODES = [
  ["preset", "Design Style"],
  ["custom", "Custom Prompt"],
  ["colors", "Colors Only"],
];

export default function StyleSelector({ image, busy, onGenerate, onPreview, onUsePreview, onExploreAll }) {
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
    <h2>{STYLES.length} Design Styles</h2><p>Choose a style and optionally a color palette — or skip the style entirely and just change the colors.</p>

    <div className="tool-actions" role="group" aria-label="Style mode">
      {MODES.map(([id, label]) => <button key={id} disabled={busy} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}
    </div>

    {mode === 'preset' && <>
      <StyleGallery styles={STYLES} busy={busy} palette={palette} selected={selected}
        onExplore={onExploreAll} onSelectStyle={setSelected} />
      <div className="tool-grid">{STYLES.map(s => <button key={s.id} disabled={busy} aria-pressed={selected === s.id}
        className={selected === s.id ? 'selected' : ''} onClick={() => setSelected(s.id)}><strong>{s.emoji} {s.name}</strong><small>{s.desc}</small></button>)}</div>
      <label className="field-label">Extra details for this style (optional)
        <textarea value={extra} maxLength={300} disabled={busy} onChange={e => setExtra(e.target.value)} placeholder="Add a reading nook by the window…" />
      </label>
    </>}

    {mode === 'custom' && <>
      <label className="field-label">Describe the design style
        <textarea value={prompt} maxLength={600} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="Simple geometric forms with natural textures…" />
      </label>
      <p className="field-hint">
        This changes the whole room's style/decor and keeps the same walls, doors and furniture layout —
        it can't remove, resize or recolor one specific object. For that, use <strong>Object Editing / Deleting</strong>
        (remove or replace a selected object) or <strong>Object Recolor</strong> (change one object's color) instead.
      </p>
    </>}

    {mode === 'colors' && <p>The room's layout, furniture and structure stay exactly as they are — only wall and decor colors change. Pick a palette below, then apply.</p>}

    <ColorPaletteSelector busy={busy} onPaletteChange={setPalette} />
    <button className="primary-action" disabled={!canApply} onClick={apply}>Apply style</button>
    {mode === 'preset' && <StyleComparison key={image} selectedStyle={selected} busy={busy} palette={palette} onPreview={onPreview} onUsePreview={onUsePreview} />}
  </section>;
}
