import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./BackendSetup.css";

const MODES = [
  {
    id: "colab",
    icon: "⚡",
    label: "Google Colab",
    desc: "Register your running Colab notebook with the local backend",
  },
  {
    id: "local",
    icon: "💻",
    label: "Local Dev",
    desc: "Running Flask on your machine (Replicate or no AI backend)",
  },
];

const DEFAULT_LOCAL_URL = "http://localhost:5000";

export default function BackendSetup({ onConnect }) {
  const saved = localStorage.getItem("interiorai_api_url") || DEFAULT_LOCAL_URL;
  const savedColab = localStorage.getItem("interiorai_colab_url") || "";

  const [mode, setMode] = useState(savedColab ? "colab" : "local");
  const [localUrl, setLocalUrl] = useState(saved);
  const [colabUrl, setColabUrl] = useState(savedColab);
  const [connectionKey, setConnectionKey] = useState("");
  const [status, setStatus] = useState("idle"); // idle | testing | ok | error
  const [errorMsg, setErrorMsg] = useState("");

  const selectedMode = MODES.find(m => m.id === mode);

  const handleModeSwitch = (m) => {
    setMode(m.id);
    setStatus("idle");
    setErrorMsg("");
  };

  const handleConnect = async () => {
    const cleanLocal = (localUrl.trim() || DEFAULT_LOCAL_URL).replace(/\/$/, "");
    if (!cleanLocal.startsWith("http")) {
      setStatus("error");
      setErrorMsg("Local backend URL must start with http:// or https://");
      return;
    }

    const cleanColab = colabUrl.trim().replace(/\/$/, "");
    if (mode === "colab" && !cleanColab) {
      setStatus("error");
      setErrorMsg("Paste the ngrok URL printed by the Colab notebook.");
      return;
    }

    setStatus("testing");
    setErrorMsg("");
    try {
      if (mode === "colab") {
        const setRes = await fetch(`${cleanLocal}/set-colab-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanColab, connection_key: connectionKey.trim() }),
          signal: AbortSignal.timeout(8000),
        });
        if (!setRes.ok) {
          throw new Error("register-failed");
        }
      }

      const res = await fetch(`${cleanLocal}/health`, {
        signal: AbortSignal.timeout(8000),
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const data = await res.json();
      if (data.status === "ok" || data.colab_connected !== undefined) {
        localStorage.setItem("interiorai_api_url", cleanLocal);
        if (mode === "colab") {
          localStorage.setItem("interiorai_colab_url", cleanColab);
        }
        setStatus("ok");
        setTimeout(() => onConnect(cleanLocal, data), 700);
      } else {
        throw new Error("Unexpected response");
      }
    } catch {
      setStatus("error");
      setErrorMsg(
        mode === "colab"
          ? "Could not reach the local Flask backend, or it could not reach Colab. Make sure `python app.py` is running locally and all Colab cells finished."
          : "Could not reach local Flask. Run: python app.py in the backend folder."
      );
    }
  };

  const handleSkip = () => {
    const clean = localUrl.trim().replace(/\/$/, "") || DEFAULT_LOCAL_URL;
    localStorage.setItem("interiorai_api_url", clean);
    onConnect(clean, null);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="bsetup-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bsetup-modal"
          initial={{ scale: 0.88, opacity: 0, y: 24 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.88, opacity: 0, y: 24 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
        >
          <div className="bsetup-icon">◈</div>
          <h2 className="bsetup-title">Connect AI Backend</h2>

          {/* Mode toggle */}
          <div className="bsetup-modes">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`bsetup-mode-btn ${mode === m.id ? "active" : ""}`}
                onClick={() => handleModeSwitch(m)}
              >
                <span className="bsetup-mode-icon">{m.icon}</span>
                <span className="bsetup-mode-label">{m.label}</span>
              </button>
            ))}
          </div>

          <p className="bsetup-desc">{selectedMode.desc}</p>

          {/* Colab steps hint */}
          {mode === "colab" && (
            <motion.div
              className="bsetup-steps"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
            >
              <div className="bsetup-auto-badge">
                <span className="bsetup-auto-icon">⚡</span>
                The Colab notebook prints a <strong>BACKEND_URL</strong> and a <strong>CONNECTION_KEY</strong> in its last cell.
              </div>
              <div className="bsetup-step"><span className="bsetup-step-n">1</span>Run all cells in your Colab notebook (T4 GPU)</div>
              <div className="bsetup-step"><span className="bsetup-step-n">2</span>Paste BACKEND_URL and CONNECTION_KEY below</div>
              <div className="bsetup-step"><span className="bsetup-step-n">3</span>The local Flask backend (running on your machine) proxies requests to Colab</div>
            </motion.div>
          )}

          {/* Local backend URL — always required, this is what the app actually talks to */}
          <div className="bsetup-input-wrap">
            <label className="bsetup-label">Local backend URL</label>
            <input
              className={`bsetup-input ${status === "error" ? "bsetup-input-error" : status === "ok" ? "bsetup-input-ok" : ""}`}
              type="url"
              value={localUrl}
              onChange={e => { setLocalUrl(e.target.value); setStatus("idle"); setErrorMsg(""); }}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              placeholder={DEFAULT_LOCAL_URL}
              spellCheck={false}
            />
            {status === "ok" && <span className="bsetup-check">✓</span>}
          </div>

          {mode === "colab" && (
            <>
              <div className="bsetup-input-wrap">
                <label className="bsetup-label">Colab BACKEND_URL (ngrok)</label>
                <input
                  className="bsetup-input"
                  type="url"
                  value={colabUrl}
                  onChange={e => { setColabUrl(e.target.value); setStatus("idle"); setErrorMsg(""); }}
                  onKeyDown={e => e.key === "Enter" && handleConnect()}
                  placeholder="https://xxxx-xxxx.ngrok-free.app"
                  spellCheck={false}
                  autoFocus
                />
              </div>
              <div className="bsetup-input-wrap">
                <label className="bsetup-label">CONNECTION_KEY</label>
                <input
                  className="bsetup-input"
                  type="text"
                  value={connectionKey}
                  onChange={e => { setConnectionKey(e.target.value); setStatus("idle"); setErrorMsg(""); }}
                  onKeyDown={e => e.key === "Enter" && handleConnect()}
                  placeholder="printed next to BACKEND_URL"
                  spellCheck={false}
                />
              </div>
            </>
          )}

          {errorMsg && (
            <motion.p
              className="bsetup-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {errorMsg}
            </motion.p>
          )}

          <div className="bsetup-actions">
            <button
              className="bsetup-btn-connect"
              onClick={handleConnect}
              disabled={status === "testing" || status === "ok"}
            >
              {status === "testing" ? (
                <><span className="bsetup-spinner" /> Testing connection…</>
              ) : status === "ok" ? (
                "✓ Connected!"
              ) : (
                "Connect"
              )}
            </button>
            <button className="bsetup-btn-skip" onClick={handleSkip}>
              Skip for now
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
