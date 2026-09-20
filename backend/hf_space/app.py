# InteriorAI backend — Hugging Face Spaces (ZeroGPU) port of
# backend/Original_Interior_Colab_Launch.ipynb.
#
# Why this file exists: the Colab notebook needs a human to open it, wait for
# it to boot, and paste a fresh ngrok URL + connection key into the frontend
# every few hours when the free session dies. A ZeroGPU Space has a
# permanent URL and costs nothing, at the cost of two real constraints:
#   - only Gradio-SDK Spaces are eligible for ZeroGPU, so the REST API here
#     is a FastAPI app *mounted inside* a Gradio Blocks app rather than Flask
#   - free accounts get 5 minutes of actual GPU time per day (model loading
#     itself doesn't count against this — only time spent inside a
#     @spaces.GPU-decorated call does)
#
# Business logic (prompts, params, pipeline calls) is copied verbatim from
# the notebook wherever possible. The two real differences from the notebook:
#   1. Both models (fast=SD1.5, quality=SDXL) load once at startup instead of
#      the notebook's ensure_model()-swaps-one-at-a-time approach, because
#      ZeroGPU expects models placed on "cuda" at module level, and the
#      "large" ZeroGPU tier (48GB) comfortably fits both simultaneously —
#      there's no need to unload one to load the other anymore.
#   2. enable_model_cpu_offload()/enable_vae_tiling() are dropped. Those
#      exist in the notebook to fit everything into a free Colab T4's 16GB;
#      with 48GB there's no VRAM pressure to manage, and offloading works
#      against ZeroGPU's own CUDA-placement expectations.
#
# NOT yet verified against a live ZeroGPU Space (no way to run one from this
# environment) — the @spaces.GPU wiring in particular should be treated as
# "written correctly per the documented API" rather than "tested."

import base64
import gc
import hashlib
import hmac
import io
import os
import secrets
import threading
import uuid as _uuid
from collections import OrderedDict

import cv2
import gradio as gr
import numpy as np
import spaces
import torch
from diffusers import (
    AutoencoderKL,
    AutoPipelineForInpainting,
    ControlNetModel,
    StableDiffusionControlNetImg2ImgPipeline,
    StableDiffusionInpaintPipeline,
    StableDiffusionXLControlNetImg2ImgPipeline,
    UniPCMultistepScheduler,
)
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

CACHE_DIR = "/data/models" if os.path.isdir("/data") else "/tmp/interiorai_models"
os.makedirs(CACHE_DIR, exist_ok=True)

# Fixed per Space via a Repository Secret (Settings -> Variables and secrets),
# not regenerated on every restart like the notebook's secrets.token_urlsafe()
# — the whole point of moving off Colab is that the frontend only has to be
# told this once, not every time the backend restarts.
CONNECTION_KEY = os.environ.get("CONNECTION_KEY")
if not CONNECTION_KEY:
    raise RuntimeError(
        "CONNECTION_KEY secret is not set. Add it under this Space's "
        "Settings -> Variables and secrets before it will accept requests."
    )

# ============================================================
# Image / selection helpers — unchanged from the notebook (cell "helper
# functions", section 6)
# ============================================================

MODEL_LOCK = threading.RLock()
IMAGE_STORE, REGION_STORE = OrderedDict(), OrderedDict()
MAX_IMAGES, MAX_REGION_SETS = 16, 8


def base64_to_pil(value):
    if not isinstance(value, str) or not value:
        raise ValueError("image must be base64")
    try:
        raw = base64.b64decode(value.split(",", 1)[-1], validate=True)
    except Exception as exc:
        raise ValueError("Invalid base64 image data") from exc
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()  # actual decode failures surface here, not in the lazy open()
    except Exception as exc:
        # common cause: HEIC (iPhone camera default) — Pillow can't open it without a plugin
        raise ValueError("Could not read this file as an image; use JPEG, PNG or WEBP (not HEIC/HEIF)") from exc
    if im.width * im.height > 16_000_000:
        raise ValueError(
            f"Image is {im.width}x{im.height} ({im.width * im.height / 1_000_000:.1f} megapixels); "
            "max is 16 megapixels — a modern phone photo can exceed this, resize it first"
        )
    return ImageOps.exif_transpose(im).convert("RGB")


def pil_to_base64(im):
    b = io.BytesIO()
    im.save(b, format="PNG")
    return base64.b64encode(b.getvalue()).decode()


def image_key(im):
    return hashlib.sha256(str(im.size).encode() + im.tobytes()).hexdigest()


def remember_image(im):
    key = _uuid.uuid4().hex
    IMAGE_STORE[key] = pil_to_base64(im)
    while len(IMAGE_STORE) > MAX_IMAGES:
        IMAGE_STORE.popitem(last=False)
    return {"image_id": key, "image": IMAGE_STORE[key], "mime_type": "image/png",
            "width": im.width, "height": im.height}


def processing_image(im):
    scale = 512 / max(im.size)
    size = tuple(max(1, round(v * scale)) for v in im.size)
    small = im.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (512, 512))
    canvas.paste(small, (0, 0))
    a = np.array(canvas)
    if size[0] < 512:
        a[:, size[0]:] = a[:, size[0] - 1:size[0]]
    if size[1] < 512:
        a[size[1]:] = a[size[1] - 1:size[1]]
    return Image.fromarray(a), size


def get_canny_edges(im):
    e = cv2.Canny(cv2.cvtColor(np.array(im), cv2.COLOR_RGB2GRAY), 100, 200)
    return Image.fromarray(np.repeat(e[..., None], 3, 2))


def text_prompt(v, name="prompt"):
    if not isinstance(v, str) or not v.strip():
        raise ValueError(name + " is required")
    if len(v) > 600:
        raise ValueError(name + " must be <= 600 characters")
    return v.strip()


def box_pixels(box, im):
    if not isinstance(box, list) or len(box) != 4:
        raise ValueError("bbox must be normalized [x1,y1,x2,y2]")
    x1, y1, x2, y2 = map(float, box)
    if not 0 <= x1 < x2 <= 1 or not 0 <= y1 < y2 <= 1:
        raise ValueError("bbox coordinates must be 0..1")
    return [int(x1 * im.width), int(y1 * im.height),
            min(im.width, int(np.ceil(x2 * im.width))),
            min(im.height, int(np.ceil(y2 * im.height)))]


