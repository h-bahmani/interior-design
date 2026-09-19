import { useRef, useState } from 'react';
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

export default function ObjectRecolor({ image, regions, selection, onSelect, onDetect, onPoint, onRecolor, onTexture, busy }) {
  const [mode,setMode]=useState('color');
  const [color,setColor]=useState('#B89B7A');
  const [strength,setStrength]=useState(.85);
  const [textureImage,setTextureImage]=useState(null);
  const [opacity,setOpacity]=useState(.85);
  const textureInput=useRef(null);

  const chooseTexture = file => {
    if (!file || busy || !['image/jpeg','image/png','image/webp'].includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => setTextureImage(reader.result);
    reader.readAsDataURL(file);
  };

  return <section className="tool-panel object-recolor">
    <h2>Object Recolor</h2>
    <p>Select an object or surface, then change only its color or apply a texture/pattern. Lighting and shape are preserved either way.</p>
    <button disabled={busy} onClick={onDetect}>{regions.length?'Detect areas again':'Detect objects and surfaces'}</button>
    <RegionSelector image={image} regions={regions} selection={selection} onSelect={onSelect} onPoint={onPoint} busy={busy} />

    <div className="tool-actions" role="group" aria-label="Recolor mode">
      <button disabled={busy} aria-pressed={mode==='color'} onClick={()=>setMode('color')}>Solid Color</button>
      <button disabled={busy} aria-pressed={mode==='texture'} onClick={()=>setMode('texture')}>Texture / Pattern</button>
    </div>

    {mode==='color' && <>
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
    </>}

    {mode==='texture' && <>
      <p className="field-hint">
        Upload a texture swatch (wallpaper, tile, fabric — ideally one that tiles cleanly) and it gets repeated across
        the selected area, lit to match that surface's real shadows and highlights. Works best on a wall facing roughly
        toward the camera — this doesn't correct for perspective on angled surfaces.
      </p>
      <button className="upload-zone" disabled={busy} onClick={()=>textureInput.current.click()}
        onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();chooseTexture(e.dataTransfer.files[0]);}}>
        {textureImage
          ? <img className="reference-preview" src={textureImage} alt="Texture swatch" />
          : <div className="upload-idle"><h2>Upload texture swatch</h2><p>Drop a JPG, PNG or WEBP here, or choose a file.</p></div>}
      </button>
      <input ref={textureInput} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy}
        onChange={e=>{chooseTexture(e.target.files[0]);e.target.value='';}} />

      <div className="recolor-controls">
        <label>Texture opacity: {Math.round(opacity*100)}%
          <input type="range" min="0.3" max="1" step="0.05" value={opacity} disabled={busy} onChange={e=>setOpacity(Number(e.target.value))}/>
        </label>
      </div>

      <button className="primary-action" disabled={busy || !selection || !textureImage}
        onClick={()=>onTexture(textureImage,opacity)}>Apply texture</button>
    </>}
  </section>;
}
