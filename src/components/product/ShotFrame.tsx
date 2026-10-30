import type { CSSProperties } from "react";
import { Maximize2 } from "lucide-react";
import type { Shot } from "@/content/product-shots";
import { PROOF_COPY } from "@/content/product-proof";
import { useLocale } from "@/lib/i18n";

export type FrameMode = "screen" | "column" | "detail";
export type FrameSize = "lead" | "card" | "thumb";

/**
 * screen: full-page captures fill the frame from the top.
 * column: narrow, tall captures sit as a centered column cropped from the top.
 * detail: wide strips and small widgets are shown whole on a soft canvas (never upscaled).
 */
export function frameMode(shot: Shot): FrameMode {
  const ratio = shot.width / shot.height;
  if (shot.width >= 900 && ratio <= 1.8) return "screen";
  if (shot.width < 900 && ratio < 1.2) return "column";
  return "detail";
}

function frameRatio(shot: Shot, size: FrameSize, mode: FrameMode): number {
  if (size !== "lead" || mode !== "detail") return 16 / 10;
  return Math.min(Math.max(shot.width / shot.height, 1.6), 2.4);
}

type Props = {
  shot: Shot;
  size?: FrameSize;
  mode?: FrameMode;
  caption?: boolean;
  motion?: boolean;
  onOpen: () => void;
};

export default function ShotFrame({ shot, size = "card", mode: forcedMode, caption = true, motion = false, onOpen }: Props) {
  const locale = useLocale();
  const mode = forcedMode ?? frameMode(shot);
  const text = shot.caption[locale];
  const style = { "--pp-ratio": String(frameRatio(shot, size, mode)), "--pp-w": `${shot.width}px` } as CSSProperties;
  return (
    <figure className="pp-shot" data-size={size} data-motion-card={motion ? "" : undefined}>
      <button type="button" className="pp-frame" data-mode={mode} style={style} onClick={onOpen} aria-label={`${PROOF_COPY.enlarge[locale]}: ${text}`} aria-haspopup="dialog">
        <span className="pp-frame-bar" aria-hidden="true"><span /><span /><span /></span>
        <span className="pp-frame-body">
          <img src={shot.src} width={shot.width} height={shot.height} alt={text} loading="lazy" decoding="async" />
        </span>
        <span className="pp-frame-zoom" aria-hidden="true"><Maximize2 /></span>
      </button>
      {caption && <figcaption>{text}</figcaption>}
    </figure>
  );
}