def _points(values, im):
    if not isinstance(values, list) or not values:
        raise ValueError("positive points required")
    out = []
    for p in values:
        if (not isinstance(p, list) or len(p) != 2
                or not all(isinstance(x, (int, float)) and 0 <= x <= 1 for x in p)):
            raise ValueError("points must be normalized [x,y]")
        out.append([min(im.width - 1, p[0] * im.width), min(im.height - 1, p[1] * im.height)])
    return out


def sam_points_mask(im, positive, negative=None, bbox=None):
    pos = _points(positive, im)
    neg = [] if not negative else _points(negative, im)
    sam_predictor.set_image(np.array(im))
    m, s, _ = sam_predictor.predict(
        point_coords=np.array(pos + neg, np.float32),
        point_labels=np.array([1] * len(pos) + [0] * len(neg)),
        box=np.array(box_pixels(bbox, im), np.float32) if bbox else None,
        multimask_output=True,
    )
    mask = m[int(np.argmax(s))]
    # Same small dilation detect_objects applies to its own masks — otherwise
    # clicking an object could leave a thin sliver of it outside the selection.
    dilate_px = max(2, round(min(im.size) * 0.004))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate_px + 1, 2 * dilate_px + 1))
    return cv2.dilate(mask.astype("uint8"), kernel, iterations=1).astype(bool)


def selection_mask(im, selection):
    if not isinstance(selection, dict):
        raise ValueError("selection is required")
    kinds = [k for k in ("region_id", "mask", "bbox", "point", "points") if selection.get(k) is not None]
    if len(kinds) != 1:
        raise ValueError("Choose one selection type")
    k = kinds[0]
    if k == "region_id":
        item = REGION_STORE.get(image_key(im), {}).get(selection[k])
        if item is None:
            raise ValueError("Region expired; use its mask or detect again")
        mask = item["mask"].copy()
    elif k == "mask":
        v = base64_to_pil(selection[k]).convert("L")
        if v.size != im.size:
            raise ValueError("mask dimensions must match image")
        mask = np.array(v) >= 128
    elif k == "bbox":
        x1, y1, x2, y2 = box_pixels(selection[k], im)
        mask = np.zeros((im.height, im.width), bool)
        mask[y1:y2, x1:x2] = 1
    elif k == "point":
        mask = sam_points_mask(im, [selection[k]])
    else:
        spec = selection[k]
        if not isinstance(spec, dict):
            raise ValueError("points must be an object")
        mask = sam_points_mask(im, spec.get("positive"), spec.get("negative"), spec.get("bbox"))
    if not mask.any():
        raise ValueError("Selection is empty")
    return mask


NEGATIVE = "blurry, distorted, watermark, changed architecture, extra objects"


