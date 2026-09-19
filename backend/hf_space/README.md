---
title: InteriorAI Backend
emoji: 🛋️
colorFrom: yellow
colorTo: gray
sdk: gradio
sdk_version: 5.9.1
app_file: app.py
pinned: false
---

# InteriorAI backend (Hugging Face Spaces + ZeroGPU)

This is the AI backend for [InteriorAI](https://github.com/h-bahmani/interior-design),
running on Hugging Face's free ZeroGPU tier instead of a Colab notebook —
same models and pipeline, but a **permanent URL** that doesn't need to be
reconnected every few hours.

## One-time setup after creating this Space

1. **Hardware**: in this Space's *Settings* tab, set Hardware to **ZeroGPU**.
   (Requires a Hugging Face account with a verified email that's at least
   30 days old — a brand new account cannot host a ZeroGPU Space.)
2. **Secret**: in *Settings → Variables and secrets*, add a secret named
   `CONNECTION_KEY` with any long random value (e.g. generate one with
   `python -c "import secrets; print(secrets.token_urlsafe(32))"`). This
   replaces the notebook's `CONNECTION_KEY` that used to regenerate on
   every restart — here it's fixed, so the frontend only needs it once.
3. Wait for the Space to finish building (first build downloads ~15GB of
   model weights, expect 10-20 minutes; every build after that is fast
   since the weights are cached).
4. Copy this Space's URL (`https://<your-username>-<space-name>.hf.space`)
   and the `CONNECTION_KEY` you set into the frontend's "Connect AI Backend"
   modal, exactly like the old ngrok URL — except this one never changes,
   so you only have to do it once, ever.

## Free tier limits

- **5 minutes of GPU time per day** (resets 24h after first use). Model
  loading at startup doesn't count against this — only time spent inside
  an actual generation call does. This is enough for the app's own testing
  and a live demo, but not for extended development iteration.
- Only 2 ZeroGPU Spaces per free account.

## Local testing without ZeroGPU

`spaces.GPU` is a no-op outside a real ZeroGPU environment, so
`python app.py` also runs locally on a CUDA GPU if you have one (e.g. for
testing changes before pushing here) — the decorator just becomes a
pass-through.
