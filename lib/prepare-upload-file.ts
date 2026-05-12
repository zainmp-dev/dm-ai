/** Downscale oversized photos before data-URL uploads — smaller payloads, faster uploads. */

const LARGE_IMAGE_BYTES = 750 * 1024;
const MAX_EDGE_PX = 1920;

function loadImage(bitmap: Blob | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(bitmap);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed"));
    };
    img.src = url;
  });
}

async function downscaleHeavyImage(file: File, maxEdgePx: number): Promise<File> {
  const img = await loadImage(file);
  let { width, height } = img;
  if (width <= maxEdgePx && height <= maxEdgePx) {
    return file;
  }

  const ratio = Math.min(maxEdgePx / width, maxEdgePx / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const mime = /^image\/png$/i.test(file.type) ? "image/png" : "image/jpeg";
  const quality = mime === "image/jpeg" ? 0.88 : undefined;
  const outBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));

  if (!(outBlob instanceof Blob) || !outBlob.size) {
    return file;
  }
  const ext = mime === "image/png" ? "png" : "jpg";
  const stem = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([outBlob], `${stem}.${ext}`, { type: mime });
}

/** Video and animated formats: keep originals. */
export async function prepareFileForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  if (file.size < LARGE_IMAGE_BYTES) return file;

  try {
    return await downscaleHeavyImage(file, MAX_EDGE_PX);
  } catch {
    return file;
  }
}