def localized_inpaint(im, mask, prompt, seed, negative, expand_px, feather_px, inpaint_pipe):
    raw = mask.astype("uint8") * 255
    if expand_px:
        k = 2 * expand_px + 1
        raw = cv2.dilate(raw, np.ones((k, k), np.uint8))
    ys, xs = np.where(raw > 0)
    if not len(xs):
        raise ValueError("Selection is empty")
    x1, x2, y1, y2 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    span = max(x2 - x1, y2 - y1)
    pad = max(24, int(span * .38))
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    side = max(128, span + 2 * pad)
    left = max(0, cx - side // 2)
    top = max(0, cy - side // 2)
    right = min(im.width, left + side)
    bottom = min(im.height, top + side)
    left = max(0, right - side)
    top = max(0, bottom - side)

    crop = im.crop((left, top, right, bottom))
    mc = Image.fromarray(raw).crop((left, top, right, bottom))
    canvas, size = processing_image(crop)

    mask512 = Image.new("L", (512, 512))
    mask512.paste(mc.resize(size, Image.Resampling.NEAREST), (0, 0))

    out = inpaint_pipe(
        prompt=prompt, negative_prompt=negative, image=canvas, mask_image=mask512,
        height=512, width=512, strength=.98, num_inference_steps=45, guidance_scale=9,
        generator=torch.Generator(device="cuda").manual_seed(seed),
    ).images[0]

    gen = out.crop((0, 0, *size)).resize(crop.size, Image.Resampling.LANCZOS)
    alpha = np.array(mc)
    if feather_px:
        alpha = cv2.GaussianBlur(alpha, (0, 0), feather_px / 2)

    final = im.copy()
    final.paste(Image.composite(gen, crop, Image.fromarray(alpha)), (left, top))
    return final


print("Helper functions ready")

# ============================================================
# Model loading — both models resident at once (see module docstring for why)
# ============================================================

GEN_PARAMS = {
    "fast":    {"guidance_scale": 9.0, "controlnet_conditioning_scale": 1.05},
    "quality": {"guidance_scale": 7.0, "controlnet_conditioning_scale": 0.5},
}
ADD_OBJECT_PARAMS = {
    "fast":    {"guidance_scale": 8.0, "controlnet_conditioning_scale": 0.4},
    "quality": {"guidance_scale": 6.5, "controlnet_conditioning_scale": 0.3},
}

SD15_CHECKPOINT = "SG161222/Realistic_Vision_V6.0_B1_noVAE"
SD15_VAE = "stabilityai/sd-vae-ft-mse"
SDXL_CHECKPOINT = "RunDiffusion/Juggernaut-XL-v9"

print(f"Loading {SD15_CHECKPOINT} (fast)...")
_cn15 = ControlNetModel.from_pretrained(
    "lllyasviel/control_v11p_sd15_canny", torch_dtype=torch.float16, cache_dir=CACHE_DIR
)
_vae15 = AutoencoderKL.from_pretrained(SD15_VAE, torch_dtype=torch.float16, cache_dir=CACHE_DIR)
style_pipe_fast = StableDiffusionControlNetImg2ImgPipeline.from_pretrained(
    SD15_CHECKPOINT, controlnet=_cn15, vae=_vae15, torch_dtype=torch.float16,
    safety_checker=None, cache_dir=CACHE_DIR
).to("cuda")
style_pipe_fast.scheduler = UniPCMultistepScheduler.from_config(style_pipe_fast.scheduler.config)
style_pipe_fast.load_ip_adapter("h94/IP-Adapter", subfolder="models", weight_name="ip-adapter-plus_sd15.bin")  # Plus: better reference fidelity than the base variant
style_pipe_fast.set_ip_adapter_scale(0.0)

inpaint_pipe_fast = StableDiffusionInpaintPipeline.from_pretrained(
    "stable-diffusion-v1-5/stable-diffusion-inpainting",
    torch_dtype=torch.float16, safety_checker=None, cache_dir=CACHE_DIR
).to("cuda")
print(f"{SD15_CHECKPOINT} ready")

print(f"Loading {SDXL_CHECKPOINT} (quality)...")
_cn_xl = ControlNetModel.from_pretrained(
    "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16, cache_dir=CACHE_DIR,
    variant="fp16", use_safetensors=True,
)
_vae_xl = AutoencoderKL.from_pretrained(
    "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16, cache_dir=CACHE_DIR
)
style_pipe_quality = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(
    SDXL_CHECKPOINT, controlnet=_cn_xl, vae=_vae_xl, torch_dtype=torch.float16, cache_dir=CACHE_DIR,
    variant="fp16", use_safetensors=True,
).to("cuda")
style_pipe_quality.scheduler = UniPCMultistepScheduler.from_config(style_pipe_quality.scheduler.config)
style_pipe_quality.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter-plus_sdxl_vit-h.safetensors")  # Plus: better reference fidelity
style_pipe_quality.set_ip_adapter_scale(0.0)

inpaint_pipe_quality = AutoPipelineForInpainting.from_pretrained(
    "diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
    torch_dtype=torch.float16, cache_dir=CACHE_DIR,
    variant="fp16", use_safetensors=True,
).to("cuda")
print(f"{SDXL_CHECKPOINT} ready")

_IP_ADAPTER_NEUTRAL_IMAGE = Image.new("RGB", (224, 224), (128, 128, 128))


def get_pipes(model):
    return (style_pipe_quality, inpaint_pipe_quality) if model == "quality" else (style_pipe_fast, inpaint_pipe_fast)


# ---- YOLO + SAM stay on CPU, exactly like the notebook (frees all VRAM for
# the diffusion pipelines; detection doesn't need @spaces.GPU either) ----
from ultralytics import YOLO  # noqa: E402

print("Loading YOLOv8...")
yolo_model = YOLO("yolov8x.pt")
yolo_model.to("cpu")
print("YOLOv8 loaded (CPU)")

from segment_anything import sam_model_registry, SamPredictor  # noqa: E402
import requests  # noqa: E402

sam_path = os.path.join(CACHE_DIR, "sam_vit_h.pth")
if not os.path.exists(sam_path):
    print("Downloading SAM model...")
    resp = requests.get("https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth",
                         stream=True, timeout=120)
    resp.raise_for_status()
    with open(sam_path + ".part", "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    os.replace(sam_path + ".part", sam_path)
    resp.close()
sam = sam_model_registry["vit_h"](checkpoint=sam_path)
sam.to("cpu")
sam_predictor = SamPredictor(sam)
print("SAM loaded (CPU)")

_lama_model = None


def get_lama_model():
    global _lama_model
    if _lama_model is None:
        from simple_lama_inpainting import SimpleLama
        _lama_model = SimpleLama()
    return _lama_model


# ============================================================
# Style prompts — copied from the notebook (already fixed for the CLIP
# 77-token truncation bug: ROOM_PRESERVE_LEAD/ARTIFACT_NEGATIVE_LEAD go
# first, everything trimmed to fit)
# ============================================================

STYLE_PROMPTS = {
    "minimalist": {"prompt": "minimalist interior design, pure white and warm beige walls, polished concrete or light wood floor, clean geometric lines, no clutter, abundant natural daylight, recessed ceiling lights, hidden storage", "negative": "cluttered, colorful, busy, ornate, dark, multiple patterns, too many objects"},
    "industrial": {"prompt": "industrial interior design, raw exposed red brick walls, polished concrete floor, black steel window frames, exposed metal ceiling beams, Edison bulb pendant lights, reclaimed dark wood and iron furniture", "negative": "soft, pastel, floral, traditional, plastic, bright white, fancy"},
    "cyberpunk": {"prompt": "cyberpunk interior design, dark charcoal walls with hexagonal panels, RGB LED strip lighting glowing blue and purple, neon pink and cyan signs on wall, carbon fiber furniture, city skyline through window at night with rain", "negative": "foggy, hazy, too dark, traditional, wooden, daytime, bright white, plain walls"},
    "modern_luxury": {"prompt": "ultra luxury modern interior design, Calacatta marble accent wall with gold veining, herringbone light oak floor, cream boucle upholstered furniture, sculptural gold brass chandelier, floor to ceiling ivory silk curtains", "negative": "cheap, basic, plastic, clutter, industrial, rustic, dark, crowded"},
    "scandinavian": {"prompt": "Scandinavian hygge interior design, white washed pine plank floors, pale sage green accent wall, natural oak surfaces, soft wool throws in oatmeal color, rattan pendant light, wall-mounted oak shelves with ceramic vases", "negative": "dark, ornate, cluttered, colorful, heavy patterns, gilded, industrial, cold"},
    "midcentury_modern": {"prompt": "mid century modern interior design, warm walnut teak wood furniture, geometric patterned wool rug in orange and brown, Eames style lounge chair, tulip side table, sunburst wall clock in gold, tapered furniture legs", "negative": "contemporary, futuristic, traditional, ornate, dark, gothic, cold colors"},
    "japanese_zen": {"prompt": "Japanese zen interior design, natural tatami-textured flooring, shoji screen panels with warm backlight, unfinished hinoki wood walls, bamboo ceiling accents, bonsai tree on wooden stand, earthy sand beige and forest green tones", "negative": "cluttered, colorful, western, modern tech, busy patterns, gold, ornate"},
    "bohemian": {"prompt": "bohemian interior design, terracotta painted walls, layered Persian and Moroccan rugs on wooden floor, macrame wall hanging, rattan egg chair suspended from a visible ceiling chain, trailing plants in woven pots, warm string fairy lights", "negative": "minimal, plain, cold, sterile, corporate, modern sleek, industrial, sparse"},
    "art_deco": {"prompt": "art deco interior design, geometric sunburst wall panel in black lacquer and gold trim, emerald green velvet armchair, brass and marble side table, fluted glass pendant chandelier, herringbone parquet floor, curved furniture silhouettes", "negative": "rustic, farmhouse, plain wood, minimalist, cheap plastic, flat lighting, dull colors"},
    "coastal": {"prompt": "coastal interior design, whitewashed shiplap walls, light bleached oak floor, linen slipcovered sofa in soft white, jute rope rug, driftwood accent table, sheer breezy curtains, soft blue and sandy beige palette", "negative": "dark, heavy, industrial, cluttered, neon, gothic, ornate gold, cramped"},
    "french_country": {"prompt": "French country interior design, soft cream limewashed walls, exposed wooden ceiling beams, toile de Jouy upholstered armchair, wrought iron chandelier, weathered oak farmhouse table, powder blue painted cabinetry, terracotta tile floor", "negative": "modern minimalist, industrial, neon, plastic, sterile, cold lighting"},
    "farmhouse_rustic": {"prompt": "rustic farmhouse interior design, reclaimed barn wood accent wall, wide plank distressed hardwood floor, black iron light fixtures, open wooden shelving with ceramic crockery, stone fireplace surround, oversized linen sofa, warm cream and charcoal palette", "negative": "glossy, futuristic, neon, cyberpunk, sterile, corporate, plastic"},
    "contemporary_glam": {"prompt": "contemporary glam interior design, plush tufted velvet sofa in blush pink, polished chrome and lucite coffee table, oversized crystal chandelier, metallic gold throw pillows, high gloss lacquer cabinetry, faux fur area rug, glossy marble floor", "negative": "rustic, farmhouse, raw concrete, dull, matte flat colors, cheap, worn"},
    "dark_academia": {"prompt": "dark academia interior design, floor to ceiling dark walnut bookshelves with leather bound books, deep forest green velvet wingback armchair, brass library lamp with green glass shade, oxblood leather chesterfield sofa, herringbone dark wood floor", "negative": "bright white, minimalist, neon, plastic, modern sleek, sparse, empty shelves"},
    "tropical_modern": {"prompt": "tropical modern interior design, natural rattan and woven wicker furniture, abundant monstera and palm plants, warm teak wood accents, open airy layout with louvered shutters, terracotta and cream palette, woven bamboo pendant light", "negative": "cold, sterile, heavy dark wood, no plants, industrial, gothic, cramped"},
    "brutalist": {"prompt": "brutalist interior design, raw exposed poured concrete walls and ceiling, monolithic geometric furniture forms, single sculptural black leather chair, minimal charcoal grey palette, exposed structural beams, stark dramatic shadows", "negative": "ornate, colorful, cluttered, cozy textiles, floral, pastel, cheap plastic"},
}

ROOM_PRESERVE_LEAD = "keep the same room type, walls, windows, doors and furniture layout"
ROOM_PRESERVE_NEGATIVE = ", different room type, structural changes, moved walls or windows"
ARTIFACT_NEGATIVE_LEAD = "floating furniture, furniture not touching the floor, duplicate chairs, cloned furniture, stains, blemishes"
QUALITY_SUFFIX = ", RAW photo, professional real estate photography"
QUALITY_NEGATIVE = ", illustration, painting, cartoon, 3d render, cgi"
TAIL_NEGATIVE = ", blurry, low quality, watermark"

print("Style prompts ready:", list(STYLE_PROMPTS))

# ============================================================
# Generation functions — @spaces.GPU wraps everything that actually touches
# style_pipe_*/inpaint_pipe_*. detect_objects/semantic_regions stay
# undecorated since YOLO+SAM run on CPU.
# ============================================================


def semantic_regions(im):
    global _semantic_processor, _semantic_model
    if _semantic_model is None:
        from transformers import AutoImageProcessor, SegformerForSemanticSegmentation
        # b0 (the smallest SegFormer variant) frequently missed common interior
        # surfaces — curtains, cushions, cabinets, picture frames — that simply
        # have no class in COCO/YOLO's 80 labels at all. b2 is meaningfully more
        # accurate and still cheap enough to run on CPU (no VRAM competition
        # with the generation pipelines).
        model_id = "nvidia/segformer-b2-finetuned-ade-512-512"
        _semantic_processor = AutoImageProcessor.from_pretrained(model_id, cache_dir=CACHE_DIR)
        _semantic_model = SegformerForSemanticSegmentation.from_pretrained(model_id, cache_dir=CACHE_DIR).eval()
    inputs = _semantic_processor(images=im, return_tensors="pt")
    with torch.inference_mode():
        output = _semantic_model(**inputs)
    labels = _semantic_processor.post_process_semantic_segmentation(
        output, target_sizes=[(im.height, im.width)])[0].cpu().numpy()
    for cls in np.unique(labels):
        label = _semantic_model.config.id2label[int(cls)].split(";")[0]
        n, parts, stats, _ = cv2.connectedComponentsWithStats((labels == cls).astype("uint8"), 8)
        for i in range(1, n):
            # Old threshold (0.3% of image area) silently dropped small real
            # objects (a picture frame, a table lamp). Lowered to 0.12%; the
            # absolute 64px floor still filters out pure noise specks.
            if stats[i, cv2.CC_STAT_AREA] >= max(64, im.width * im.height * 0.0012):
                yield label, parts == i


_semantic_processor = _semantic_model = None


def detect_objects(image_b64):
    im = base64_to_pil(image_b64)
    key, items, public = image_key(im), {}, []
    # A few px of dilation on every returned mask — SAM/SegFormer selections
    # tend to hug (or slightly undercut) the object's true edge, which used to
    # leave a thin sliver of the object outside an edit/delete/recolor
    # selection. This closes that gap without spilling into neighbors.
    dilate_px = max(2, round(min(im.size) * 0.004))
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate_px + 1, 2 * dilate_px + 1))

    def add(label, mask, source, confidence=None):
        if len(items) >= 80 or not mask.any():
            return
        mask = cv2.dilate(mask.astype("uint8"), dilate_kernel, iterations=1).astype(bool)
        ys, xs = np.where(mask)
        rid = _uuid.uuid4().hex
        items[rid] = {"label": label, "mask": mask}
        public.append({
            "id": rid, "label": label, "source": source, "confidence": confidence,
            "bbox": [float(xs.min() / im.width), float(ys.min() / im.height),
                     float((xs.max() + 1) / im.width), float((ys.max() + 1) / im.height)],
            "mask": pil_to_base64(Image.fromarray(mask.astype("uint8") * 255)),
            "mask_mime_type": "image/png",
        })

    with MODEL_LOCK:
        sam_predictor.set_image(np.array(im))
        for result in yolo_model(np.array(im), verbose=False, conf=0.2, max_det=40):
            for box in result.boxes:
                masks, scores, _ = sam_predictor.predict(box=box.xyxy[0].cpu().numpy(), multimask_output=True)
                add(yolo_model.names[int(box.cls.item())], masks[int(np.argmax(scores))], "yolo_sam", float(box.conf.item()))
        for label, mask in semantic_regions(im):
            if any(label == item["label"] and (mask & item["mask"]).sum() / max(1, (mask | item["mask"]).sum()) > 0.65
                   for item in items.values()):
                continue
            add(label, mask, "segformer")
        REGION_STORE[key] = items
        while len(REGION_STORE) > MAX_REGION_SETS:
            REGION_STORE.popitem(last=False)

    return {"objects": list(dict.fromkeys(x["label"] for x in public)), "regions": public,
            "width": im.width, "height": im.height, "coordinates": "normalized", "image_hash": key}


@spaces.GPU(duration=60)
def generate_style(image_b64, style_name=None, palette=None, custom_prompt=None, colors_only=False,
                    extra_details=None, model="fast", seed=42, draft=False):
    style_pipe, _ = get_pipes(model)
    params = GEN_PARAMS.get(model, GEN_PARAMS["fast"])
    strength = 0.7
    steps = 12 if draft else 40
    canvas_size = 384 if draft else 768

    if colors_only:
        if not palette:
            raise ValueError("colorsOnly requires a palette")
        p = ROOM_PRESERVE_LEAD + ", only repaint the walls and change decor colors to match this palette"
        neg = "changed furniture, changed layout, new objects, removed objects" + ROOM_PRESERVE_NEGATIVE
        strength = 0.4
    elif custom_prompt:
        p = ROOM_PRESERVE_LEAD + ", " + text_prompt(custom_prompt, "customPrompt")
        neg = ARTIFACT_NEGATIVE_LEAD + ROOM_PRESERVE_NEGATIVE
    elif style_name in STYLE_PROMPTS:
        config = STYLE_PROMPTS[style_name]
        base = config["prompt"]
        if extra_details:
            base += ", " + text_prompt(extra_details, "extraDetails")
        p = ROOM_PRESERVE_LEAD + ", " + base
        neg = ARTIFACT_NEGATIVE_LEAD + ", " + config["negative"] + ROOM_PRESERVE_NEGATIVE
    else:
        raise ValueError("Choose a valid style, customPrompt, or colorsOnly")

    if palette:
        if not isinstance(palette, dict):
            raise ValueError("palette must be an object")
        palette_prompt = palette.get("prompt", "")
        colors = palette.get("colors", [])
        if palette_prompt and not isinstance(palette_prompt, str):
            raise ValueError("palette.prompt must be text")
        if colors and (not isinstance(colors, list) or not all(isinstance(c, str) for c in colors)):
            raise ValueError("palette.colors must be a list")
        color_text = ", ".join(colors)
        palette_text = ", ".join(x for x in [palette_prompt.strip(), color_text] if x)
        if palette_text:
            p = palette_text + ", " + p + ", dominant color scheme must follow the selected palette"
            neg += ", wrong colors, different color palette, ignore selected palette"

    original = base64_to_pil(image_b64)
    size = original.size
    room = original.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)
    edge_image = get_canny_edges(room)

    with MODEL_LOCK:
        style_pipe.set_ip_adapter_scale(0.0)
        r = style_pipe(
            prompt=p + QUALITY_SUFFIX,
            negative_prompt=neg + QUALITY_NEGATIVE + TAIL_NEGATIVE,
            image=room, control_image=edge_image, strength=strength,
            ip_adapter_image=_IP_ADAPTER_NEUTRAL_IMAGE,
            num_inference_steps=steps, guidance_scale=params["guidance_scale"],
            controlnet_conditioning_scale=params["controlnet_conditioning_scale"],
            height=canvas_size, width=canvas_size,
            generator=torch.Generator(device="cuda").manual_seed(seed),
        ).images[0]

    return {"image": pil_to_base64(r.resize(size, Image.Resampling.LANCZOS)), "mime_type": "image/png"}


