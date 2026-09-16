import { useState } from 'react';

// Fast, low-res, few-step drafts of every style at once — a moodboard to
// browse before committing GPU time to one full-quality generation. Not a
// final result on its own; clicking a thumbnail just selects that style.
export default function StyleGallery({ styles, busy, palette, onExplore, onSelectStyle, selected }) {
  const [previews, setPreviews] = useState(null);
  const [loading, setLoading] = useState(false);

  const explore = async () => {
    setLoading(true);
    try {
      const result = await onExplore(palette);
      if (result?.previews) setPreviews(result.previews);
    } finally {
      setLoading(false);
    }
  };

  return <div className="style-gallery">
    <button type="button" className="primary-action" disabled={busy || loading} onClick={explore}>
      {loading ? `Sketching all ${styles.length} styles…` : previews ? 'Refresh quick previews' : `✧ Preview all ${styles.length} styles (fast)`}
    </button>
    {!previews && <p className="cps-custom-hint">Low-res, ~10x faster than a real generation — just to help you pick a direction.</p>}
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
