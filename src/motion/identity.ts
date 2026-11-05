import { useRouterState } from '@tanstack/react-router';
import { contextForPath, type ProductKey } from '@/content/catalog';

/** Each product family has its own motion identity; the home page and corporate pages share the site identity. */
export type MotionIdentity = ProductKey | 'home' | 'site';

export function motionIdentity(pathname: string): MotionIdentity {
  const path = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  if (path === '/') return 'home';
  return contextForPath(path).product || 'site';
}

export function useMotionIdentity(): MotionIdentity {
  return useRouterState({ select: s => motionIdentity(s.location.pathname) });
}
