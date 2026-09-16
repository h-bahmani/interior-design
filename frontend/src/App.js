import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import Auth from './components/Auth';
import BackendSetup from './components/BackendSetup';
import Upload from './components/Upload';
import StyleSelector from './components/StyleSelector';
import FurnishRoom from './components/FurnishRoom';
import ObjectEditor from './components/ObjectEditor';
import AddObjectFromPhoto from './components/AddObjectFromPhoto';
import ObjectRecolor from './components/ObjectRecolor';
import ResultView from './components/ResultView';
import { ToastProvider, useToast } from './components/Toast';
import { getApiUrl } from './config';
import { apiRequest, imageSource } from './services/api';
import { translateToEnglish } from './utils/translate';
import './App.css';
import './Workflow.css';

const TOOLS = [['style','8 Design Styles'],['furnish','Furnish Rooms'],['object','Object Editing / Deleting'],['addobject','Add Object From Photo'],['recolor','Object Recolor']];
function AppInner() {
  const toast=useToast();
  const [user,setUser]=useState(null), [authChecked,setAuthChecked]=useState(false);
  const [apiUrl,setApiUrl]=useState(getApiUrl), [setup,setSetup]=useState(false), [connection,setConnection]=useState('checking');
  const [current,setCurrent]=useState(null), [original,setOriginal]=useState(null), [before,setBefore]=useState(null);
  const [history,setHistory]=useState([]), [showHistory,setShowHistory]=useState(false);
  const [tool,setTool]=useState('style'), [regions,setRegions]=useState([]), [selection,setSelection]=useState(null);
  const [busy,setBusy]=useState(''), [version,setVersion]=useState(0);
  const [genModel,setGenModel]=useState(()=>localStorage.getItem('interiorai_gen_model')||'fast');
  const changeModel=m=>{setGenModel(m);localStorage.setItem('interiorai_gen_model',m);};
  const lock=useRef(false), revision=useRef(0), pending=useRef(null), activeUrl=useRef(apiUrl), download=useRef(null), toolPanel=useRef(null);
  // clearRegions=false for in-place edits (commit/undo/restore/history) — keeps
  // the detected region list valid across a chain of edits so you don't have to
  // re-run detection after every single change.
  const invalidate=useCallback((clearRegions=true)=>{
    revision.current+=1; setVersion(revision.current);
    if(clearRegions)setRegions([]);
    setSelection(null);
  },[]);
  const changeUrl=useCallback((url)=>{
    const clean=url.trim().replace(/\/+$/,'');
    if(clean===activeUrl.current)return;
    activeUrl.current=clean;pending.current?.abort();invalidate();setApiUrl(clean);
    localStorage.setItem('interiorai_api_url',clean);
  },[invalidate]);
  useEffect(()=>onAuthStateChanged(auth,u=>{
    pending.current?.abort(); invalidate();setUser(u);setAuthChecked(true);
    setCurrent(null);setOriginal(null);setBefore(null);setHistory([]);
  }),[invalidate]);
  useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>onSnapshot(doc(db,'config','colab_url'),snap=>{
    if(snap.exists()){
      const {url,active}=snap.data();
      if(typeof url==='string' && active){changeUrl(url);setSetup(false);}
    }
  },()=>{/* Manual URL remains available if Firestore is unavailable. */}),[changeUrl]);
  useEffect(()=>{
    if(busy)return;
    let cancelled=false;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    setConnection('checking');
    apiRequest(apiUrl,'/capabilities',undefined,{signal:controller.signal}).then(data=>{
      if(!cancelled)setConnection(data.api_version===2?'connected':'incompatible');
    }).catch(()=>{if(!cancelled)setConnection('offline');});
    return ()=>{cancelled=true;clearTimeout(timeout);controller.abort();};
  },[apiUrl,busy]);
  // Local state owns the displayed image. Send its bytes, never a global "last upload".
  // PNG returned by /upload is canonical, so region hashes match later requests.
  const run=async(label,work)=>{
    if(lock.current)return null;
    lock.current=true;setBusy(label);
    const controller=new AbortController();pending.current=controller;
    // Browser fetch() has no built-in timeout — if Colab/ngrok hangs mid-request
    // (a dropped tunnel that never closes the connection), this would otherwise
    // leave busy stuck forever, disabling every button with no way to recover
    // short of a page refresh. 3 minutes covers even slow Quality/SDXL generations.
    const timeout=setTimeout(()=>controller.abort(),180000);
    const sourceRevision=revision.current, base=activeUrl.current;
    const request=(path,body)=>apiRequest(base,path,body,{signal:controller.signal});
    try {
      const result=await work(request);
      if(result?.image !== undefined) imageSource(result.image,result.mime_type);
      if(controller.signal.aborted || sourceRevision!==revision.current || base!==activeUrl.current)return null;
      return result;
    } catch(e) {
      if(e.name==='AbortError' && controller.signal.aborted && sourceRevision===revision.current)
        toast('Request timed out after 3 minutes. Check the Colab notebook is still running.','error',7000);
      else if(e.name!=='AbortError')toast(e.message || 'Operation failed.','error',6500);
      return null;
    } finally {clearTimeout(timeout);if(pending.current===controller)pending.current=null;lock.current=false;setBusy('');}
  };
  const commit=(data,label)=>{
    const next={image:imageSource(data.image,data.mime_type),image_id:data.image_id,label};
    setBefore(current);setCurrent(next);
    setHistory(h=>[{...next,id:Date.now()+Math.random()},...h].slice(0,8));
    invalidate(false);
    if(data.warning)toast(data.warning,'info',7000);
    else toast('Changes applied.','success');
  };
  const upload=async file=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Choose JPG, PNG or WEBP.','error');return;}
    if(file.size>24*1024*1024){toast('Choose an image smaller than 24 MB.','error');return;}
    const data=await run('Uploading room…',request=>{const form=new FormData();form.append('image',file);return request('/upload',form);});
    if(data){const next={image:imageSource(data.image,data.mime_type),image_id:data.image_id,label:'original'};
      setCurrent(next);setOriginal(next);setBefore(null);setHistory([]);invalidate();}
  };
  const apply=async(path,fields,label)=>{
    if(!current)return;
    const translated={...fields};
    if(translated.customPrompt)translated.customPrompt=await translateToEnglish(translated.customPrompt);
    if(translated.prompt)translated.prompt=await translateToEnglish(translated.prompt);
    if(translated.extraDetails)translated.extraDetails=await translateToEnglish(translated.extraDetails);
    if(translated.palette?.prompt)translated.palette={...translated.palette,prompt:await translateToEnglish(translated.palette.prompt)};
    const data=await run('Applying your changes…',request=>request(path,{image:current.image,model:genModel,...translated}));
    if(data)commit(data,label);
  };
  const addObject=async(objectImage,prompt)=>{
    if(!current)return;
    const translatedPrompt=await translateToEnglish(prompt);
    const data=await run('Adding the object…',request=>request('/add-object',{room_image:current.image,object_image:objectImage,prompt:translatedPrompt,model:genModel}));
    if(data)commit(data,'add_object');
  };
  // A region_id is only valid against the image it was detected on (the
  // backend indexes regions by a hash of that image's bytes). Since regions
  // now survive across edits (see invalidate above), a region picked before
  // an earlier edit would otherwise be rejected as "expired" on the next one —
  // sending its actual mask instead sidesteps that lookup entirely.
  const requestSelection=()=>{
    if(!selection?.region_id)return selection;
    const region=regions.find(item=>item.id===selection.region_id);
    return region?.mask ? {mask:region.mask} : selection;
  };
  const recolorObject=(color,strength)=>apply('/recolor-object',{selection:requestSelection(),color,strength},'recolor');
  const detect=async()=>{
    const data=await run('Finding objects and surfaces…',request=>request('/detect-objects',{image:current.image}));
    if(data){setRegions(data.regions || []);setSelection(null);if(!data.regions?.length)toast('No areas found. Try clicking an area or drawing a rectangle.','info');}
  };
  const point=async coordinates=>{
    const data=await run('Finding the selected area…',request=>request('/segment-point',{image:current.image,point:coordinates}));
    if(data){setRegions(r=>[...r,{id:data.region_id,label:'Selected area',mask:data.mask,bbox:[0,0,1,1]}]);setSelection({region_id:data.region_id});}
  };
  const undo=()=>{if(!before || lock.current)return;setCurrent(before);setBefore(null);invalidate(false);};
  const reset=()=>{if(lock.current)return;download.current=null;setCurrent(null);setOriginal(null);setBefore(null);setHistory([]);invalidate();};
  useEffect(()=>{
    const handler=e=>{
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable)return;
      if(e.key==='Escape')setShowHistory(false);
      if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();}
      if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();download.current?.();}
      if((e.ctrlKey||e.metaKey)&&e.key==='h'){e.preventDefault();setShowHistory(v=>!v);}
    };
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
    // Handler intentionally follows the currently available undo snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[before]);
  const registerDownload=useCallback(fn=>{download.current=fn;},[]);
  if(!authChecked)return null;
  if(!user)return <Auth onLogin={()=>{}} />;
  return <div className="app">
    {setup && <BackendSetup onConnect={url=>{changeUrl(url);setSetup(false);}} />}
    <div className="ambient-bg" aria-hidden="true"><div className="orb orb-1"/><div className="orb orb-2"/></div>
    <header className="header"><div className="header-inner">
      <button className="logo" disabled={!!busy} onClick={reset}><span className="logo-text">Interior<em>AI</em></span></button>
      <div className="user-info"><button disabled={!!busy} onClick={()=>setSetup(true)}>Connection: {connection}</button>
      <div className="model-toggle" role="group" aria-label="Generation quality">
        <button aria-pressed={genModel==='fast'} disabled={!!busy} onClick={()=>changeModel('fast')} title="SD1.5 — quicker">Fast</button>
        <button aria-pressed={genModel==='quality'} disabled={!!busy} onClick={()=>changeModel('quality')} title="SDXL — slower, more photorealistic">Quality</button>
      </div>
      <button disabled={!!busy || !history.length} onClick={()=>setShowHistory(v=>!v)}>History ({history.length})</button>
      <span className="user-name">{user.displayName || user.email}</span><button disabled={!!busy} onClick={()=>signOut(auth)}>Sign Out</button></div>
    </div></header>
    <main className="main">
      {connection==='incompatible' && <p role="alert">Connect the API v2 notebook before editing.</p>}
      {busy && (
        <div className="operation-status-overlay" role="status" aria-live="polite">
          <div className="operation-status">
            <div className="ai-circle-wrapper">
              <div className="orbit orbit-one"></div>
              <div className="orbit orbit-two"></div>
              <div className="ai-circle">
                <video autoPlay loop muted playsInline>
                  <source src="/ai-loader.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
            <div className="status-text">{busy}<span>Please keep this page open</span></div>
          </div>
        </div>
      )}
      {!current?<><div className="page-header"><h1>Transform Your Space</h1><p>Start with your room photo.</p></div><Upload onUpload={upload} busy={!!busy}/></>:<>
        <div className="page-header"><h1>Your Room Workspace</h1><p>Every tool uses the current image. Undo restores the previous result.</p></div>
        <div className="tool-actions"><button disabled={!!busy} onClick={reset}>Upload another photo</button>
          <button disabled={!!busy || !before} onClick={undo}>Undo last change</button>
          <button disabled={!!busy || current===original} onClick={()=>{setBefore(current);setCurrent(original);invalidate(false);}}>Restore original</button></div>
        <nav className="operation-tabs" aria-label="Room tools">{TOOLS.map(([id,label])=><button key={id} disabled={!!busy} aria-pressed={tool===id}
          onClick={()=>{setTool(id);setSelection(null);}}>{label}</button>)}</nav>
        <div ref={toolPanel} key={`${version}-${tool}`}>
          {tool==='style' && <><img className="current-room" src={current.image} alt="Current room"/>
            <StyleSelector image={current.image} busy={!!busy} onGenerate={fields=>apply('/generate',fields,fields.style || (fields.colorsOnly ? 'colors_only' : 'custom_style'))}
              onPreview={async(style,palette)=>{
                const p=palette?.prompt?{...palette,prompt:await translateToEnglish(palette.prompt)}:palette;
                return run('Generating one style preview…',request=>request('/preview-styles',{image:current.image,styles:[style],palette:p,model:genModel}));
              }}
              onUsePreview={(image,style)=>{if(!lock.current)commit({image},style);}}/></>}
          {tool==='furnish' && <FurnishRoom image={current.image} busy={!!busy} selection={selection} onSelect={setSelection}
            onFurnish={prompt=>apply('/furnish-room',{prompt,selection:requestSelection()},'furnish')}/>}
          {tool==='object' && <ObjectEditor image={current.image} regions={regions} selection={selection} busy={!!busy} onSelect={setSelection}
            onDetect={detect} onPoint={point} onEdit={(action,prompt)=>apply(action==='delete'?'/delete-object':'/edit-object',{selection:requestSelection(),prompt},action)}/>}
          {tool==='addobject' && <AddObjectFromPhoto busy={!!busy} onAdd={addObject}/>}
          {tool==='recolor' && <ObjectRecolor image={current.image} regions={regions} selection={selection} busy={!!busy} onSelect={setSelection}
            onDetect={detect} onPoint={point} onRecolor={recolorObject}/>}
        </div>
        {current!==original && <fieldset className="result-fieldset" disabled={!!busy}>
          <ResultView original={original.image} key={version} generated={current.image} style={current.label} onReset={reset}
            onNewStyle={()=>toolPanel.current?.scrollIntoView({behavior:'smooth'})} onUndo={undo} canUndo={!!before} onRegisterDownload={registerDownload}/>
        </fieldset>}
        {showHistory && <section className="tool-panel"><h2>Session history</h2><p>Up to eight results are kept in this session.</p><div className="tool-grid">
          {history.map(item=><button disabled={!!busy} key={item.id} onClick={()=>{setBefore(current);setCurrent(item);invalidate(false);setShowHistory(false);}}>
            <img className="history-image" src={item.image} alt={item.label}/><span>{item.label.replace(/_/g,' ')}</span></button>)}
        </div><button disabled={!!busy} onClick={()=>{setHistory([]);setShowHistory(false);}}>Clear history</button></section>}
      </>}
    </main>
  </div>;
}
export default function App(){return <ToastProvider><AppInner/></ToastProvider>;}
