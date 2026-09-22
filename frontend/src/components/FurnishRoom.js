import { useState } from 'react';
import RegionSelector from './RegionSelector';
import objectLibrary from '../data/objectLibrary';
import objectAliases from '../data/objectAliases';
import './FurnishRoom.css';

const AI_KEYWORDS = ['fit naturally into the scene', 'match existing style', 'preserve room perspective', 'blend with lighting'];
const LIBRARY_KEYWORDS = ['scale naturally', 'match perspective and lighting', 'keep original object design', 'blend seamlessly'];
const FOLDERS = Object.keys(objectLibrary);

// A data: URL, not a /objects/... path -- add_object_from_reference (same backend
// call "Add Object From Photo" uses) needs the actual image bytes, not a URL it can't
// reach from Colab/Kaggle.
const toDataUrl = url => fetch(url).then(r => r.blob()).then(blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not load that reference image.'));
  reader.readAsDataURL(blob);
}));

export default function FurnishRoom({ image, busy, selection, onSelect, onFurnish }) {
  const [mode, setMode] = useState('ai'); // ai | library
  const [prompt, setPrompt] = useState('');
  const [query, setQuery] = useState('');
  const [selectedObject, setSelectedObject] = useState(null);
  const [hoverObject, setHoverObject] = useState(null);
  const [loadingObject, setLoadingObject] = useState(false);

  const results = (() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return FOLDERS.filter(folder => folder.includes(q) || (objectAliases[folder] || []).some(a => a.toLowerCase().includes(q)))
      .flatMap(folder => objectLibrary[folder]);
  })();

  const addKeyword = word => setPrompt(prev => prev.trim() ? `${prev}, ${word}` : word);

  const submit = async () => {
    if (mode === 'library') {
      if (!selectedObject) return;
      setLoadingObject(true);
      try {
        const dataUrl = await toDataUrl(selectedObject.url);
        onFurnish(prompt.trim(), dataUrl);
      } finally {
        setLoadingObject(false);
      }
    } else {
      onFurnish(prompt.trim());
    }
  };

  const canSubmit = !busy && !loadingObject && !!selection && (mode === 'ai' ? !!prompt.trim() : !!selectedObject);

  return <section className="tool-panel">
    <h2>Furnish Rooms</h2>
    <div className="tool-actions furnish-modes" role="group" aria-label="Furnish mode">
      <button aria-pressed={mode === 'ai'} disabled={busy} onClick={() => { setMode('ai'); setSelectedObject(null); }}>
        AI Placement<small>Describe what to add, the model generates it</small>
      </button>
      <button aria-pressed={mode === 'library'} disabled={busy} onClick={() => setMode('library')}>
        From Library<small>Place an exact item from our furniture catalog</small>
      </button>
    </div>

    <p>Mark where the new object should appear. Include room for its full shape and shadow; existing items inside the selected area may change.</p>
    <RegionSelector image={image} busy={busy} selection={selection} onSelect={onSelect} furnish />

    {mode === 'library' && <div className="object-picker">
      <div className="object-folders">
        {FOLDERS.map(folder => <button type="button" key={folder} disabled={busy} onClick={() => setQuery(folder)}>{folder}</button>)}
      </div>
      <input className="furnish-object-search" value={query} disabled={busy} onChange={e => setQuery(e.target.value)}
        placeholder="Search a category… (English or Persian)" />
      {results.length > 0 && <div className="object-results">
        {hoverObject && <div className="object-hover-preview"><img src={hoverObject.url} alt={hoverObject.name} /></div>}
        <div className="object-grid">
          {results.map(obj => <button type="button" key={obj.url} className="object-card" aria-pressed={selectedObject?.url === obj.url}
            onClick={() => setSelectedObject(obj)} onMouseEnter={() => setHoverObject(obj)} onMouseLeave={() => setHoverObject(null)}>
            <img src={obj.url} alt={obj.name} />
          </button>)}
        </div>
      </div>}
      {query.trim() && results.length === 0 && <p className="field-hint">No matching category — try "sofa", "table", "مبل", "میز"…</p>}
      {selectedObject && <div className="selected-object-preview">
        <span>Selected: {selectedObject.name}</span>
        <img src={selectedObject.url} alt={selectedObject.name} />
      </div>}
    </div>}

    <div className="prompt-keywords">
      {(mode === 'ai' ? AI_KEYWORDS : LIBRARY_KEYWORDS).map(word => <button type="button" key={word} disabled={busy} onClick={() => addKeyword(word)}>+ {word}</button>)}
    </div>
    <label className="field-label">{mode === 'ai' ? 'What should be added?' : 'Placement notes (optional)'}
      <textarea value={prompt} disabled={busy} maxLength={600} onChange={e => setPrompt(e.target.value)}
        placeholder={mode === 'ai' ? 'Add one small wooden side table beside the sofa…' : 'Position near the wall, centered…'} />
    </label>

    <button className="primary-action" disabled={!canSubmit} onClick={submit}>{loadingObject ? 'Preparing reference…' : 'Add object'}</button>
  </section>;
}
