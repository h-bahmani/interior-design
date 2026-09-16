import { useState } from 'react';
import { imageSource } from '../services/api';

// Preview exactly one selected style; accepting it does not run the model again.
export default function StyleComparison({ selectedStyle, palette, busy, onPreview, onUsePreview }) {
  const [previews, setPreviews] = useState({});
  const preview = previews[selectedStyle];
  const generate = async () => {
    const style = selectedStyle;
    const result = await onPreview(style, palette);
    if (result?.previews?.[style]) setPreviews(p => ({ ...p, [style]: imageSource(result.previews[style], result.mime_type) }));
  };
  return <div className="preview-panel">
    <button disabled={busy || !!preview} onClick={generate}>Preview selected style (one generation)</button>
    {preview && <><img src={preview} alt={`${selectedStyle} preview`} />
      <button disabled={busy} onClick={() => onUsePreview(preview, selectedStyle)}>Use this preview</button></>}
  </div>;
}
