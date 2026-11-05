/**
 * DIGIT motion runtime: one scroll driver for every scroll-linked scene on a page.
 *
 * Scenes register an element and an update callback. An IntersectionObserver keeps a scene active only while it is
 * near the viewport, and a single passive scroll/resize listener batches all active scenes into one animation frame,
 * so off-screen scenes cost nothing and no component installs its own scroll handler.
 */

export type MotionTier = 'none' | 'lite' | 'full';
export type SceneUpdate = (progress: number, rect: DOMRect, viewport: number) => void;

type Scene = { el: Element; update: SceneUpdate; active: boolean };

const scenes = new Set<Scene>();
const byElement = new Map<Element, Scene>();
let observer: IntersectionObserver | null = null;
let frame = 0;
let listening = false;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** No motion (reduced-motion preference), lite (touch, narrow or tablet screens) or full desktop choreography. */
export function motionTier(): MotionTier {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'none';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'none';
  return window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches ? 'full' : 'lite';
}

function run() {
  frame = 0;
  const viewport = window.innerHeight || 1;
  for (const scene of scenes) {
    if (!scene.active) continue;
    const rect = scene.el.getBoundingClientRect();
    // 0 when the element's top meets the bottom of the viewport, 1 when its bottom leaves the top.
    scene.update(clamp((viewport - rect.top) / (viewport + rect.height)), rect, viewport);
  }
}

function request() {
  if (!frame) frame = requestAnimationFrame(run);
}

function listen(on: boolean) {
  if (on === listening) return;
  listening = on;
  if (on) {
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
  } else {
    window.removeEventListener('scroll', request);
    window.removeEventListener('resize', request);
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

function ensureObserver(): IntersectionObserver {
  if (observer) return observer;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const scene = byElement.get(entry.target);
      if (scene) scene.active = entry.isIntersecting;
    }
    request();
  }, { rootMargin: '25% 0px 25% 0px' });
  return observer;
}

/** Track `el` while it is near the viewport; returns the cleanup that unregisters it. */
export function registerScene(el: Element, update: SceneUpdate): () => void {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return () => {};
  const scene: Scene = { el, update, active: false };
  scenes.add(scene);
  byElement.set(el, scene);
  ensureObserver().observe(el);
  listen(true);
  return () => {
    scenes.delete(scene);
    if (byElement.get(el) === scene) byElement.delete(el);
    observer?.unobserve(el);
    if (scenes.size === 0) listen(false);
  };
}

/** Index of the chapter a 0–1 progress value falls in, for `count` equal chapters. */
export function chapterAt(progress: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(clamp(progress) * count)));
}
