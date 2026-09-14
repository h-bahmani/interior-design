const ENV_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export function getApiUrl() {
  return localStorage.getItem("interiorai_api_url") || ENV_URL;
}

// Headers required for every request — ngrok intercepts browser fetches unless
// this header is present, so we always include it (harmless for non-ngrok URLs).
export function apiHeaders(extra = {}) {
  return {
    "ngrok-skip-browser-warning": "true",
    ...extra,
  };
}

export const API_URL = ENV_URL;

// True for http://localhost:* or http://127.0.0.1:* — the local Flask backend.
export function isLocalUrl(url) {
  return typeof url === "string" && (url.includes("localhost") || url.includes("127.0.0.1"));
}

// FileReader.readAsDataURL() (used by Upload.js) yields "data:image/jpeg;base64,XXXX".
// Routes that send raw base64 straight to the backend (not through /upload) need
// just the XXXX part — the backend/Colab side decodes with base64.b64decode(),
// which silently mangles the "data:image/...;base64," prefix into garbage bytes.
export function stripDataUrlPrefix(dataUrl) {
  if (typeof dataUrl !== "string") return dataUrl;
  const commaIndex = dataUrl.indexOf(",");
  return dataUrl.startsWith("data:") && commaIndex !== -1
    ? dataUrl.slice(commaIndex + 1)
    : dataUrl;
}
