const KEY_STORAGE = 'interiorai_openrouter_key';
const ENABLED_STORAGE = 'interiorai_enhance_enabled';
const MODEL_STORAGE = 'interiorai_enhance_model';

// Verified free on OpenRouter as of writing (openrouter.ai/inclusionai/ling-3.0-flash-vl:free).
// Free-tier model availability/pricing there changes over time, so this is only a default —
// the user can point it at any other OpenRouter model slug from the settings panel.
export const DEFAULT_ENHANCE_MODEL = 'inclusionai/ling-3.0-flash-vl:free';

export const getOpenRouterKey = () => localStorage.getItem(KEY_STORAGE) || '';
export const setOpenRouterKey = key => key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE);
export const isEnhanceEnabled = () => localStorage.getItem(ENABLED_STORAGE) === '1';
export const setEnhanceEnabled = on => localStorage.setItem(ENABLED_STORAGE, on ? '1' : '0');
export const getEnhanceModel = () => localStorage.getItem(MODEL_STORAGE) || DEFAULT_ENHANCE_MODEL;
export const setEnhanceModel = m => localStorage.setItem(MODEL_STORAGE, (m || '').trim() || DEFAULT_ENHANCE_MODEL);

const SYSTEM_PROMPT = "You expand short interior-design prompts into vivid, concrete visual "
  + "detail (materials, colors, lighting, furniture style) for an AI image generator. Keep "
  + "the same scope and intent exactly -- never add a new room, structural changes, or "
  + "objects the user didn't ask for. Reply with ONLY the rewritten prompt: one paragraph, "
  + "no preamble, no quotes.";

// Same resilience pattern as translateToEnglish: best-effort, and any failure (feature off,
// no key, network error, rate limit) just falls back to the original text so a broken or
// unset key never blocks generation.
export async function enhancePrompt(text) {
  if (!isEnhanceEnabled() || !text?.trim()) return text;
  const key = getOpenRouterKey();
  if (!key) return text;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'InteriorAI',
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: getEnhanceModel(),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        max_tokens: 220,
      }),
    });
    if (!res.ok) return text;
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    return out || text;
  } catch {
    return text;
  }
}