def generate_all_previews(image_b64, palette=None, styles=None, model="fast", seed=42, draft=False):
    styles = list(STYLE_PROMPTS) if styles is None else styles
    n = len(STYLE_PROMPTS)
    if not isinstance(styles, list) or not 1 <= len(styles) <= n or any(s not in STYLE_PROMPTS for s in styles):
        raise ValueError(f"styles must contain 1..{n} valid names")
    return {
        "previews": {s: generate_style(image_b64, s, palette=palette, model=model, seed=seed, draft=draft)["image"] for s in styles},
        "mime_type": "image/png",
    }


@spaces.GPU(duration=60)
# Neutral prompt: works for both replacing an object ("replace this chair with
# a wooden chair") and changing a surface's material ("make the ceiling
# wooden") — the old suffix assumed every selection was a discrete object
# needing a "contact shadow", which produced nonsense results on surfaces.
def edit_object(image_b64, object_label=None, edit_prompt=None, selection=None, model="fast", seed=42):
    _, inpaint_pipe = get_pipes(model)
    im = base64_to_pil(image_b64)
    with MODEL_LOCK:
        mask = selection_mask(im, selection)
        p = (text_prompt(edit_prompt) +
             ", blended naturally into the surrounding room, matching perspective, scale and existing lighting, photorealistic" + QUALITY_SUFFIX)
        neg = (ARTIFACT_NEGATIVE_LEAD +
               ", unrelated new object, extra furniture, mismatched style, warped lines, seams, bad edges" + QUALITY_NEGATIVE + TAIL_NEGATIVE)
        r = localized_inpaint(im, mask, p, seed, neg, 10, 5, inpaint_pipe)
    return {"image": pil_to_base64(r), "mime_type": "image/png"}


