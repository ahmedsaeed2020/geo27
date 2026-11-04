import { getPageScene } from '@/components/PageScene';

type Kind = 'intro' | 'cta';

/** The HR module's character scene key in the shared page-scenes manifest. */
export const hrSceneKey = (slug: string) => `hr-${slug}`;
export const hasHrScene = (slug: string) => !!getPageScene(hrSceneKey(slug));

/**
 * Decorative character photograph behind an HR section: `intro` uses the scene background, `cta` the scene body.
 * Purely atmospheric (aria-hidden, empty alt); the section's own text and controls sit above it.
 */
export default function HrScene({ slug, kind }: { slug: string; kind: Kind }) {
  const scene = getPageScene(hrSceneKey(slug));
  if (!scene) return null;
  const src = kind === 'intro' ? scene.background : scene.body;
  const small = kind === 'intro' ? scene.backgroundSmall : scene.bodySmall;
  return (
    <div className="hr-scene" data-kind={kind} aria-hidden="true">
      <img
        src={src}
        srcSet={small ? `${small} 960w, ${src} 1920w` : undefined}
        sizes={kind === 'intro' ? '(max-width: 760px) 100vw, 52vw' : '100vw'}
        alt=""
        width={scene.bodyWidth ?? 1920}
        height={scene.bodyHeight ?? 960}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
