import { useRef } from 'react';
import './Upload.css';

export default function Upload({ onUpload, busy }) {
  const input = useRef(null);
  const choose = (file) => { if (file && !busy) onUpload(file); };
  return <div className="upload-container">
    <button className="upload-zone" disabled={busy} onClick={() => input.current.click()}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files[0]); }}>
      <div className="upload-idle"><h2>Upload your room photo</h2><p>Drop a JPG, PNG or WEBP here, or choose a file.</p>
        <p>Then choose a style, add furniture, edit an area or change colors.</p></div>
    </button>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy}
      onChange={e => { choose(e.target.files[0]); e.target.value = ''; }} />
  </div>;
}
