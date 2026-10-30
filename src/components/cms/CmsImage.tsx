import type { CSSProperties } from 'react';
import { cmsSrcSet } from '@/lib/image-variants';
import { useCmsMedia } from './CmsContext';

/**
 * A library image on a public page: reserves its real aspect ratio, offers resized versions to smaller screens,
 * and crops around the focal point chosen in the media library.
 */
export default function CmsImage({ url, alt, className, sizes = '(max-width: 768px) 100vw, 1152px', fit = 'contain', style }: { url: string; alt: string; className?: string; sizes?: string; fit?: 'contain' | 'cover'; style?: CSSProperties }) {
  const meta = useCmsMedia(url);
  const width = meta?.width ?? 1200;
  const height = meta?.height ?? 800;
  const srcSet = cmsSrcSet(url, meta?.width);
  return (
    <img
      src={url}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ aspectRatio: `${width} / ${height}`, objectFit: fit, objectPosition: `${meta?.focalX ?? 50}% ${meta?.focalY ?? 50}%`, ...style }}
    />
  );
}
