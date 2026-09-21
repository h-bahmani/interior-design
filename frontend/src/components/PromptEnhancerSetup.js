import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getOpenRouterKey, setOpenRouterKey, isEnhanceEnabled, setEnhanceEnabled,
  getEnhanceModel, setEnhanceModel, DEFAULT_ENHANCE_MODEL,
} from '../utils/enhancePrompt';
import './BackendSetup.css';

export default function PromptEnhancerSetup({ onClose }) {
  const [enabled, setEnabled] = useState(isEnhanceEnabled());
  const [key, setKey] = useState(getOpenRouterKey());
  const [model, setModel] = useState(getEnhanceModel());

  const save = () => {
    const trimmedKey = key.trim();
    setOpenRouterKey(trimmedKey);
    setEnhanceModel(model);
    setEnhanceEnabled(enabled && !!trimmedKey);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div className="bsetup-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div className="bsetup-modal" onClick={e => e.stopPropagation()}
          initial={{ scale: 0.88, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.88, opacity: 0, y: 24 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}>
          <div className="bsetup-icon">✧</div>
          <h2 className="bsetup-title">AI Prompt Enhancer</h2>
          <p className="bsetup-desc">
            Optional. Rewrites what you type into more specific, vivid detail before it reaches
            the image model, using a chat model via your own OpenRouter account. Off by default —
            nothing changes unless you turn it on and add a key. What you see in the text field
            stays exactly as you typed it; only what gets sent for generation changes.
          </p>

          <div className="bsetup-modes">
            <button className={`bsetup-mode-btn ${!enabled ? 'active' : ''}`} onClick={() => setEnabled(false)}>
              <span className="bsetup-mode-label">Off</span>
            </button>
            <button className={`bsetup-mode-btn ${enabled ? 'active' : ''}`} onClick={() => setEnabled(true)}>
              <span className="bsetup-mode-label">On</span>
            </button>
          </div>

          {enabled && <>
            <div className="bsetup-input-wrap">
              <input className="bsetup-input" type="password" value={key} onChange={e => setKey(e.target.value)}
                placeholder="OpenRouter API key (sk-or-v1-…)" spellCheck={false} autoFocus />
            </div>
            <div className="bsetup-input-wrap">
              <input className="bsetup-input" type="text" value={model} onChange={e => setModel(e.target.value)}
                placeholder={DEFAULT_ENHANCE_MODEL} spellCheck={false} />
            </div>
            <p className="bsetup-desc" style={{ marginTop: -6, fontSize: '.76rem' }}>
              Free account, no card needed: <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: '#c9a84c' }}>openrouter.ai/keys</a>.
              The model above is free right now — OpenRouter's free-tier lineup changes, so if
              this one stops being free later, paste in a different <code>:free</code> model
              slug from <a href="https://openrouter.ai/models?max_price=0" target="_blank" rel="noreferrer" style={{ color: '#c9a84c' }}>their free-model list</a>.
              The key is stored only in this browser and sent straight to OpenRouter, never through our backend.
            </p>
          </>}

          <div className="bsetup-actions">
            <button className="bsetup-btn-connect" onClick={save}>Save</button>
            <button className="bsetup-btn-skip" onClick={onClose}>Cancel</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
