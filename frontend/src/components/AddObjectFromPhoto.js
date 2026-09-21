import { useRef, useState } from 'react';
import RegionSelector from './RegionSelector';

// Not part of the v2 rewrite — IP-Adapter based, places the exact item from a
// reference photo into the room instead of a text description of it.
//
// Marking *where* it goes matters more than it looks: without a selection,
// generation used to run over the entire room, so the reference had to
// compete for influence across the whole 768x768 scene and the rest of the
// room could drift too. With a selection, generation is cropped tightly
// around that spot (same padded-crop-and-composite approach as Object
// Editing/Furnish Rooms), so the reference image gets much stronger,
// more localized influence and everything outside the marked area is left
// untouched.
export default function AddObjectFromPhoto({ image, selection, onSelect, busy, onAdd }) {
  const input = useRef(null);
  const [objectImage, setObjectImage] = useState(null);
  const [prompt, setPrompt] = useState('');

  const choose = file => {
    if (!file || busy || !['image/jpeg','image/png','image/webp'].includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => setObjectImage(reader.result);
    reader.readAsDataURL(file);
  };

  return <section className="tool-panel">
    <h2>Add Object From Photo</h2>
    <p>Upload a photo of a specific item — a chair, a lamp, a rug — and it gets placed into your room as that exact item, not a text description of one.
       Works best with a clear, well-lit photo of a real object (not a drawing, icon or logo) on a plain background.</p>
    <button className="upload-zone" disabled={busy} onClick={() => input.current.click()}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files[0]); }}>
      {objectImage
        ? <img className="reference-preview" src={objectImage} alt="Reference object" />
        : <div className="upload-idle"><h2>Upload object photo</h2><p>Drop a JPG, PNG or WEBP here, or choose a file.</p></div>}
    </button>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy}
      onChange={e => { choose(e.target.files[0]); e.target.value = ''; }} />
    <p>Mark where it should go. Include room for its full size and shadow — everything outside this area stays unchanged.</p>
    <RegionSelector image={image} busy={busy} selection={selection} onSelect={onSelect} furnish />
    <label className="field-label">Where and how should it be placed? (optional)
      <textarea value={prompt} disabled={busy} maxLength={600} onChange={e => setPrompt(e.target.value)} placeholder="Place it next to the window…" /></label>
    <button className="primary-action" disabled={busy || !objectImage || !selection} onClick={() => onAdd(objectImage, prompt.trim(), selection)}>Add this object</button>
    {!busy && !objectImage && <p className="field-hint">Upload a reference photo above first.</p>}
    {!busy && objectImage && !selection && <p className="field-hint">Mark where it goes above — a selection made before a style change doesn't carry over, so you may need to draw it again.</p>}
  </section>;
}
