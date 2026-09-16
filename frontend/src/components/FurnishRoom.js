import { useState } from 'react';
import RegionSelector from './RegionSelector';
export default function FurnishRoom({ image, busy, selection, onSelect, onFurnish }) {
  const [prompt,setPrompt]=useState('');
  return <section className="tool-panel"><h2>Furnish Rooms</h2>
    <p>Mark where the new object should appear. Include room for its full shape and shadow; existing items inside the selected area may change.</p>
    <RegionSelector image={image} busy={busy} selection={selection} onSelect={onSelect} furnish />
    <label className="field-label">What should be added?
      <textarea value={prompt} disabled={busy} maxLength={600} onChange={e=>setPrompt(e.target.value)} placeholder="Add one small wooden side table beside the sofa…" /></label>
    <button className="primary-action" disabled={busy || !selection || !prompt.trim()} onClick={()=>onFurnish(prompt.trim())}>Add object</button>
  </section>;
}
