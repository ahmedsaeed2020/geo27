import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Shot } from "@/content/product-shots";
import { PROOF_COPY } from "@/content/product-proof";
import { useLocale } from "@/lib/i18n";

type Props = {
  shots: Shot[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

// Safari does not focus buttons on click, so the element under the last pointer press also identifies the opener.
let lastPress: Element | null = null;
if (typeof document !== "undefined") document.addEventListener("pointerdown", event => { lastPress = event.target instanceof Element ? event.target : null; }, true);

/** The visible box of the screen that opened the viewer (its frame image), if it is still on screen. */
function sourceBox(opener: Element | null): DOMRect | null {
  const frame = opener?.closest("button, a, [role='button']") ?? opener;
  const img = frame instanceof HTMLImageElement ? frame : frame?.querySelector("img");
  const box = img?.getBoundingClientRect();
  if (!box || box.width < 24 || box.height < 24 || box.bottom < 0 || box.top > window.innerHeight) return null;
  return box;
}

/**
 * Full-size screenshot viewer: Esc or a click closes it; arrows move within the same section. On open the original
 * screen grows out of the frame that opened it (FLIP); stepping slides in reading direction. The image itself is the
 * unmodified original and stays accessible; reduced motion opens it in place.
 */
export default function ShotLightbox({ shots, index, onIndexChange, onClose }: Props) {
  const locale = useLocale();
  const opener = useRef<HTMLElement | null>(null);
  const source = useRef<DOMRect | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [stepDir, setStepDir] = useState<"next" | "prev" | null>(null);
  const current = index === null ? undefined : shots[index];
  const isOpen = Boolean(current);
  const multiple = shots.length > 1;
  const step = (delta: number) => {
    if (index === null) return;
    setStepDir(delta > 0 ? "next" : "prev");
    onIndexChange((index + delta + shots.length) % shots.length);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!multiple || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    // In Arabic the next screen sits to the left.
    const forward = event.key === (locale === "ar" ? "ArrowLeft" : "ArrowRight");
    step(forward ? 1 : -1);
  };

  // Measure the opening frame before the dialog paints over it.
  if (isOpen && !opener.current && !source.current && typeof document !== "undefined") {
    const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    source.current = sourceBox(active ?? lastPress);
  }

  useEffect(() => {
    if (!isOpen) {
      setStepDir(null);
      source.current = null;
      return;
    }
    const img = imgRef.current;
    const from = source.current;
    source.current = null;
    if (!img || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof img.animate !== "function") return;
    let frame = 0;
    const run = () => {
      const to = img.getBoundingClientRect();
      if (!to.width || !to.height) return;
      const scale = from.width / to.width;
      const hidden = Math.max(0, to.height - from.height / scale);
      img.animate(
        [
          { transformOrigin: "0 0", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`, clipPath: `inset(0 0 ${hidden}px 0 round ${10 / scale}px)` },
          { transformOrigin: "0 0", transform: "none", clipPath: "inset(0 0 0 0 round 10px)" },
        ],
        { duration: 540, easing: "cubic-bezier(.16, 1, .3, 1)" },
      );
    };
    if (img.complete && img.naturalWidth) frame = requestAnimationFrame(run);
    else img.addEventListener("load", () => { frame = requestAnimationFrame(run); }, { once: true });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const PrevIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "ar" ? ChevronLeft : ChevronRight;
  const zoom = current && current.width < 700 ? 1.5 : 1;
  // A higher-resolution derivative, when the screen has one, keeps small UI text legible at full size.
  const image = current?.full ?? current;
  return (
    <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="pp-lb-overlay" />
        <Dialog.Content
          className="pp-lb"
          dir={locale === "ar" ? "rtl" : "ltr"}
          lang={locale}
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
          data-step={stepDir ?? undefined}
          // There is no Dialog.Trigger, so remember the frame that opened the viewer and return focus to it on close.
          onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={event => {
            const el = opener.current;
            opener.current = null;
            if (el?.isConnected) { event.preventDefault(); el.focus({ preventScroll: true }); }
          }}
        >
          {current && <>
            <div className="pp-lb-top">
              {multiple && <span className="pp-lb-count" dir="ltr">{(index ?? 0) + 1} / {shots.length}</span>}
              <Dialog.Title className="pp-lb-caption">{current.caption[locale]}</Dialog.Title>
              <Dialog.Close className="pp-lb-btn" aria-label={PROOF_COPY.close[locale]} title={PROOF_COPY.close[locale]}><X /></Dialog.Close>
            </div>
            <div className="pp-lb-stage" onClick={onClose}>
              <img
                key={current.id}
                ref={imgRef}
                className="pp-lb-img"
                src={image?.src}
                width={image?.width}
                height={image?.height}
                alt={current.caption[locale]}
                style={{ "--pp-w": `${image?.width ?? current.width}px`, "--pp-zoom": String(zoom) } as CSSProperties}
              />
            </div>
            {multiple && <>
              <button type="button" className="pp-lb-btn pp-lb-nav pp-lb-prev" aria-label={PROOF_COPY.previous[locale]} title={PROOF_COPY.previous[locale]} onClick={() => step(-1)}><PrevIcon /></button>
              <button type="button" className="pp-lb-btn pp-lb-nav pp-lb-next" aria-label={PROOF_COPY.next[locale]} title={PROOF_COPY.next[locale]} onClick={() => step(1)}><NextIcon /></button>
            </>}
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
