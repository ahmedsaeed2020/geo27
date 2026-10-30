/** Browser-side helpers for CMS images: base64 transport and responsive WebP sizes. */
export const RESPONSIVE_WIDTHS = [480, 960, 1600] as const;

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  // Files that the browser cannot decode as a bitmap (SVG, corrupt or renamed files) are refused before upload.
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Only PNG, JPEG and WebP images are accepted');
  });
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** Downscaled WebP copies for widths smaller than the original. Browsers that cannot encode WebP simply produce none. */
export async function makeVariants(file: Blob): Promise<{ width: 480 | 960 | 1600; height: number; blob: Blob }[]> {
  const bitmap = await createImageBitmap(file);
  const out: { width: 480 | 960 | 1600; height: number; blob: Blob }[] = [];
  try {
    for (const width of RESPONSIVE_WIDTHS) {
      if (width >= bitmap.width) continue;
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!blob || blob.type !== 'image/webp') break;
      out.push({ width, height, blob });
    }
  } finally {
    bitmap.close();
  }
  return out;
}

/** srcset for a CMS library URL; the media route falls back to the original when a size is missing. */
export function cmsSrcSet(url: string, originalWidth?: number | null): string | undefined {
  if (!url.startsWith('/api/public/cms-media/')) return undefined;
  const widths = RESPONSIVE_WIDTHS.filter(w => !originalWidth || w < originalWidth);
  if (!widths.length) return undefined;
  return [...widths.map(w => `${url}?w=${w} ${w}w`), ...(originalWidth ? [`${url} ${originalWidth}w`] : [])].join(', ');
}