@spaces.GPU(duration=30)
def delete_object_lama(image_b64, selection):
    im = base64_to_pil(image_b64)
    with MODEL_LOCK:
        mask = selection_mask(im, selection)
        raw = mask.astype("uint8") * 255
        ys, xs = np.where(raw > 0)
        if not len(xs):
            raise ValueError("Selection is empty")
        object_span = max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
        radius = int(np.clip(round(object_span * .075), 8, max(12, round(min(im.size) * .06))))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))
        expanded = cv2.dilate(cv2.morphologyEx(raw, cv2.MORPH_CLOSE, kernel), kernel, iterations=1)
        result = get_lama_model()(im, Image.fromarray(expanded, mode="L")).convert("RGB")
        feather = max(2, round(min(im.size) * .006))
        alpha = cv2.GaussianBlur(expanded, (0, 0), feather)
        out = Image.composite(result, im, Image.fromarray(alpha))
    return {"image": pil_to_base64(out), "mime_type": "image/png"}


def recolor_object(image_b64, selection, color, strength=.85):
    if not isinstance(color, str) or len(color) != 7 or color[0] != "#":
        raise ValueError("color must be #RRGGBB")
    try:
        target_rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
    except ValueError as exc:
        raise ValueError("color must be #RRGGBB") from exc
    if not isinstance(strength, (int, float)) or not 0 <= float(strength) <= 1:
        raise ValueError("strength must be between 0 and 1")

    im = base64_to_pil(image_b64)
    with MODEL_LOCK:
        mask = selection_mask(im, selection)
        rgb = np.array(im)
        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
        target = np.uint8([[target_rgb]])
        target_lab = cv2.cvtColor(target, cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32)

        amount = float(strength)
        lab[..., 1] = lab[..., 1] * (1 - amount) + target_lab[1] * amount
        lab[..., 2] = lab[..., 2] * (1 - amount) + target_lab[2] * amount
        recolored = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)

        edge = max(1, round(min(im.size) * .004))
        alpha = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), edge)[..., None]
        out = (recolored * alpha + rgb * (1 - alpha)).clip(0, 255).astype(np.uint8)
    return {"image": pil_to_base64(Image.fromarray(out)), "mime_type": "image/png"}


