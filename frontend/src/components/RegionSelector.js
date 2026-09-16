import { useEffect, useRef, useState } from 'react';
import { imageSource } from '../services/api';

const EMPTY_REGIONS = [];

// The image fills this canvas exactly: normalized coordinates exclude no hidden crop/padding.
export default function RegionSelector({ image, regions = EMPTY_REGIONS, selection, onSelect, onPoint, busy, furnish = false }) {
  const canvas = useRef(null);
  const masks = useRef([]);
  const baseImage = useRef(null);
  const composed = useRef(null); // offscreen: base image + selected mask overlay, cached so dragging doesn't recompute it
  const start = useRef(null);
  const [mode, setMode] = useState(furnish ? 'box' : 'region');
  const [draft, setDraft] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setReady(false); setError(''); masks.current = [];
    const load = src => new Promise((resolve, reject) => {
      const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('Could not display image or selection.')); im.src = src;
    });
    (async () => {
      const base = await load(image);
      const c = canvas.current;
      if (cancelled || !c) return;
      // Display-only masks are compact; backend masks keep the original resolution.
      const scale = Math.min(1, 768 / Math.max(base.width, base.height));
      c.width = Math.round(base.width * scale); c.height = Math.round(base.height * scale);
      baseImage.current = base;
      c.getContext('2d').drawImage(base,0,0,c.width,c.height);
      const loaded = [];
      for (const region of regions) {
        const mask = await load(imageSource(region.mask));
        if (cancelled) return;
        const buffer=document.createElement('canvas');buffer.width=c.width;buffer.height=c.height;
        const ctx=buffer.getContext('2d');ctx.drawImage(mask,0,0,c.width,c.height);
        const rgba=ctx.getImageData(0,0,c.width,c.height).data;
        const pixels=new Uint8Array(c.width*c.height);
        for(let i=0;i<pixels.length;i++)pixels[i]=rgba[i*4]>=128?1:0;
        loaded.push({region,pixels});
      }
      if(cancelled)return;
      masks.current=loaded;setReady(true);
    })().catch(e=>{if(!cancelled)setError(e.message);});
    return ()=>{cancelled=true;};
  }, [image, regions]);
  const drawBox=(ctx,c,b)=>{
    const [x1,y1,x2,y2]=b;ctx.fillStyle='rgba(230,184,70,.28)';ctx.strokeStyle='#e6b846';ctx.lineWidth=3;
    ctx.fillRect(x1*c.width,y1*c.height,(x2-x1)*c.width,(y2-y1)*c.height);
    ctx.strokeRect(x1*c.width,y1*c.height,(x2-x1)*c.width,(y2-y1)*c.height);
  };
  // Expensive: full-image redraw + a per-pixel mask overlay loop. Only reruns
  // when the selected region changes, not on every pointer-move while dragging.
  useEffect(()=>{
    const c=canvas.current;
    if(!ready || !c || !baseImage.current)return;
    const off=document.createElement('canvas');off.width=c.width;off.height=c.height;
    const octx=off.getContext('2d');octx.drawImage(baseImage.current,0,0,c.width,c.height);
    const picked=masks.current.find(m=>m.region.id===selection?.region_id);
    if(picked){
      const overlay=octx.createImageData(c.width,c.height);
      for(let i=0;i<picked.pixels.length;i++)if(picked.pixels[i]){
        overlay.data[i*4]=230;overlay.data[i*4+1]=184;overlay.data[i*4+2]=70;overlay.data[i*4+3]=115;
      }
      const layer=document.createElement('canvas');layer.width=c.width;layer.height=c.height;
      layer.getContext('2d').putImageData(overlay,0,0);octx.drawImage(layer,0,0);
    }
    composed.current=off;
    const ctx=c.getContext('2d');ctx.drawImage(off,0,0);
    const selectedBox=draft || selection?.bbox;
    if(selectedBox)drawBox(ctx,c,selectedBox);
  },[ready,selection]);
  // Cheap: reuses the cached composed layer, just redraws the draft rectangle
  // on top — this is what runs on every pointer-move while dragging a box.
  useEffect(()=>{
    const c=canvas.current;
    if(!ready || !c || !composed.current)return;
    const ctx=c.getContext('2d');ctx.drawImage(composed.current,0,0);
    const selectedBox=draft || selection?.bbox;
    if(selectedBox)drawBox(ctx,c,selectedBox);
  },[draft]);
  const point=e=>{
    const r=canvas.current.getBoundingClientRect();
    return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];
  };
  const box=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
  const down=e=>{
    if(busy || !ready)return;
    const p=point(e);
    if(mode==='box'){start.current=p;e.currentTarget.setPointerCapture(e.pointerId);setDraft(box(p,p));}
    else if(mode==='point')onPoint(p);
    else {
      const c=canvas.current, index=(Math.min(c.height-1,Math.floor(p[1]*c.height))*c.width+Math.min(c.width-1,Math.floor(p[0]*c.width)));
      // Prefer small regions when surfaces overlap an object mask.
      const hits=masks.current.filter(m=>m.pixels[index]===1).sort((a,b)=>{
        const area=r=>{const [x,y,x2,y2]=r.bbox;return(x2-x)*(y2-y);};return area(a.region)-area(b.region);
      });
      if(hits.length)onSelect({region_id:hits[0].region.id});
    }
  };
  const up=e=>{
    if(!start.current)return;
    const b=box(start.current,point(e));start.current=null;setDraft(null);
    if(b[2]-b[0]>.005 && b[3]-b[1]>.005)onSelect({bbox:b});
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <div className="region-picker">
    <div className="tool-actions">
      {!furnish && <><button disabled={busy} aria-pressed={mode==='region'} onClick={()=>setMode('region')}>Select detected area</button>
      <button disabled={busy} aria-pressed={mode==='point'} onClick={()=>setMode('point')}>Find area by clicking</button></>}
      <button disabled={busy} aria-pressed={mode==='box'} onClick={()=>setMode('box')}>Draw a rectangle</button>
      <button disabled={busy || !selection} onClick={()=>onSelect(null)}>Clear selection</button>
    </div>
    <p>{mode==='box'?'Drag across the image to mark the area to change.':mode==='point'?'Click an area, then review the highlighted selection before applying.':'Click a detected area in the image or select it from the list.'}</p>
    <canvas ref={canvas} className="selection-canvas" aria-label="Room area selection" onPointerDown={down}
      onPointerMove={e=>{if(start.current)setDraft(box(start.current,point(e)));}} onPointerUp={up}
      onPointerCancel={()=>{start.current=null;setDraft(null);}} />
    {error && <p role="alert">{error}</p>}
    {!furnish && <div className="region-list">{regions.map((r,i)=><button key={r.id} disabled={busy}
      aria-pressed={selection?.region_id===r.id} onClick={()=>onSelect({region_id:r.id})}>{r.label} · {i+1}</button>)}</div>}
    {selection?.bbox && <p>Rectangle selected.</p>}
  </div>;
}
