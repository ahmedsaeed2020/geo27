import type { CSSProperties } from 'react';
import { useMotionIdentity } from '@/motion/identity';

/**
 * The DIGIT Flowline hero signature: a precise line at the seam between the copy and the photograph whose nodes use
 * the product's own glyph (documents, people, courses, stages, sites, beats). Presentation only — it carries no
 * content, sits behind the copy and is hidden from assistive technology.
 */
export default function HeroFlowline() {
  const identity = useMotionIdentity();
  const glyph = identity === 'home' ? 'site' : identity;
  return (
    <span className="dm-flowline" data-glyph={glyph} aria-hidden="true">
      <span className="dm-flowline-track" />
      {[0, 1, 2, 3].map(k => <span key={k} className="dm-flowline-node" style={{ '--k': k } as CSSProperties} />)}
      <span className="dm-flowline-signal" />
    </span>
  );
}
