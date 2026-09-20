import { useEffect, useRef, useState } from 'react';
import RegionSelector from './RegionSelector';
import RecolorPreview from './RecolorPreview';
import { swatchDataUrl } from '../utils/textureSwatches';
import './ObjectRecolor.css';

const PRESET_COLORS = [
  ['Warm White','#E8DCCB'],
  ['Sand','#B89B7A'],
  ['Terracotta','#C47A5A'],
  ['Sage','#8E9B78'],
  ['Ocean Blue','#477C8C'],
  ['Charcoal','#4C5258'],
];

// Mirrors backend TEXTURE_PROMPTS — keep ids and categories in sync with that dict.
// category filters which materials are offered: no point showing "exposed brick" for
// a sofa, or "leather" for a wall.
const PRESET_TEXTURES = [
  { id:'leather', label:'Leather', category:'furniture', desc:'Smooth genuine leather, natural grain and stitched seams' },
  { id:'velvet_fabric', label:'Velvet Fabric', category:'furniture', desc:'Plush deep-pile velvet with a soft, rich sheen' },
  { id:'linen_fabric', label:'Linen Fabric', category:'furniture', desc:'Woven natural linen, soft matte texture' },
  { id:'suede', label:'Suede', category:'furniture', desc:'Soft napped suede with a warm matte finish' },
  { id:'rattan_wicker', label:'Rattan / Wicker', category:'furniture', desc:'Woven natural cane, warm and textural' },
  { id:'natural_stone', label:'Natural Stone', category:'surface', desc:'Polished stone with subtle natural veining' },
  { id:'wood_paneling', label:'Wood Paneling', category:'surface', desc:'Vertical oak slats with visible wood grain' },
  { id:'exposed_brick', label:'Exposed Brick', category:'surface', desc:'Weathered brick with visible mortar lines' },
  { id:'exposed_concrete', label:'Exposed Concrete', category:'surface', desc:'Raw, smooth industrial concrete finish' },
  { id:'geometric_wallpaper', label:'Geometric Wallpaper', category:'surface', desc:'Art-deco geometric print, gold on cream' },
  { id:'ceramic_tile', label:'Ceramic Tile', category:'surface', desc:'Glossy white subway tile, thin grout lines' },
];

const FURNITURE_LABEL = /sofa|couch|chair|armchair|loveseat|\bbed\b|ottoman|stool|\bbench\b|recliner|sectional|cushion/i;
const SURFACE_LABEL = /\bwall\b|ceiling|\bfloor\b|curtain|\brug\b|carpet|\bdoor\b|countertop|cabinet/i;
const categoryFor = label => !label ? null : FURNITURE_LABEL.test(label) ? 'furniture' : SURFACE_LABEL.test(label) ? 'surface' : null;

const selectionKey = s => s.region_id ? `r:${s.region_id}` : `b:${s.bbox.join(',')}`;

