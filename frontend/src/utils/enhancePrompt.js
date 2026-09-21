import { apiRequest } from '../services/api';

// Calls the backend's own /enhance-prompt route -- never OpenRouter directly from the
// browser, so the API key lives server-side only (a Colab Secret / HF Space secret) and
// is never exposed to anyone opening devtools. Same best-effort pattern as
// translateToEnglish: a missing key server-side, a network error, or a timeout all just
// fall back to the original text, so this never blocks generation.
export async function enhancePrompt(base, text) {
  if (!base || !text?.trim()) return text;
  try {
    const data = await apiRequest(base, '/enhance-prompt', { prompt: text }, { signal: AbortSignal.timeout(12000) });
    return data?.prompt?.trim() || text;
  } catch {
    return text;
  }
}
