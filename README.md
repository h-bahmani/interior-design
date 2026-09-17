# InteriorAI

> Transform any room photo into a professionally redesigned space using AI.

Started from a teammate's project ([AlirezaGfr98/Ai_interior_Designer](https://github.com/AlirezaGfr98/Ai_interior_Designer), kept here as the `upstream` remote). This repo tracks my own work on top of it — see **[My Contribution](#my-contribution)** below for exactly what's mine versus the shared baseline.

---

## What It Does

Upload a room photo, then:
- Apply one of 16 design styles, or describe your own, or just change the color palette without touching the style
- Add a specific object from a reference photo (not a text description — the actual item)
- Edit, delete, or recolor individual detected objects
- Furnish an empty area with new items

The room's structure (walls, windows, doors, layout) stays intact throughout — every generation is grounded in the real photo via ControlNet + Img2Img, not built from scratch.

---

## Features

| Feature | Description |
|---|---|
| **16 Design Styles** | Minimalist, Industrial, Cyberpunk, Modern Luxury, Scandinavian, Mid-Century, Japanese Zen, Bohemian, Art Deco, Coastal, French Country, Rustic Farmhouse, Contemporary Glam, Dark Academia, Tropical Modern, Brutalist |
| **Fast Preview Gallery** | Low-res, ~10x faster drafts of chosen styles side by side, to pick a direction before spending full generation time |
| **Colors Only mode** | Change just the wall/decor colors — layout and furniture untouched, no style bias applied |
| **Color Palettes** | 8 presets + custom color picker, usable with a style or standalone |
| **Add Object From Photo** | Insert a specific item from a reference image (IP-Adapter), not a text guess |
| **Object Edit / Delete / Recolor** | Click-to-select or draw a region; edit with a text prompt, remove cleanly (LaMa), or recolor exactly (pixel-level, no model) |
| **Fast / Quality toggle** | SD1.5 (quick) or SDXL (slower, more photorealistic) per generation |
| **Furnish Room** | Add furniture into a selected area or the room's lower half by default |
| **History, Undo, Restore Original** | Session-local, up to 8 results |

---

## My Contribution

The teammate's baseline (and a later rewrite they pushed) provided a genuinely good architecture: region/mask-based selection (`region_id`/`mask`/`bbox`/`point`), image storage by ID, and combined YOLO+SAM+SegFormer detection. I kept that and built the following on top of it:

- **Dual-model system** — SD1.5 (fast) and SDXL (quality), lazily loaded so only one is ever resident in GPU memory at a time, with a Fast/Quality toggle in the UI
- **Photorealism checkpoints** — swapped the vanilla base models for community fine-tunes (Realistic Vision for SD1.5, Juggernaut XL for SDXL)
- **Fixed the core generation bug** — the pipeline was generating from the Canny edge map alone, never the real photo; switched to Img2Img so the model actually starts from real pixels
- **Add Object From Photo** — new end-to-end feature (frontend tool + backend IP-Adapter pipeline) that didn't exist before
- **Object Recolor** — deterministic OpenCV/LAB color remapping, no generative model, so results are pixel-accurate instead of approximate
- **LaMa-based object deletion** — replaced repurposed inpainting ("generate nothing here") with a model built specifically for background reconstruction
- **8 additional design styles** (16 total) with hand-written positive/negative prompts, plus a **fast draft-preview gallery** so browsing many styles doesn't cost a full generation each
- **Colors Only mode** — decoupled palette application from style selection, with its own tuned generation parameters
- **Connection security** — bearer-token auth (`CONNECTION_KEY`) on the Colab/Kaggle Flask server; the shared baseline had none
- **Reliability fixes** — request timeouts (a hung tunnel no longer freezes the whole UI), automatic Persian→English prompt translation (the models barely understand non-English text), region-selection performance fix, and several environment/install fixes for the Colab notebook itself
- Systematic debugging of ~9 earlier issues (wrong room type, VRAM crashes, IP-Adapter device placement, rate limiting, etc.) documented in commit history

---

## How It Works

```
Your Photo
    │
    ▼
Canny Edge Detection          ← preserves walls, doors, windows
    │
    ▼
Img2Img + ControlNet           ← starts from the real photo, not just its edges
(SD1.5 Realistic Vision, or SDXL Juggernaut XL)
    │
    ▼
Styled Room Image
    │
    ├─► Object Editing: YOLOv8 + SAM + SegFormer detect → localized inpaint
    ├─► Object Deletion: LaMa background reconstruction
    ├─► Object Recolor: OpenCV LAB channel remap (no model)
    └─► Add Object: IP-Adapter blends a reference photo's item into the room
```

The AI pipeline runs on a free **Google Colab / Kaggle T4 GPU**. The frontend connects directly to the notebook's Flask server via an authenticated ngrok tunnel — paste the URL and connection key printed by the notebook's last cell into the app's "Connect AI Backend" dialog.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Firebase Auth |
| AI Models | Stable Diffusion 1.5 (Realistic Vision) + SDXL (Juggernaut XL), ControlNet Canny, IP-Adapter |
| Object Detection | YOLOv8x + SAM ViT-H + SegFormer (semantic segmentation) |
| Object Removal | LaMa (simple-lama-inpainting) |
| Object Recolor | OpenCV (LAB color space, no generative model) |
| GPU Runtime | Google Colab / Kaggle (T4 GPU, free tier) |
| Tunnel | ngrok, bearer-token authenticated |
| Local backend (optional) | Flask (Python) — multi-engine fallback (Gemini/OpenAI/Replicate), not in the default request path |

---

## Project Structure

```
Ai_interior_Designer_original/
├── frontend/
│   └── src/
│       ├── App.js                        # State hub, request handling, translation
│       ├── config.js                     # API URL + connection key resolution
│       ├── utils/translate.js            # Persian → English prompt translation
│       └── components/
│           ├── StyleSelector.js          # 16 styles, custom prompt, Colors Only mode
│           ├── StyleGallery.js           # Fast draft-preview gallery
│           ├── ColorPaletteSelector.js   # Presets + custom palette
│           ├── RegionSelector.js         # Click / draw / point-based selection
│           ├── ObjectEditor.js           # Edit / delete selected object
│           ├── ObjectRecolor.js          # Exact recolor of a selected object
│           ├── AddObjectFromPhoto.js     # IP-Adapter reference-photo insertion
│           ├── FurnishRoom.js
│           ├── BackendSetup.js           # Connect AI Backend (URL + connection key)
│           └── ...
│
├── backend/
│   ├── Original_Interior_Colab_Launch.ipynb   # Run this for AI generation
│   ├── Experimental_Depth_ControlNet_Kaggle.ipynb  # Separate depth-based experiment
│   ├── app.py                            # Optional local multi-engine proxy (Gemini/OpenAI/Replicate)
│   └── requirements.txt
│
└── README.md
```

---

## Quick Start

### 1. Frontend

```bash
cd frontend
npm install
npm start
```

Opens at `http://localhost:3000`.

### 2. AI backend (required for generation)

1. Open `backend/Original_Interior_Colab_Launch.ipynb` in Google Colab
2. Runtime → Change runtime type → **T4 GPU**
3. Runtime → Run all (a fresh **Disconnect and delete runtime** first if you've run it before and hit an install error)
4. Copy the `BACKEND_URL` and `CONNECTION_KEY` printed by the last cell
5. In the app, click **Connection** → paste both values

### 3. Local Flask proxy (optional)

Only needed if you want the Gemini/OpenAI/Replicate fallback engines — the frontend talks directly to the Colab notebook by default.

```bash
cd backend
pip install -r requirements.txt
python app.py
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
