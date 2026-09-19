// The backend caps uploads at 16 megapixels and every operation internally
// works at 384-768px anyway (see canvas_size in generate_style/furnish_room),
// so a full-resolution phone photo (commonly 20-50+ megapixels) never buys
// any real quality — it just risks tripping that cap with a generic
// "Invalid image" error. Downscale client-side before upload so that never
// happens, and uploads are smaller/faster on top of it.
const MAX_DIMENSION = 2400;

export function downscaleImage(file, maxDimension = MAX_DIMENSION) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      if (Math.max(width, height) <= maxDimension) {
        resolve(file); // already small enough, no re-encoding needed
        return;
      }
      const scale = maxDimension / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Could not process this image')); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image file')); };
    img.src = url;
  });
}