# Pure OpenCV, like recolor_object — no model. Tiles the reference texture
# over the selected region, then multiplies it by that region's own local
# lighting (relative to its own mean) so real shadows/highlights on the
# surface show through instead of the texture looking flatly pasted on.
# Known limitation: simple tiling, no perspective correction — best for a
# wall facing roughly toward the camera.
def apply_texture(image_b64, selection, texture_b64, opacity=.85):
    if not isinstance(opacity, (int, float)) or not 0 <= float(opacity) <= 1:
        raise ValueError("opacity must be between 0 and 1")
    im = base64_to_pil(image_b64)
    texture = base64_to_pil(texture_b64)

    with MODEL_LOCK:
        mask = selection_mask(im, selection)
        rgb = np.array(im).astype(np.float32)
        gray = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2GRAY).astype(np.float32)

        ys, xs = np.where(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        region_h, region_w = y1 - y0, x1 - x0

        tw, th = texture.size
        tiles_x = int(np.ceil(region_w / tw)) + 1
        tiles_y = int(np.ceil(region_h / th)) + 1
        tiled = Image.new("RGB", (tw * tiles_x, th * tiles_y))
        for ty in range(tiles_y):
            for tx in range(tiles_x):
                tiled.paste(texture, (tx * tw, ty * th))
        tiled_rgb = np.array(tiled.crop((0, 0, region_w, region_h))).astype(np.float32)

        local_gray = gray[y0:y1, x0:x1]
        local_mean = max(1.0, local_gray[mask[y0:y1, x0:x1]].mean())
        lighting = np.clip(local_gray / local_mean, .35, 1.8)[..., None]
        lit_texture = np.clip(tiled_rgb * lighting, 0, 255)

        out = rgb.copy()
        edge = max(1, round(min(im.size) * .004))
        region_mask = cv2.GaussianBlur(mask[y0:y1, x0:x1].astype(np.float32) * float(opacity), (0, 0), edge)[..., None]
        out[y0:y1, x0:x1] = lit_texture * region_mask + rgb[y0:y1, x0:x1] * (1 - region_mask)

    return {"image": pil_to_base64(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))), "mime_type": "image/png"}


# apply_texture (above) is for when the user has their own texture photo.
# This is the opposite: no upload needed, just pick "stone" or "velvet" and
# the model generates it — uses localized_inpaint (same as furnish_room)
# with a pre-written prompt instead of apply_texture's pure-OpenCV tiling.
TEXTURE_PROMPTS = {
    "natural_stone": "natural stone cladding, cool grey and beige veined marble texture, polished stone surface, subtle natural veining pattern",
    "wood_paneling": "warm wood paneling, vertical oak wood slats, natural wood grain texture, honey brown tone",
    "velvet_fabric": "plush velvet fabric texture, soft deep emerald green velvet, rich fabric weave, luxurious upholstery texture",
    "exposed_brick": "exposed red brick wall, weathered brick texture, visible mortar lines, warm terracotta brick tones",
    "exposed_concrete": "raw exposed concrete surface, smooth grey concrete texture, subtle form-tie marks, industrial finish",
    "geometric_wallpaper": "geometric wallpaper pattern, repeating art deco gold and cream geometric print, elegant wall covering",
    "ceramic_tile": "glossy ceramic subway tile, clean white tile texture, thin grey grout lines, reflective glaze",
    "rattan_wicker": "natural rattan wicker weave texture, woven cane pattern, warm tan natural fiber texture",
}


@spaces.GPU(duration=60)
def generate_texture(image_b64, selection, texture_name, model="fast", seed=42):
    _, inpaint_pipe = get_pipes(model)
    if texture_name not in TEXTURE_PROMPTS:
        raise ValueError(f"texture must be one of {list(TEXTURE_PROMPTS)}")
    im = base64_to_pil(image_b64)
    with MODEL_LOCK:
        mask = selection_mask(im, selection)
        p = (TEXTURE_PROMPTS[texture_name] +
             ", seamless repeating texture, realistic material, matching existing lighting and shadows" + QUALITY_SUFFIX)
        neg = (ARTIFACT_NEGATIVE_LEAD + ", changed room style, changed furniture, different material" +
               QUALITY_NEGATIVE + TAIL_NEGATIVE)
        r = localized_inpaint(im, mask, p, seed, neg, 6, 6, inpaint_pipe)
    return {"image": pil_to_base64(r), "mime_type": "image/png"}


def resolve_selection(image_b64, data):
    selection = data.get("selection")
    if selection:
        return selection
    label = (data.get("object") or "").strip().lower()
    if not label:
        raise ValueError("selection or object is required")
    det = detect_objects(image_b64)
    match = next((r for r in det["regions"] if label in r["label"].lower()), None)
    if match is None:
        raise ValueError(f'No detected object matches "{label}"; try detect-objects first and pass a selection')
    return {"region_id": match["id"]}


