/**
 * Downscale a photo on-device before upload: caps the longest edge, re-encodes
 * as JPEG. Keeps requests small/fast and within the vision API's image limits.
 * Returns raw base64 (no data URL prefix) plus the media type.
 */
export async function fileToResizedBase64(
  file: File,
  maxEdge = 1568,
  quality = 0.8
): Promise<{ base64: string; mediaType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load the image."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  ctx.drawImage(img, 0, 0, w, h);

  const outUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = outUrl.split(",")[1] ?? "";
  return { base64, mediaType: "image/jpeg" };
}
