import { useState } from 'react';
import RegionSelector from './RegionSelector';
import RecolorPreview from './RecolorPreview';
import './ObjectRecolor.css';

const PRESET_COLORS = [
  ['Warm White','#E8DCCB'],
  ['Sand','#B89B7A'],
  ['Terracotta','#C47A5A'],
  ['Sage','#8E9B78'],
  ['Ocean Blue','#477C8C'],
  ['Charcoal','#4C5258'],
];

export default function ObjectRecolor({ image, regions, selection, onSelect, onDetect, onPoint, onRecolor, busy }) {
  const [color,setColor]=useState('#B89B7A');
  const [strength,setStrength]=useState(.85);

  return <section className="tool-panel object-recolor">
    <h2>Object Recolor</h2>
    <p>Select an object or surface, then change only its color. Lighting, texture and shape are preserved.</p>
    <button disabled={busy} onClick={onDetect}>{regions.length?'Detect areas again':'Detect objects and surfaces'}</button>
    <RegionSelector image={image} regions={regions} selection={selection} onSelect={onSelect} onPoint={onPoint} busy={busy} />

    <RecolorPreview image={image} regions={regions} selection={selection} color={color} strength={strength} />

    <div className="recolor-presets" aria-label="Preset object colors">
      {PRESET_COLORS.map(([label,value])=><button type="button" key={value} disabled={busy} aria-pressed={color===value}
        onClick={()=>setColor(value)} title={label}>
        <span style={{backgroundColor:value}} aria-hidden="true"/><small>{label}</small>
      </button>)}
    </div>

    <div className="recolor-controls">
      <label>Custom color<input type="color" value={color} disabled={busy} onChange={e=>setColor(e.target.value.toUpperCase())}/></label>
      <label>Color strength: {Math.round(strength*100)}%
        <input type="range" min="0.2" max="1" step="0.05" value={strength} disabled={busy} onChange={e=>setStrength(Number(e.target.value))}/>
      </label>
    </div>

    <button className="primary-action" disabled={busy || !selection} onClick={()=>onRecolor(color,strength)}>Apply color</button>
  </section>;
}
