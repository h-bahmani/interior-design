const ENV_URL = process.env.REACT_APP_API_URL || "http://localhost:7860";
export function getApiUrl() {
  const saved = localStorage.getItem("interiorai_api_url");
  const local = ['localhost','127.0.0.1'].includes(window.location.hostname);
  const url = saved || ENV_URL;
  if (!local && /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) return '';
  return url.replace(/\/+$/, '');
}
export function getConnectionKey() {
  return localStorage.getItem("interiorai_connection_key") || "";
}
export function apiHeaders(extra = {}) {
  const key = getConnectionKey();
  return {
    "ngrok-skip-browser-warning": "true",
    ...(key ? { Authorization: "Bearer " + key } : {}),
    ...extra,
  };
}
export const API_URL = ENV_URL;
