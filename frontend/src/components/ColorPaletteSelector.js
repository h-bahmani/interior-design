import { useState } from 'react';
const PRESET_PALETTES = [
  {
    id: "warm_earth",
    name: "Warm Earth",
    desc: "Terracotta, beige, warm brown",
    colors: ["#C4784A", "#D9B99B", "#8B5E3C", "#F2E4D4", "#6B3F2A"],

  },
  {
    id: "cool_nordic",
    name: "Cool Nordic",
    desc: "White, pale grey, soft blue",
    colors: ["#F0F4F8", "#B8C8D8", "#7A9BB5", "#D4DDE6", "#4A6B8A"],

  },
  {
    id: "luxury_gold",
    name: "Luxury Gold",
    desc: "Black, gold, ivory cream",
    colors: ["#1A1A1A", "#C9A84C", "#F5F0E8", "#8B7355", "#2D2D2D"],

  },
  {
    id: "natural_green",
    name: "Natural Green",
    desc: "Sage, forest, warm white",
    colors: ["#7A9B7A", "#4A7A4A", "#B8D4B8", "#F5F2EC", "#2D5A2D"],

  },
  {
    id: "bold_dramatic",
    name: "Bold Dramatic",
    desc: "Deep navy, burgundy, brass",
    colors: ["#1A2744", "#6B1E2E", "#B8924A", "#F0E8D8", "#0D1A33"],

  },
  {
    id: "pastel_soft",
    name: "Pastel Soft",
    desc: "Blush, lavender, mint",
    colors: ["#F2C4C4", "#C4B8D9", "#B8D9C4", "#F9F0F0", "#D9C4E8"],

  },
  {
    id: "moody_dark",
    name: "Moody Dark",
    desc: "Charcoal, slate, copper",
    colors: ["#2D2D2D", "#4A4A5A", "#8B6B4A", "#1A1A2A", "#C4844A"],

  },
  {
    id: "coastal_fresh",
    name: "Coastal Fresh",
    desc: "Ocean blue, sandy white, driftwood",
    colors: ["#4A8BA8", "#F5F0E0", "#C4A87A", "#7AB8D0", "#8B7355"],

  }
];


export default function ColorPaletteSelector({ busy, onPaletteChange }) {
  const [mode,setMode]=useState('preset');
  const [preset,setPreset]=useState(PRESET_PALETTES[0].id);
  const [colors,setColors]=useState(['#D0B090','#607060','#EEE8DD']);
  const [prompt,setPrompt]=useState('');
  const chosen=PRESET_PALETTES.find(p=>p.id===preset);
  return <section className="tool-panel"><h2>Color Palettes</h2>
    <p>Change the room's color theme independently of its design style. Generated colors are approximate.</p>
    <div className="tool-actions"><button aria-pressed={mode==='preset'} disabled={busy} onClick={()=>setMode('preset')}>Preset palettes</button>
    <button aria-pressed={mode==='custom'} disabled={busy} onClick={()=>setMode('custom')}>Custom palette</button></div>
    {mode==='preset'?<div className="tool-grid">{PRESET_PALETTES.map(p=><button key={p.id} disabled={busy} aria-pressed={preset===p.id} onClick={()=>setPreset(p.id)}>
      <strong>{p.name}</strong><span className="color-swatches">{p.colors.map(c=><span key={c} style={{background:c}} title={c}/>)}</span><small>{p.desc}</small>
    </button>)}</div>:<><div className="custom-colors">{colors.map((c,i)=><label key={i}>Color {i+1}<input type="color" value={c} disabled={busy}
      onChange={e=>setColors(old=>old.map((v,k)=>k===i?e.target.value:v))}/><span>{c}</span></label>)}</div>
      <label className="field-label">Optional color description<textarea maxLength={300} value={prompt} disabled={busy} onChange={e=>setPrompt(e.target.value)} placeholder="Muted earth tones…"/></label></>}
    <button className="primary-action" disabled={busy} onClick={()=>onPaletteChange(mode==='preset'?{name:chosen.name,colors:chosen.colors,prompt:chosen.desc}:{name:'Custom Palette',colors,prompt:prompt.trim()})}>Use this palette with style</button>
  </section>;
}