export default function ObjectRecolor({ image, regions, selection, onSelect, onDetect, onPoint, onApply, busy }) {
  const [multi,setMulti]=useState(false);
  const [selections,setSelections]=useState([]);
  const [useColor,setUseColor]=useState(true);
  const [useTexture,setUseTexture]=useState(false);
  const [color,setColor]=useState('#B89B7A');
  const [strength,setStrength]=useState(.85);
  const [textureSource,setTextureSource]=useState('preset');
  const [texturePreset,setTexturePreset]=useState('leather');
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

  // If every current selection is the same kind of thing (all furniture, or all
  // surfaces), only show materials that make sense for it. Mixed or unrecognized
  // selections fall back to showing everything, grouped.
  const targetCategories = new Set(targets.map(t=>t.region_id ? categoryFor(regions.find(r=>r.id===t.region_id)?.label) : null).filter(Boolean));
  const onlyCategory = targetCategories.size===1 ? [...targetCategories][0] : null;
  const visibleTextures = onlyCategory ? PRESET_TEXTURES.filter(t=>t.category===onlyCategory) : PRESET_TEXTURES;
  useEffect(()=>{
    if(!visibleTextures.some(t=>t.id===texturePreset))setTexturePreset(visibleTextures[0]?.id || 'leather');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[onlyCategory]);

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

  const textureButton = t => <button type="button" key={t.id} disabled={busy} aria-pressed={texturePreset===t.id}
    onClick={()=>setTexturePreset(t.id)} data-tooltip={t.desc}>
    <span className="swatch-thumb" style={{backgroundImage:`url(${swatchDataUrl(t.id)})`}} aria-hidden="true"/><small>{t.label}</small>
  </button>;

  return <section className="tool-panel object-recolor">
    <h2>Object Recolor</h2>
    <p>Select one or more objects or surfaces, then change their color and/or apply a texture — both at once if you like. Lighting and shape are preserved.</p>

    <p className="step-label">1. Select what to change</p>
    <button disabled={busy} onClick={onDetect}>{regions.length?'Detect areas again':'Detect objects and surfaces'}</button>
    <div className="tool-actions" role="group" aria-label="Selection mode">
      <button disabled={busy} aria-pressed={!multi} onClick={()=>setMultiMode(false)}>Single area</button>
      <button disabled={busy} aria-pressed={multi} onClick={()=>setMultiMode(true)}>Multiple areas at once</button>
    </div>
    <RegionSelector image={image} regions={regions} busy={busy} onPoint={onPoint}
      multi={multi}
      selection={multi?undefined:selection} onSelect={multi?undefined:onSelect}
      selections={multi?selections:undefined} onToggle={multi?toggleSelection:undefined} onClearAll={multi?clearAll:undefined} />

    <p className="step-label">2. Choose the change</p>
    <div className="tool-actions" role="group" aria-label="Changes to apply">
      <label className="toggle-check"><input type="checkbox" checked={useColor} disabled={busy} onChange={e=>setUseColor(e.target.checked)} /> Color</label>
      <label className="toggle-check"><input type="checkbox" checked={useTexture} disabled={busy} onChange={e=>setUseTexture(e.target.checked)} /> Texture / Material</label>
    </div>

    <RecolorPreview image={image} regions={regions} selections={targets}
      useColor={useColor} color={color} strength={strength}
      useTexture={useTexture} textureImage={useTexture ? (textureSource==='upload' ? textureImage : swatchDataUrl(texturePreset)) : null}
      opacity={textureSource==='upload' ? opacity : 0.92} />
    {useTexture && textureSource==='preset' &&
      <p className="field-hint">
        Preview uses a generic sample of this material, not your room's actual generation — real result will have more
        detail and may vary. Click "Generate with AI" material buttons below to change which one previews.
      </p>}

    {useColor && <div className="recolor-block">
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
    </div>}

    {useTexture && <div className="recolor-block">
      <div className="tool-actions" role="group" aria-label="Texture source">
        <button disabled={busy} aria-pressed={textureSource==='preset'} onClick={()=>setTextureSource('preset')}>Generate with AI</button>
        <button disabled={busy} aria-pressed={textureSource==='upload'} onClick={()=>setTextureSource('upload')}>Upload My Own</button>
      </div>

      {textureSource==='preset' && <>
        <p className="field-hint">
          Pick a material and the model generates it directly on each selected area — no photo needed.
          {onlyCategory && ` Showing materials for ${onlyCategory === 'furniture' ? 'furniture & upholstery' : 'walls & surfaces'} since that's what's selected.`}
          {' '}Uses the same technology as Object Editing, so it can take a similar amount of time per try.
        </p>
        {onlyCategory ? (
          <div className="recolor-presets texture-presets" aria-label="Preset textures">{visibleTextures.map(textureButton)}</div>
        ) : <>
          <p className="preset-group-label">Furniture &amp; upholstery</p>
          <div className="recolor-presets texture-presets" aria-label="Furniture textures">{PRESET_TEXTURES.filter(t=>t.category==='furniture').map(textureButton)}</div>
          <p className="preset-group-label">Walls &amp; surfaces</p>
          <div className="recolor-presets texture-presets" aria-label="Surface textures">{PRESET_TEXTURES.filter(t=>t.category==='surface').map(textureButton)}</div>
        </>}
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
    </div>}

    <p className="step-label">3. Apply</p>
    <button className="primary-action" disabled={!canApply} onClick={applyChanges}>
      {targets.length>1 ? `Apply to ${targets.length} areas` : 'Apply changes'}
    </button>
  </section>;
}
