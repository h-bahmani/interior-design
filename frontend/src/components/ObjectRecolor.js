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

// Mirrors backend TEXTURE_PROMPTS — keep the ids in sync with that dict.
const PRESET_TEXTURES = [
  ['natural_stone', 'Natural Stone', '◈'],
  ['wood_paneling', 'Wood Paneling', '▤'],
  ['velvet_fabric', 'Velvet Fabric', '❋'],
  ['exposed_brick', 'Exposed Brick', '▦'],
  ['exposed_concrete', 'Exposed Concrete', '▧'],
  ['geometric_wallpaper', 'Geometric Wallpaper', '◆'],
  ['ceramic_tile', 'Ceramic Tile', '▢'],
  ['rattan_wicker', 'Rattan / Wicker', '≈'],
];

const selectionKey = s => s.region_id ? `r:${s.region_id}` : `b:${s.bbox.join(',')}`;

export default function ObjectRecolor({ image, regions, selection, onSelect, onDetect, onPoint, onApply, busy }) {
  const [multi,setMulti]=useState(false);
  const [selections,setSelections]=useState([]);
  const [useColor,setUseColor]=useState(true);
  const [useTexture,setUseTexture]=useState(false);
  const [color,setColor]=useState('#B89B7A');
  const [strength,setStrength]=useState(.85);
  const [textureSource,setTextureSource]=useState('preset');
  const [texturePreset,setTexturePreset]=useState('natural_stone');
  const [textureImage,setTextureImage]=useState(null);
  const [opacity,setOpacity]=useState(.85);
  const textureInput=useRef(null);

  const setMultiMode = v => { if(v===multi)return; setMulti(v); setSelections([]); onSelect(null); };
  const toggleSelection = sel => setSelections(prev=>{
    const k=selectionKey(sel);
    return prev.some(s=>selectionKey(s)===k) ? prev.filter(s=>selectionKey(s)!==k) : [...prev, sel];
  });
  const clearAll = () => setSelections([]);
  const targets = multi ? selections : (selection ? [selection] : []);

  const chooseTexture = file => {
    if (!file || busy || !['image/jpeg','image/png','image/webp'].includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => setTextureImage(reader.result);
    reader.readAsDataURL(file);
  };

  const uploadedTexturePending = useTexture && textureSource==='upload' && !textureImage;
  const canApply = !busy && targets.length && (useColor || useTexture) && !uploadedTexturePending;

  const applyChanges = () => {
    if (!canApply) return;
    const steps = [];
    for (const sel of targets) {
      if (useTexture) {
        steps.push(textureSource==='preset'
          ? {path:'/generate-texture', selection:sel, fields:{texture:texturePreset}}
          : {path:'/apply-texture', selection:sel, fields:{texture:textureImage, opacity}});
      }
      if (useColor) steps.push({path:'/recolor-object', selection:sel, fields:{color, strength}});
    }
    onApply(steps);
  };

  return <section className="tool-panel object-recolor">
    <h2>Object Recolor</h2>
    <p>Select one or more objects or surfaces, then change their color and/or apply a texture — both at once if you like. Lighting and shape are preserved.</p>
    <button disabled={busy} onClick={onDetect}>{regions.length?'Detect areas again':'Detect objects and surfaces'}</button>

    <div className="tool-actions" role="group" aria-label="Selection mode">
      <button disabled={busy} aria-pressed={!multi} onClick={()=>setMultiMode(false)}>Single area</button>
      <button disabled={busy} aria-pressed={multi} onClick={()=>setMultiMode(true)}>Multiple areas</button>
    </div>

    <RegionSelector image={image} regions={regions} busy={busy} onPoint={onPoint}
      multi={multi}
      selection={multi?undefined:selection} onSelect={multi?undefined:onSelect}
      selections={multi?selections:undefined} onToggle={multi?toggleSelection:undefined} onClearAll={multi?clearAll:undefined} />

    <div className="tool-actions" role="group" aria-label="Changes to apply">
      <label className="toggle-check"><input type="checkbox" checked={useColor} disabled={busy} onChange={e=>setUseColor(e.target.checked)} /> Color</label>
      <label className="toggle-check"><input type="checkbox" checked={useTexture} disabled={busy} onChange={e=>setUseTexture(e.target.checked)} /> Texture / Pattern</label>
    </div>

    <RecolorPreview image={image} regions={regions} selections={targets}
      useColor={useColor} color={color} strength={strength}
      useTexture={useTexture && textureSource==='upload'} textureImage={textureSource==='upload'?textureImage:null} opacity={opacity} />
    {useTexture && textureSource==='preset' &&
      <p className="field-hint">AI-generated textures need a real generation — no instant preview for this one, only for an uploaded swatch.</p>}

    {useColor && <>
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
    </>}

    {useTexture && <>
      <div className="tool-actions" role="group" aria-label="Texture source">
        <button disabled={busy} aria-pressed={textureSource==='preset'} onClick={()=>setTextureSource('preset')}>Generate with AI</button>
        <button disabled={busy} aria-pressed={textureSource==='upload'} onClick={()=>setTextureSource('upload')}>Upload My Own</button>
      </div>

      {textureSource==='preset' && <>
        <p className="field-hint">
          Pick a material and the model generates it directly on each selected area — no photo needed.
          Uses the same technology as Object Editing, so it can take a similar amount of time per try.
        </p>
        <div className="recolor-presets" aria-label="Preset textures">
          {PRESET_TEXTURES.map(([id,label,icon])=><button type="button" key={id} disabled={busy} aria-pressed={texturePreset===id}
            onClick={()=>setTexturePreset(id)} title={label}>
            <span aria-hidden="true">{icon}</span><small>{label}</small>
          </button>)}
        </div>
      </>}

      {textureSource==='upload' && <>
        <p className="field-hint">
          Upload a texture swatch (wallpaper, tile, fabric — ideally one that tiles cleanly) and it gets repeated across
          each selected area, lit to match that surface's real shadows and highlights. Works best on a wall facing roughly
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
      </>}
    </>}

    <button className="primary-action" disabled={!canApply} onClick={applyChanges}>
      {targets.length>1 ? `Apply to ${targets.length} areas` : 'Apply changes'}
    </button>
  </section>;
}