def default_furnish_mask(im):
    m = np.zeros((im.height, im.width), bool)
    m[int(im.height * .43):, :] = 1
    return m


@spaces.GPU(duration=60)
def furnish_room(image_b64, furnish_prompt, selection=None, model="fast", seed=42):
    _, inpaint_pipe = get_pipes(model)
    p = text_prompt(furnish_prompt)
    im = base64_to_pil(image_b64)
    with MODEL_LOCK:
        m = default_furnish_mask(im) if selection is None else selection_mask(im, selection)
        r = localized_inpaint(
            im, m,
            p + ", add only requested furniture, preserve existing room style, architecture and unrequested objects, realistic placement, perspective, scale and contact shadows" + QUALITY_SUFFIX,
            seed, "changed room style, changed walls, changed windows, duplicate furniture, floating object, blurry, watermark" + QUALITY_NEGATIVE, 4, 5,
            inpaint_pipe,
        )
    return {"image": pil_to_base64(r), "mime_type": "image/png"}


def furnish_room_inpaint(image_b64, furnish_prompt, selection=None, model="fast", seed=42):
    return furnish_room(image_b64, furnish_prompt, selection, model, seed)


@spaces.GPU(duration=60)
def add_object_from_reference(room_image_b64, object_image_b64, placement_prompt="", selection=None, model="fast", seed=42):
    style_pipe, _ = get_pipes(model)
    params = ADD_OBJECT_PARAMS.get(model, ADD_OBJECT_PARAMS["fast"])

    original = base64_to_pil(room_image_b64)
    object_image = base64_to_pil(object_image_b64)

    base_prompt = (
        (placement_prompt.strip() or "place this exact item naturally in the room") +
        ", the item from the reference image is clearly visible and present in the scene" +
        ", seamlessly blended, matching perspective and lighting, photorealistic, 8k, interior design photography, highly detailed"
    )
    negative_prompt = (
        "missing object, no new object, unchanged room, floating object, wrong perspective, "
        "mismatched lighting, blurry, low quality, distorted, watermark"
    )

    # A marked area lets generation stay cropped tightly around it instead of
    # running over the whole 768x768 room: the reference image gets much
    # stronger, more localized influence, and everything outside the crop is
    # left byte-identical. Padding is generous (span*.7, vs localized_inpaint's
    # span*.38) since this places a whole new object, which needs real room to
    # render in — not just filling a hole the same size as what was removed.
    if selection:
        mask = selection_mask(original, selection)
        raw = mask.astype("uint8") * 255
        ys, xs = np.where(raw > 0)
        if not len(xs):
            raise ValueError("Selection is empty")
        x1, x2, y1, y2 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        span = max(x2 - x1, y2 - y1)
        pad = max(64, int(span * .7))
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        side = max(320, span + 2 * pad)
        left = max(0, cx - side // 2)
        top = max(0, cy - side // 2)
        right = min(original.width, left + side)
        bottom = min(original.height, top + side)
        left = max(0, right - side)
        top = max(0, bottom - side)
        crop = original.crop((left, top, right, bottom))
    else:
        left, top, crop = 0, 0, original

    canvas_size = 768
    room = crop.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)
    edge_image = get_canny_edges(room)

    with MODEL_LOCK:
        style_pipe.set_ip_adapter_scale(0.85)
        r = style_pipe(
            prompt=base_prompt + QUALITY_SUFFIX,
            negative_prompt=negative_prompt + QUALITY_NEGATIVE,
            image=room, control_image=edge_image, strength=0.55,
            ip_adapter_image=object_image,
            num_inference_steps=40, guidance_scale=params["guidance_scale"],
            controlnet_conditioning_scale=params["controlnet_conditioning_scale"],
            height=canvas_size, width=canvas_size,
            generator=torch.Generator(device="cuda").manual_seed(seed),
        ).images[0]
        style_pipe.set_ip_adapter_scale(0.0)

    if selection:
        gen_crop = r.resize(crop.size, Image.Resampling.LANCZOS)
        w, h = crop.size
        feather = max(12, round(min(w, h) * .05))
        inset = np.zeros((h, w), dtype=np.uint8)
        f = min(feather, (min(w, h) - 1) // 2)
        inset[f:h - f, f:w - f] = 255
        alpha = cv2.GaussianBlur(inset, (0, 0), max(1, feather / 2))
        final = original.copy()
        final.paste(Image.composite(gen_crop, crop, Image.fromarray(alpha)), (left, top))
        result = final
    else:
        result = r

    return {"image": pil_to_base64(result), "mime_type": "image/png"}


print("Generation functions ready")

# ============================================================
# REST API — FastAPI mounted inside the Gradio app. Routes, payload shapes
# and error format are unchanged from the Flask version so the existing
# frontend (services/api.js) only needs a new base URL.
# ============================================================

api = FastAPI()
api.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@api.middleware("http")
async def check_auth(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    if not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + CONNECTION_KEY):
        return JSONResponse({"error": "Connection key required"}, status_code=401)
    try:
        return await call_next(request)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception as exc:  # noqa: BLE001 — mirrors the notebook's catch-all error handler
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


def request_image(data):
    if data.get("image"):
        return pil_to_base64(base64_to_pil(data["image"]))
    key = data.get("image_id")
    if not isinstance(key, str) or key not in IMAGE_STORE:
        raise ValueError("Send image or a valid image_id from /upload; expired images must be uploaded again")
    return IMAGE_STORE[key]


def request_seed(data):
    value = data.get("seed", 42)
    if type(value) is not int or not 0 <= value < 2 ** 32:
        raise ValueError("seed must be an integer 0..4294967295")
    return value


def request_model(data):
    return data.get("model") if data.get("model") in ("fast", "quality") else "fast"


def finish(result):
    if "image" in result:
        result.update(remember_image(base64_to_pil(result["image"])))
    return result


@api.get("/health")
def health():
    return {"status": "ok", "colab_connected": True, "mode": "zerogpu", "api_version": 2, "current_model": None}


@api.get("/capabilities")
def capabilities():
    return {
        "api_version": 2, "styles": list(STYLE_PROMPTS), "models": ["fast", "quality"],
        "current_model": None,
        "operations": ["style", "furnish", "detect", "edit", "delete", "add-object", "recolor", "texture", "generate-texture"],
        "textures": list(TEXTURE_PROMPTS),
        "selection": ["region_id", "mask", "bbox", "point", "points"],
        "coordinates": "normalized", "furnish_requires_selection": False,
        "output_mime_type": "image/png",
    }


@api.post("/upload")
async def upload(request: Request):
    form = await request.form()
    if "image" not in form:
        raise ValueError("image file required")
    raw = await form["image"].read()
    im = base64_to_pil(base64.b64encode(raw).decode())
    with MODEL_LOCK:
        return remember_image(im)


@api.post("/generate")
@api.post("/colab-generate")
async def generate(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        return finish(generate_style(
            request_image(data), style_name=data.get("style"), palette=data.get("palette"),
            custom_prompt=data.get("customPrompt"), colors_only=bool(data.get("colorsOnly")),
            extra_details=data.get("extraDetails"), model=request_model(data), seed=request_seed(data),
            draft=bool(data.get("draft"))))


@api.post("/detect-objects")
@api.post("/colab-detect")
async def detect_objects_route(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        return detect_objects(request_image(data))


@api.post("/segment-point")
async def segment_point_route(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        im = base64_to_pil(request_image(data))
        mask = selection_mask(im, {"point": data.get("point")})
        key, rid = image_key(im), _uuid.uuid4().hex
        regions = REGION_STORE.setdefault(key, {})
        if len(regions) >= 80:
            raise ValueError("Too many regions; run detection again")
        regions[rid] = {"label": "selected region", "mask": mask}
        while len(REGION_STORE) > MAX_REGION_SETS:
            REGION_STORE.popitem(last=False)
        return {"region_id": rid, "image_hash": key,
                "mask": pil_to_base64(Image.fromarray(mask.astype("uint8") * 255)),
                "width": im.width, "height": im.height, "mask_mime_type": "image/png"}


@api.post("/segment-points")
async def segment_points_route(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        im = base64_to_pil(request_image(data))
        mask = selection_mask(im, {"points": {"positive": data.get("positive"),
                                               "negative": data.get("negative", []),
                                               "bbox": data.get("bbox")}})
        return {"mask": pil_to_base64(Image.fromarray(mask.astype("uint8") * 255)),
                "width": im.width, "height": im.height, "mask_mime_type": "image/png"}


@api.post("/edit-object")
@api.post("/colab-edit")
async def edit_object_route(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        image_b64 = request_image(data)
        selection = resolve_selection(image_b64, data)
        return finish(edit_object(image_b64, data.get("object"), data.get("prompt"), selection,
                                   model=request_model(data), seed=request_seed(data)))


@api.post("/delete-object")
@api.post("/colab-delete")
async def delete_object_route(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        image_b64 = request_image(data)
        selection = resolve_selection(image_b64, data)
        return finish(delete_object_lama(image_b64, selection))


@api.post("/recolor-object")
@api.post("/colab-recolor")
async def recolor_object_route(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        image_b64 = request_image(data)
        selection = resolve_selection(image_b64, data)
        return finish(recolor_object(image_b64, selection, data.get("color"), data.get("strength", .85)))


@api.post("/apply-texture")
async def apply_texture_route(request: Request):
    data = await request.json()
    texture = data.get("texture")
    if not texture:
        raise ValueError("texture image required")
    with MODEL_LOCK:
        image_b64 = request_image(data)
        selection = resolve_selection(image_b64, data)
        return finish(apply_texture(image_b64, selection, pil_to_base64(base64_to_pil(texture)),
                                     data.get("opacity", .85)))


@api.post("/generate-texture")
async def generate_texture_route(request: Request):
    data = await request.json()
    texture_name = data.get("texture")
    if not texture_name:
        raise ValueError("texture name required")
    with MODEL_LOCK:
        image_b64 = request_image(data)
        selection = resolve_selection(image_b64, data)
        return finish(generate_texture(image_b64, selection, texture_name,
                                        request_model(data), request_seed(data)))


@api.post("/furnish-room")
@api.post("/colab-furnish")
async def colab_furnish(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        return finish(furnish_room(request_image(data), data.get("prompt"), data.get("selection"),
                                    request_model(data), request_seed(data)))


@api.post("/preview-styles")
@api.post("/colab-preview")
async def preview_styles_route(request: Request):
    data = await request.json()
    with MODEL_LOCK:
        return generate_all_previews(request_image(data), data.get("palette"), data.get("styles"),
                                      request_model(data), request_seed(data), draft=bool(data.get("draft")))


@api.post("/add-object")
@api.post("/colab-add-object")
async def add_object_route(request: Request):
    data = await request.json()
    room_image = data.get("room_image")
    object_image = data.get("object_image")
    if not room_image or not object_image:
        raise ValueError("room_image and object_image required")
    with MODEL_LOCK:
        return finish(add_object_from_reference(pil_to_base64(base64_to_pil(room_image)),
                                                 pil_to_base64(base64_to_pil(object_image)),
                                                 data.get("prompt", ""), data.get("selection"),
                                                 request_model(data), request_seed(data)))


print("REST API defined —", len(api.routes), "routes registered")

# ============================================================
# Minimal Gradio UI — ZeroGPU currently requires the Space to be Gradio-SDK
# and have at least one Gradio interface; the actual product UI is the React
# frontend talking to the FastAPI routes above, so this is just a status
# page + a manual test panel for debugging without the frontend.
# ============================================================

with gr.Blocks(title="InteriorAI backend") as demo:
    gr.Markdown(
        "# InteriorAI backend (ZeroGPU)\n\n"
        "This Space is the AI backend for [InteriorAI](https://github.com/h-bahmani/interior-design). "
        "The frontend talks to the REST API mounted at this Space's URL "
        "(`/generate`, `/detect-objects`, `/edit-object`, ...), not to this page. "
        "This panel exists only for manually testing the pipeline without the frontend."
    )
    with gr.Row():
        inp_image = gr.Image(type="pil", label="Room photo")
        out_image = gr.Image(type="pil", label="Result")
    style_dropdown = gr.Dropdown(list(STYLE_PROMPTS), value="minimalist", label="Style")
    model_radio = gr.Radio(["fast", "quality"], value="fast", label="Model")
    run_btn = gr.Button("Generate", variant="primary")

    def _manual_generate(image, style, model):
        if image is None:
            raise gr.Error("Upload a room photo first")
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        result = generate_style(b64, style_name=style, model=model)
        return base64_to_pil(result["image"])

    run_btn.click(_manual_generate, [inp_image, style_dropdown, model_radio], out_image)

app = gr.mount_gradio_app(api, demo, path="/")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
