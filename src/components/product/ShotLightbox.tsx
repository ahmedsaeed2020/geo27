import { useRef, type CSSProperties, type KeyboardEvent } from "react";
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

/** Full-size screenshot viewer: Esc or a click closes it; arrows move within the same section. */
export default function ShotLightbox({ shots, index, onIndexChange, onClose }: Props) {
  const locale = useLocale();
  const opener = useRef<HTMLElement | null>(null);
  const current = index === null ? undefined : shots[index];
  const multiple = shots.length > 1;
  const step = (delta: number) => {
    if (index === null) return;
    onIndexChange((index + delta + shots.length) % shots.length);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!multiple || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    // In Arabic the next screen sits to the left.
    const forward = event.key === (locale === "ar" ? "ArrowLeft" : "ArrowRight");
    step(forward ? 1 : -1);
  };
  const PrevIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "ar" ? ChevronLeft : ChevronRight;
  const zoom = current && current.width < 700 ? 1.5 : 1;
  // A higher-resolution derivative, when the screen has one, keeps small UI text legible at full size.
  const image = current?.full ?? current;
  return (
    <Dialog.Root open={Boolean(current)} onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="pp-lb-overlay" />
        <Dialog.Content
          className="pp-lb"
          dir={locale === "ar" ? "rtl" : "ltr"}
          lang={locale}
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
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
