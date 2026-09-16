import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./BackendSetup.css";

const MODES = [
  {
    id: "colab",
    icon: "⚡",
    label: "Kaggle / Colab",
    desc: "Paste the API v2 notebook ngrok URL",
    placeholder: "https://xxxx-xxxx.ngrok-free.app",
    defaultVal: "",
  },
  {
    id: "local",
    icon: "💻",
    label: "Local Dev",
    desc: "Running Flask on your machine",
    placeholder: "http://localhost:7860",
    defaultVal: "http://localhost:7860",
  },
];

export default function BackendSetup({ onConnect }) {
  const saved = localStorage.getItem("interiorai_api_url") || "";
  const savedKey = localStorage.getItem("interiorai_connection_key") || "";
  const guessMode = saved.includes("localhost") ? "local" : "colab";

  const [mode, setMode] = useState(guessMode);
  const [url, setUrl] = useState(saved);
  const [connectionKey, setConnectionKey] = useState(savedKey);
  const [status, setStatus] = useState("idle"); // idle | testing | ok | error
  const [errorMsg, setErrorMsg] = useState("");

  const selectedMode = MODES.find(m => m.id === mode);

  const handleModeSwitch = (m) => {
    setMode(m.id);
    setUrl(m.defaultVal);
    setStatus("idle");
    setErrorMsg("");
  };

  const handleConnect = async () => {
    const clean = url.trim().replace(/\/$/, "");
    if (!clean) {
      setErrorMsg("Please enter a URL first.");
      return;
    }
    if (!clean.startsWith("http")) {
      setStatus("error");
      setErrorMsg("URL must start with http:// or https://");
      return;
    }
    setStatus("testing");
    setErrorMsg("");
    const key = connectionKey.trim();
    try {
      const res = await fetch(`${clean}/capabilities`, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "ngrok-skip-browser-warning": "true",
          ...(key ? { Authorization: "Bearer " + key } : {}),
        },
      });
      const data = await res.json();
      if (res.ok && data.api_version === 2) {
        localStorage.setItem("interiorai_api_url", clean);
        localStorage.setItem("interiorai_connection_key", key);
        setStatus("ok");
        setTimeout(() => onConnect(clean, data), 700);
      } else if (res.status === 401) {
        throw new Error("Connection key required or incorrect.");
      } else {
        throw new Error("API v2 is required");
      }
    } catch (e) {
      setStatus("error");
      setErrorMsg(
        e.message === "Connection key required or incorrect."
          ? e.message
          : mode === "colab"
          ? "Could not connect to API v2. Run the updated notebook cells and check the URL and connection key."
          : "Could not reach local Flask. Run: python app.py in the backend folder."
      );
    }
  };

  const handleSkip = () => {
    const clean = url.trim().replace(/\/$/, "") || "http://localhost:7860";
    localStorage.setItem("interiorai_api_url", clean);
    localStorage.setItem("interiorai_connection_key", connectionKey.trim());
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
                If the owner has Colab running, this page <strong>auto-connects</strong> — just wait a moment.
              </div>
              <div className="bsetup-step"><span className="bsetup-step-n">1</span>Run all cells in your Colab notebook</div>
              <div className="bsetup-step"><span className="bsetup-step-n">2</span>The app connects automatically via Firebase</div>
              <div className="bsetup-step"><span className="bsetup-step-n">3</span>Or paste the ngrok URL below to connect manually</div>
            </motion.div>
          )}

          {/* URL input */}
          <div className="bsetup-input-wrap">
            <input
              className={`bsetup-input ${status === "error" ? "bsetup-input-error" : status === "ok" ? "bsetup-input-ok" : ""}`}
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setStatus("idle"); setErrorMsg(""); }}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              placeholder={selectedMode.placeholder}
              spellCheck={false}
              autoFocus={mode === "colab"}
            />
            {status === "ok" && <span className="bsetup-check">✓</span>}
          </div>

          {/* Connection key — CONNECTION_KEY printed by the notebook's last cell */}
          <div className="bsetup-input-wrap">
            <input
              className="bsetup-input"
              type="text"
              value={connectionKey}
              onChange={e => { setConnectionKey(e.target.value); setStatus("idle"); setErrorMsg(""); }}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              placeholder="Connection key (from the notebook's last cell)"
              spellCheck={false}
            />
          </div>

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
