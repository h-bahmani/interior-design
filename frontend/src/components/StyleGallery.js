import { useState } from 'react';

// Fast, low-res, few-step drafts — a moodboard to browse before committing
// GPU time to one full-quality generation. Not a final result on its own;
// clicking a thumbnail just selects that style. Previewing all 16 at once
// was slow enough to hit the request timeout and return nothing, so this
// lets you pick a handful instead — fewer generations, same fast-per-style
// quality, actually finishes.
export default function StyleGallery({ styles, busy, palette, onExplore, onSelectStyle, selected }) {
  const [picked, setPicked] = useState(() => new Set(styles.slice(0, 6).map(s => s.id)));
  const [previews, setPreviews] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = id => setPicked(p => {
    const next = new Set(p);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const explore = async () => {
    setLoading(true);
    setPreviews(null);
    try {
      const result = await onExplore(palette, [...picked]);
      if (result?.previews) setPreviews(result.previews);
    } finally {
      setLoading(false);
    }
  };

  return <div className="style-gallery">
    <p className="cps-custom-label">Pick which styles to sketch (fewer = faster, more reliable)</p>
    <div className="style-gallery-picks">
      {styles.map(s => (
        <button type="button" key={s.id} className="style-gallery-pick" aria-pressed={picked.has(s.id)}
          disabled={busy || loading} onClick={() => toggle(s.id)} data-tooltip={s.desc}>
          <span className="pick-dot" style={{background:s.color}} aria-hidden="true"/>{s.emoji} {s.name}
        </button>
      ))}
    </div>
    <button type="button" className="primary-action" disabled={busy || loading || picked.size === 0} onClick={explore}>
      {loading ? `Sketching ${picked.size} style${picked.size === 1 ? '' : 's'}…` : `✧ Preview ${picked.size} selected style${picked.size === 1 ? '' : 's'} (fast)`}
    </button>
    {!previews && !loading && <p className="cps-custom-hint">Low-res, ~10x faster than a real generation — just to help you pick a direction.</p>}
    {previews && <div className="style-gallery-grid">
      {styles.map(s => previews[s.id] && (
        <button type="button" key={s.id} className={`style-gallery-item ${selected === s.id ? 'selected' : ''}`}
          disabled={busy} onClick={() => onSelectStyle(s.id)}>
          <img src={`data:image/png;base64,${previews[s.id]}`} alt={s.name} />
          <span>{s.emoji} {s.name}</span>
        </button>
      ))}
    </div>}
  </div>;
}
