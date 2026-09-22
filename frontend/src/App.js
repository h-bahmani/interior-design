import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import Auth from './components/Auth';
import BackendSetup from './components/BackendSetup';
import Upload from './components/Upload';
import StyleSelector, { STYLES } from './components/StyleSelector';
import FurnishRoom from './components/FurnishRoom';
import ObjectEditor from './components/ObjectEditor';
import AddObjectFromPhoto from './components/AddObjectFromPhoto';
import ObjectRecolor from './components/ObjectRecolor';
import ResultView from './components/ResultView';
import { ToastProvider, useToast } from './components/Toast';
import { getApiUrl } from './config';
import { apiRequest, imageSource } from './services/api';
import { translateToEnglish } from './utils/translate';
import { enhancePrompt } from './utils/enhancePrompt';
import { downscaleImage } from './utils/downscaleImage';
import './App.css';
import './Workflow.css';

const TOOLS = [['style',`${STYLES.length} Design Styles`],['furnish','Furnish Rooms'],['object','Object Editing / Deleting'],['addobject','Add Object From Photo'],['recolor','Object Recolor']];
function AppInner() {
  const toast=useToast();
  const [user,setUser]=useState(null), [authChecked,setAuthChecked]=useState(false);
  const [apiUrl,setApiUrl]=useState(getApiUrl), [setup,setSetup]=useState(false), [connection,setConnection]=useState('checking');
  const [promptEnhance,setPromptEnhance]=useState(false);
  const [enhancedPrompt,setEnhancedPrompt]=useState(null);
  const [current,setCurrent]=useState(null), [original,setOriginal]=useState(null), [before,setBefore]=useState(null);
  const [history,setHistory]=useState([]), [showHistory,setShowHistory]=useState(false), [showMenu,setShowMenu]=useState(false);
  const menuRef=useRef(null);
  const [tool,setTool]=useState('style'), [regions,setRegions]=useState([]), [selection,setSelection]=useState(null);
  const [busy,setBusy]=useState(''), [version,setVersion]=useState(0), [session,setSession]=useState(0);
  const [genModel,setGenModel]=useState(()=>localStorage.getItem('interiorai_gen_model')||'fast');
  const changeModel=m=>{setGenModel(m);localStorage.setItem('interiorai_gen_model',m);};
  const lock=useRef(false), revision=useRef(0), pending=useRef(null), activeUrl=useRef(apiUrl), download=useRef(null), toolPanel=useRef(null);
  const regionsSize=useRef(null);
  // clearRegions=false for in-place edits (commit/undo/restore/history) — keeps
  // the detected region list valid across a chain of edits so you don't have to
  // re-run detection after every single change, and also keeps the current
  // selection so a generation doesn't wipe out what produced it.
  //
  // freshStart is a SEPARATE concern from clearRegions: it remounts the tool
  // panel (bumping `session`), which wipes each tool's own local state -- typed
  // prompt, chosen mode, etc. That's only appropriate for an actual fresh start
  // (new photo, new login, backend URL change), never for "the regions/mask
  // are now stale" (a style change, restore original) -- those still need
  // clearRegions=true, but conflating that with a full panel remount used to
  // silently erase whatever the user had just typed right after every single
  // style generation, which is a much bigger loss than re-selecting a region.
  const invalidate=useCallback((clearRegions=true, freshStart=clearRegions)=>{
    revision.current+=1; setVersion(revision.current);
    if(clearRegions){setRegions([]);setSelection(null);regionsSize.current=null;}
    if(freshStart)setSession(s=>s+1);
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
      if(!cancelled){setConnection(data.api_version===2?'connected':'incompatible');setPromptEnhance(!!data.prompt_enhance);}
    }).catch(()=>{if(!cancelled)setConnection('offline');});
    return ()=>{cancelled=true;clearTimeout(timeout);controller.abort();};
  },[apiUrl,busy]);
  // Local state owns the displayed image. Send its bytes, never a global "last upload".
  // PNG returned by /upload is canonical, so region hashes match later requests.
  const run=async(label,work,timeoutMs=180000)=>{
    if(lock.current)return null;
    lock.current=true;setBusy(label);
    const controller=new AbortController();pending.current=controller;
    // Browser fetch() has no built-in timeout — if Colab/ngrok hangs mid-request
    // (a dropped tunnel that never closes the connection), this would otherwise
    // leave busy stuck forever, disabling every button with no way to recover
    // short of a page refresh. Default covers even slow Quality/SDXL generations;
    // batch calls (e.g. previewing many styles at once) pass a longer one.
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    const sourceRevision=revision.current, base=activeUrl.current;
    const request=(path,body)=>apiRequest(base,path,body,{signal:controller.signal});
    try {
      const result=await work(request);
      if(result?.image !== undefined) imageSource(result.image,result.mime_type);
      if(controller.signal.aborted || sourceRevision!==revision.current || base!==activeUrl.current)return null;
      return result;
    } catch(e) {
      if(e.name==='AbortError' && controller.signal.aborted && sourceRevision===revision.current)
        toast(`Request timed out after ${Math.round(timeoutMs/60000)} minute(s). Check the Colab notebook is still running.`,'error',7000);
      else if(e.name!=='AbortError')toast(e.message || 'Operation failed.','error',6500);
      return null;
    } finally {clearTimeout(timeout);if(pending.current===controller)pending.current=null;lock.current=false;setBusy('');}
  };
  // clearRegions=true only for a full style change (/generate): that redraws the whole
  // room via Img2Img, so a previously detected object's exact position/shape can shift
  // enough that its old mask no longer lands on the same thing -- applying, say, a
  // material change through a now-stale mask could paint over whatever's actually
  // there now (reported: "changed the table's material, the table got wiped out").
  // Targeted edits (recolor, texture, edit/delete one object, furnish, add object)
  // don't redraw the room, so their masks stay valid and regions keep persisting.
  // freshStart is always false here -- a style change needs clearRegions, not a full
  // tool-panel remount (see invalidate's own comment for why those are now separate).
  // "Use this preview" commits a bare {image} with no width/height (/preview-styles'
  // own response never carried them) -- that left `current.width` permanently
  // undefined, which made requestSelection()'s stale-mask guard below misfire on
  // every single later action, forever, since undefined!==<any real number> (reported:
  // "re-detected, still blocked, every time"). A style preview's output is resized to
  // the original image's exact dimensions same as any other generation, so falling
  // back to the outgoing current's width/height here is exact, not a guess.
  const commit=(data,label,clearRegions=false)=>{
    const next={image:imageSource(data.image,data.mime_type),image_id:data.image_id,label,
      width:data.width??current?.width,height:data.height??current?.height};
    setBefore(current);setCurrent(next);
    setHistory(h=>[{...next,id:Date.now()+Math.random()},...h].slice(0,8));
    invalidate(clearRegions,false);
    if(data.warning)toast(data.warning,'info',7000);
    else if(clearRegions)toast('Style changed — re-run "Detect objects" before editing a specific object again.','info',6000);
    else toast('Changes applied.','success');
  };
  const upload=async file=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Choose JPG, PNG or WEBP.','error');return;}
    if(file.size>24*1024*1024){toast('Choose an image smaller than 24 MB.','error');return;}
    let sized;
    try{sized=await downscaleImage(file);}
    catch{toast('Could not read this image file.','error');return;}
    const data=await run('Uploading room…',request=>{const form=new FormData();form.append('image',sized);return request('/upload',form);});
    if(data){const next={image:imageSource(data.image,data.mime_type),image_id:data.image_id,label:'original',width:data.width,height:data.height};
      setCurrent(next);setOriginal(next);setBefore(null);setHistory([]);invalidate();}
  };
  // Only customPrompt/prompt go through enhancePrompt() -- extraDetails pairs with a
  // full style prompt that's often already 63-74 of CLIP's 77-token budget, so there's
  // rarely room left for an enhanced version of it anyway (translation alone is enough).
  // The rewritten text used to only show as a toast, which had already faded by the
  // time a slow generation finished -- enhancedPrompt keeps it on screen (see the
  // note rendered next to the result below) for as long as it's still the one in effect.
  const enhanceAndToast=async text=>{
    const out=await enhancePrompt(activeUrl.current,text);
    const changed=out && out!==text;
    setEnhancedPrompt(changed?out:null);
    if(changed)toast(`Prompt enhanced: "${out}"`,'info',6000);
    return out;
  };
  const apply=async(path,fields,label)=>{
    if(!current)return;
    setEnhancedPrompt(null);
    const translated={...fields};
    if(translated.customPrompt)translated.customPrompt=await enhanceAndToast(await translateToEnglish(translated.customPrompt));
    if(translated.prompt)translated.prompt=await enhanceAndToast(await translateToEnglish(translated.prompt));
    if(translated.extraDetails)translated.extraDetails=await translateToEnglish(translated.extraDetails);
    if(translated.palette?.prompt)translated.palette={...translated.palette,prompt:await translateToEnglish(translated.palette.prompt)};
    const data=await run('Applying your changes…',request=>request(path,{image:current.image,model:genModel,...translated}));
    if(data)commit(data,label,path==='/generate');
  };
  const addObject=async(objectImage,prompt)=>{
    if(!current)return;
    const sel=requestSelection();
    if(sel===undefined)return; // requestSelection already toasted why
    setEnhancedPrompt(null);
    const translatedPrompt=await enhanceAndToast(await translateToEnglish(prompt));
    const data=await run('Adding the object…',request=>request('/add-object',{room_image:current.image,object_image:objectImage,prompt:translatedPrompt,selection:sel,model:genModel}));
    if(data)commit(data,'add_object');
  };
  // A region_id is only valid against the image it was detected on (the
  // backend indexes regions by a hash of that image's bytes). Since regions
  // now survive across edits (see invalidate above), a region picked before
  // an earlier edit would otherwise be rejected as "expired" on the next one —
  // sending its actual mask instead sidesteps that lookup entirely.
  //
  // But a cached mask is only meaningful against an image of the SAME size it
  // was cut from (reported: an edit against a leftover selection failed with a
  // raw backend "mask dimensions must match image" error). Every backend result
  // already reports its width/height, and detect()/point() record the size
  // regions were found against -- if the two ever disagree, the mask is
  // definitely stale, so this clears it and tells the user to re-detect instead
  // of sending a request that can only fail. Returns undefined (not null) to
  // distinguish "this selection is stale, abort" from "no selection was made,
  // which for furnish just means the default full-room area."
  //
  // Only compares when both sizes are actually known numbers -- an unknown size
  // must never read as "mismatched," since that fails closed and blocks the
  // operation forever with no way to recover (this exact bug already happened
  // once: a commit path that didn't report width/height made current.width
  // permanently undefined, so undefined!==<real number> misfired on every
  // later action even after re-detecting).
  const requestSelection=(sel=selection)=>{
    if(!sel?.region_id)return sel;
    if(regionsSize.current && current && typeof current.width==='number' && typeof current.height==='number' &&
      (current.width!==regionsSize.current.width || current.height!==regionsSize.current.height)){
      setRegions([]);setSelection(null);regionsSize.current=null;
      toast('Detected areas no longer match the current image — click "Detect objects again" first.','error',7000);
      return undefined;
    }
    const region=regions.find(item=>item.id===sel.region_id);
    return region?.mask ? {mask:region.mask} : sel;
  };
  // Runs several operations back-to-back against one image, each one working on the
  // previous step's output — used by Object Recolor to apply color+texture together and/or
  // to repeat the same change across several selected areas in a single "Apply".
  const applySteps=async(steps,label)=>{
    if(!current || !steps?.length)return;
    const resolved=steps.map(step=>({...step,selection:requestSelection(step.selection)}));
    if(resolved.some(s=>s.selection===undefined))return; // requestSelection already toasted why
    const data=await run('Applying your changes…',async request=>{
      let img=current.image,last=null;
      for(const step of resolved){
        last=await request(step.path,{image:img,model:genModel,selection:step.selection,...step.fields});
        img=last.image;
      }
      return last;
    },180000*Math.max(1,steps.length));
    if(data)commit(data,label);
  };
  const detect=async()=>{
    const data=await run('Finding objects and surfaces…',request=>request('/detect-objects',{image:current.image}));
    if(data){
      setRegions(data.regions || []);setSelection(null);
      regionsSize.current=data.regions?.length ? {width:data.width,height:data.height} : null;
      if(!data.regions?.length)toast('No areas found. Try clicking an area or drawing a rectangle.','info');
    }
  };
  const point=async coordinates=>{
    const data=await run('Finding the selected area…',request=>request('/segment-point',{image:current.image,point:coordinates}));
    if(data){
      setRegions(r=>[...r,{id:data.region_id,label:'Selected area',mask:data.mask,bbox:[0,0,1,1]}]);
      setSelection({region_id:data.region_id});
      regionsSize.current={width:data.width,height:data.height};
    }
  };
  const undo=()=>{if(!before || lock.current)return;setCurrent(before);setBefore(null);invalidate(false);};
  const reset=()=>{if(lock.current)return;download.current=null;setCurrent(null);setOriginal(null);setBefore(null);setHistory([]);invalidate();};
  useEffect(()=>{
    const handler=e=>{
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable)return;
      if(e.key==='Escape'){setShowHistory(false);setShowMenu(false);}
      if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();}
      if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();download.current?.();}
      if((e.ctrlKey||e.metaKey)&&e.key==='h'){e.preventDefault();setShowHistory(v=>!v);}
    };
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
    // Handler intentionally follows the currently available undo snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[before]);
  // Closes the header menu on an outside click, without a full-screen backdrop overlay.
  useEffect(()=>{
    if(!showMenu)return;
    const onClick=e=>{if(menuRef.current && !menuRef.current.contains(e.target))setShowMenu(false);};
    document.addEventListener('mousedown',onClick);
    return()=>document.removeEventListener('mousedown',onClick);
  },[showMenu]);
  const registerDownload=useCallback(fn=>{download.current=fn;},[]);
  if(!authChecked)return null;
  if(!user)return <Auth onLogin={()=>{}} />;
  return <div className="app">
    {setup && <BackendSetup onConnect={url=>{changeUrl(url);setSetup(false);}} />}
    <div className="ambient-bg" aria-hidden="true"><div className="orb orb-1"/><div className="orb orb-2"/></div>
    <header className="header"><div className="header-inner">
      <button className="logo" disabled={!!busy} onClick={reset}><span className="logo-text">Interior<em>AI</em></span></button>
      <div className="model-toggle" role="group" aria-label="Generation quality">
        <button aria-pressed={genModel==='fast'} disabled={!!busy} onClick={()=>changeModel('fast')} title="SD1.5 — quicker">Fast</button>
        <button aria-pressed={genModel==='quality'} disabled={!!busy} onClick={()=>changeModel('quality')} title="SDXL — slower, more photorealistic">Quality</button>
      </div>
      <div className="header-menu" ref={menuRef}>
        <button className="hamburger-btn" aria-haspopup="true" aria-expanded={showMenu} aria-label="Menu" onClick={()=>setShowMenu(v=>!v)}>
          <span className={`conn-dot conn-${connection}`} aria-hidden="true"/>
          <span className="hamburger-bars" aria-hidden="true"><span/><span/><span/></span>
        </button>
        {showMenu && <div className="header-dropdown" role="menu">
          <span className="header-dropdown-user">{user.displayName || user.email}</span>
          <button role="menuitem" disabled={!!busy} onClick={()=>{setSetup(true);setShowMenu(false);}}>Connection: {connection}</button>
          <button role="menuitem" disabled={!!busy || !history.length} onClick={()=>{setShowHistory(v=>!v);setShowMenu(false);}}>History ({history.length})</button>
          <span className="header-dropdown-status" title="Set up on the backend (Colab/Kaggle Secrets) — nothing to configure here">AI Prompt Enhancer: {promptEnhance?'On':'Off'}</span>
          <button role="menuitem" disabled={!!busy} onClick={()=>signOut(auth)}>Sign Out</button>
        </div>}
      </div>
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
          <button disabled={!!busy || current===original} onClick={()=>{setBefore(current);setCurrent(original);invalidate(true,false);}}>Restore original</button></div>
        {/* Switching tools used to always clear the selection, even though `regions`
            itself survives the switch -- so picking an object in Object Editing, then
            deciding to recolor that SAME object instead, silently lost the pick and
            made it look like the tool had "forgotten" the object it had just detected.
            The selection is only actually invalidated by a fresh detect() (new region
            ids) or a real style regeneration (invalidate(true), which already clears
            it) -- neither of those is "the user clicked a different tab." */}
        <nav className="operation-tabs" aria-label="Room tools">{TOOLS.map(([id,label])=><button key={id} disabled={!!busy} aria-pressed={tool===id}
          onClick={()=>{setTool(id);setEnhancedPrompt(null);}}>{label}</button>)}</nav>
        <div ref={toolPanel} key={`${session}-${tool}`}>
          {tool==='style' && <><img className="current-room" src={current.image} alt="Current room"/>
            <StyleSelector image={current.image} busy={!!busy} onGenerate={fields=>apply('/generate',fields,fields.style || (fields.colorsOnly ? 'colors_only' : 'custom_style'))}
              onPreview={async(style,palette)=>{
                const p=palette?.prompt?{...palette,prompt:await translateToEnglish(palette.prompt)}:palette;
                return run('Generating one style preview…',request=>request('/preview-styles',{image:current.image,styles:[style],palette:p,model:genModel}));
              }}
              onUsePreview={(image,style)=>{if(!lock.current)commit({image},style,true);}}
              onExploreAll={async(palette,styleIds)=>{
                const p=palette?.prompt?{...palette,prompt:await translateToEnglish(palette.prompt)}:palette;
                // Scales with how many styles were picked — batching drafts still
                // takes real GPU time per style, just less than a full generation.
                const timeoutMs=60000+styleIds.length*25000;
                return run('Sketching quick previews…',request=>request('/preview-styles',{image:current.image,styles:styleIds,palette:p,model:genModel,draft:true}),timeoutMs);
              }}/></>}
          {tool==='furnish' && <FurnishRoom image={current.image} busy={!!busy} selection={selection} onSelect={setSelection}
            onFurnish={(prompt,libraryImage)=>{
              // libraryImage set = "From Library" mode: place this exact catalog item,
              // same underlying call as Add Object From Photo, just sourced from our
              // built-in library instead of a user upload.
              if(libraryImage)return addObject(libraryImage,prompt);
              const sel=requestSelection();if(sel!==undefined)apply('/furnish-room',{prompt,selection:sel},'furnish');
            }}/>}
          {tool==='object' && <ObjectEditor image={current.image} regions={regions} selection={selection} busy={!!busy} onSelect={setSelection}
            onDetect={detect} onPoint={point} onEdit={(action,prompt)=>{const sel=requestSelection();if(sel!==undefined)apply(action==='delete'?'/delete-object':'/edit-object',{selection:sel,prompt},action);}}/>}
          {tool==='addobject' && <AddObjectFromPhoto image={current.image} selection={selection} onSelect={setSelection} busy={!!busy} onAdd={addObject}/>}
          {tool==='recolor' && <ObjectRecolor image={current.image} regions={regions} selection={selection} busy={!!busy} onSelect={setSelection}
            onDetect={detect} onPoint={point} onApply={steps=>applySteps(steps,'recolor')}/>}
        </div>
        {/* Lives outside the tool panel above (which remounts on a style change, wiping
            that tool's own state) so the rewritten prompt stays visible next to the
            result it actually produced, instead of vanishing the moment a style
            generation succeeds. */}
        {enhancedPrompt && <p className="field-hint enhanced-prompt-note">AI-rewritten prompt sent to the model: "{enhancedPrompt}"</p>}
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
