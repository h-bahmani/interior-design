import { useState } from 'react';
import RegionSelector from './RegionSelector';
export default function ObjectEditor({ image, regions, selection, onSelect, onDetect, onPoint, onEdit, busy }) {
  const [action,setAction]=useState('edit');
  const [prompt,setPrompt]=useState('');
  return <section className="tool-panel"><h2>Object Editing & Deleting</h2>
    <p>Select an object, wall, floor or other area. Detection runs only when you request it.</p>
    <button disabled={busy} onClick={onDetect}>{regions.length?'Detect areas again':'Detect objects and surfaces'}</button>
    <RegionSelector image={image} regions={regions} selection={selection} onSelect={onSelect} onPoint={onPoint} busy={busy} />
    <div className="tool-actions"><button aria-pressed={action==='edit'} disabled={busy} onClick={()=>{setAction('edit');setPrompt('');}}>Edit selected area</button>
      <button aria-pressed={action==='delete'} disabled={busy} onClick={()=>{setAction('delete');setPrompt('');}}>Delete selected area</button></div>
    <label className="field-label">{action==='edit'?'Describe the change':'Describe the replacement background (optional)'}
      <textarea value={prompt} disabled={busy} maxLength={600} onChange={e=>setPrompt(e.target.value)} placeholder={action==='edit'?'Replace this chair with a wooden chair…':'Continue the surrounding wall and floor…'} /></label>
    {action==='delete' && <p>The highlighted area will be replaced with an estimated background. Include any shadow you want removed.</p>}
    <button className="primary-action" disabled={busy || !selection || (action==='edit'&&!prompt.trim())}
      onClick={()=>onEdit(action,prompt.trim())}>{action==='edit'?'Apply edit':'Remove and rebuild background'}</button>
    {/* A disabled button with no explanation reads as "broken" -- especially right after a
        style change, which clears the selection so a stale mask can't be reused, but leaves
        no lasting sign of why once its toast fades. */}
    {!busy && !selection && <p className="field-hint">Select an area above first — detected regions clear after a style change, so you may need to click "Detect objects and surfaces" again.</p>}
    {!busy && selection && action==='edit' && !prompt.trim() && <p className="field-hint">Describe the change above first.</p>}
  </section>;
}
