const PERSIAN_RE = /[؀-ۿ]/;

// SD/SDXL/CLIP are trained almost entirely on English captions — Persian text
// typed into a prompt field gets tokenized poorly and mostly ignored, which is
// why results skip whatever the Persian part asked for. Auto-translating to
// English before it reaches the model fixes that without asking the user to
// type in English themselves. Uses the free, unofficial Google Translate
// endpoint (no API key, no budget) — best-effort: falls back to the original
// text on any failure so a translation hiccup never blocks generation.
export async function translateToEnglish(text) {
  if (!text || !PERSIAN_RE.test(text)) return text;
  try {
    const res = await fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=fa&tl=en&dt=t&q=" +
        encodeURIComponent(text),
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return text;
    const data = await res.json();
    const translated = (data?.[0] || []).map(chunk => chunk[0]).join("");
    return translated.trim() || text;
  } catch {
    return text;
  }
}
