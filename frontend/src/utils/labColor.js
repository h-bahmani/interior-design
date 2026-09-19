// sRGB <-> CIELAB (D65), verified against skimage.color.rgb2lab/lab2rgb —
// same channel-blend approach the backend's recolor_object uses (shift only
// a/b, leave L alone so lighting and texture detail survive), just done in
// the browser for an instant "does this color look right" preview before
// spending a real generation call on it.

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

const D65 = { x: 95.047, y: 100.0, z: 108.883 };

export function rgbToLab(r, g, b) {
  r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) * 100;
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) * 100;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / D65.x), fy = f(y / D65.y), fz = f(z / D65.z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(l, a, b) {
  const fy = (l + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const finv = (t) => (Math.pow(t, 3) > 0.008856 ? Math.pow(t, 3) : (t - 16 / 116) / 7.787);
  const x = (finv(fx) * D65.x) / 100, y = (finv(fy) * D65.y) / 100, z = (finv(fz) * D65.z) / 100;
  const r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bl)];
}

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
