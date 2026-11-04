import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import ShotFrame, { type FrameSize } from '@/components/product/ShotFrame';
import ShotLightbox from '@/components/product/ShotLightbox';
import { SHOTS, type Shot } from '@/content/product-shots';
import type { ShotRef } from '@/content/pro/types';
import { useLocale } from '@/lib/i18n';
import { PRO_COPY as C } from './pro-copy';

export const shotOf = (id: string | undefined): Shot | undefined => (id ? SHOTS[id] : undefined);

/** Unique real screens of a section, in order of first appearance, for one shared lightbox. */
export function useSectionLightbox(ids: (string | undefined)[]) {
  const shots = useMemo(() => {
    const seen = new Set<string>();
    const out: Shot[] = [];
    for (const id of ids) {
      const s = shotOf(id);
      if (s && !seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|')]);
  const [index, setIndex] = useState<number | null>(null);
  const open = (id: string) => {
    const i = shots.findIndex(s => s.id === id);
    if (i >= 0) setIndex(i);
  };
  const node = <ShotLightbox shots={shots} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />;
  return { open, node };
}

/** Magnified region of the same image, beside its frame; decorative (the full screen is one click away). */
function Lens({ shot, focus }: { shot: Shot; focus: NonNullable<ShotRef['focus']> }) {
  const locale = useLocale();
  return (
    <figure className="pv-lens" aria-hidden="true">
      <span
        className="pv-lens-view"
        style={{ backgroundImage: `url("${shot.src}")`, backgroundSize: `${focus.zoom * 100}% auto`, backgroundPosition: `${focus.x}% ${focus.y}%` } as CSSProperties}
      />
      <figcaption>
        <Search />
        {C.magnified[locale]}
      </figcaption>
    </figure>
  );
}

type ScreenProps = { refId: ShotRef | string | undefined; size?: FrameSize; caption?: boolean; motion?: boolean; open: (id: string) => void; children?: ReactNode };

/** One real DIGIT Pro screen in the shared frame, with its optional close-up. */
export function ProScreen({ refId, size = 'lead', caption = true, motion = false, open, children }: ScreenProps) {
  const ref = typeof refId === 'string' ? { id: refId } : refId;
  const shot = shotOf(ref?.id);
  if (!shot || !ref) return null;
  const frame = <ShotFrame shot={shot} size={size} caption={caption} motion={motion} onOpen={() => open(shot.id)} />;
  if (!ref.focus) return children ? <div className="pv-screen">{frame}{children}</div> : frame;
  return (
    <div className="pv-screen" data-lens="">
      {frame}
      <Lens shot={shot} focus={ref.focus} />
      {children}
    </div>
  );
}
