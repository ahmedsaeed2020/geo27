/**
 * DIGIT Enterprise shared brand surfaces (owner decision DEC-03, 2026-11-11) — built ONCE here, used by every app:
 *  - EntDialog   centred dialog (forms, pickers, confirmations, "Get Items From")
 *  - EntDrawer   side panel / split view on desktop, bottom drawer on phones
 *  - EntPopover  anchored popup (column filters, quick menus, previews)
 *  - EntSplit    list + detail split view in the work area (phone: one pane at a time)
 * Look: white framed surface on the warm canvas, mint highlight, brand header with icon tile, soft shadow, the emphasized
 * title font. All overlays render in a portal above charts and menus (z-index token --ent-z-overlay), trap focus, close on
 * Esc and return focus to the opener (Radix primitives). Quick View (QuickView.tsx) uses the same surface classes.
 */
import { useUnderBand } from "./underBand";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useLang } from "@/i18n";

export type SurfaceTone = "brand" | "neutral" | "warn";
interface HeadProps { title: ReactNode; kicker?: ReactNode | undefined; icon?: ReactNode | undefined; actions?: ReactNode | undefined; tone?: SurfaceTone | undefined }

function SurfaceHead({ title, kicker, icon, actions, tone = "brand" }: HeadProps) {
  const ar = useLang() === "ar";
  return <header className="ent-sf-head" data-tone={tone}>
    {icon && <span className="ent-sf-icon" aria-hidden>{icon}</span>}
    <div className="min-w-0 flex-1">
      {kicker && <div className="ent-sf-kicker">{kicker}</div>}
      <DialogPrimitive.Title className="ent-sf-title">{title}</DialogPrimitive.Title>
    </div>
    {actions}
    <DialogPrimitive.Close className="ent-sf-close" aria-label={ar ? "إغلاق" : "Close"} data-ent-sf-close><X className="h-4 w-4" /></DialogPrimitive.Close>
  </header>;
}

export interface EntDialogProps extends HeadProps {
  open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode; footer?: ReactNode | undefined;
  size?: "sm" | "md" | "lg" | "xl" | undefined; description?: ReactNode | undefined; id?: string | undefined;
}
/** Centred brand dialog. */
export function EntDialog({ open, onOpenChange, children, footer, size = "md", description, id, ...head }: EntDialogProps) {
  const dir = useLang() === "ar" ? "rtl" : "ltr";
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ent-sf-scrim" />
      <DialogPrimitive.Content className="ent-sf ent-sf-dialog" data-size={size} dir={dir} data-ent-surface="dialog" {...(id ? { "data-ent-surface-id": id } : {})}
        {...(description ? {} : { "aria-describedby": undefined })}>
        <SurfaceHead {...head} />
        {description && <DialogPrimitive.Description className="ent-sf-desc">{description}</DialogPrimitive.Description>}
        <div className="ent-sf-body">{children}</div>
        {footer && <footer className="ent-sf-foot">{footer}</footer>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export interface EntDrawerProps extends EntDialogProps { side?: "end" | "start" | "bottom" | "center" | undefined; modal?: boolean | undefined }
/** Side panel (desktop: from the inline end, the split-view width) / bottom drawer (phones, or side="bottom"). */
export function EntDrawer({ open, onOpenChange, children, footer, side = "end", modal = true, description, id, size = "md", ...head }: EntDrawerProps) {
  const dir = useLang() === "ar" ? "rtl" : "ltr";
  // Physical side is language-aware: left in Arabic, right in English. Legacy side="start" follows the same rule.
  const placed = side === "start" ? "end" : side;
  // owner notes A-03 / A-04: drawers and centred create panels start under the green band, full height below it
  useUnderBand(!!open);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
    <DialogPrimitive.Portal>
      {modal && <DialogPrimitive.Overlay className="ent-sf-scrim ent-sf-scrim-soft" />}
      <DialogPrimitive.Content className="ent-sf ent-sf-drawer" data-side={placed} data-size={size} dir={dir} data-ent-surface="drawer" {...(id ? { "data-ent-surface-id": id } : {})}
        {...(description ? {} : { "aria-describedby": undefined })}>
        <SurfaceHead {...head} />
        {description && <DialogPrimitive.Description className="ent-sf-desc">{description}</DialogPrimitive.Description>}
        <div className="ent-sf-body">{children}</div>
        {footer && <footer className="ent-sf-foot">{footer}</footer>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

/** Anchored brand popup (column filters, quick menus). `trigger` must be a single focusable element. */
export function EntPopover({ trigger, title, children, open, onOpenChange, align = "start", width = 300 }: {
  trigger: ReactNode; title?: ReactNode; children: ReactNode; open?: boolean | undefined; onOpenChange?: ((o: boolean) => void) | undefined; align?: "start" | "center" | "end"; width?: number;
}) {
  const dir = useLang() === "ar" ? "rtl" : "ltr";
  const ctl = open === undefined ? {} : { open, ...(onOpenChange ? { onOpenChange } : {}) };
  return <PopoverPrimitive.Root {...ctl}>
    <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={6} collisionPadding={8} className="ent-sf ent-sf-pop" dir={dir} style={{ width }} data-ent-surface="popover">
        {title && <div className="ent-sf-pop-h">{title}</div>}
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}

/** List + detail split view inside the work area: detail pane opens beside the list (desktop) or replaces it (phones). */
export function EntSplit({ list, detail, onCloseDetail, detailTitle }: { list: ReactNode; detail?: ReactNode | undefined; onCloseDetail?: (() => void) | undefined; detailTitle?: ReactNode }) {
  const ar = useLang() === "ar";
  return <div className="ent-split" data-ent-split={detail ? "open" : "closed"}>
    <div className="ent-split-list">{list}</div>
    {detail && <section className="ent-sf ent-split-detail" aria-label={typeof detailTitle === "string" ? detailTitle : undefined} data-ent-split-detail>
      <header className="ent-sf-head"><div className="ent-sf-title min-w-0 flex-1">{detailTitle}</div>
        {onCloseDetail && <button type="button" className="ent-sf-close" aria-label={ar ? "إغلاق" : "Close"} onClick={onCloseDetail} data-ent-split-close><X className="h-4 w-4" /></button>}</header>
      <div className="ent-sf-body">{detail}</div>
    </section>}
  </div>;
}

/** Brand section frame inside surfaces and pages: white framed box with an emphasized title (OWN-38 / OWN-40). */
export function EntFrame({ title, note, actions, children, id }: { title?: ReactNode; note?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return <section className="ent-frame" {...(id ? { "data-ent-frame": id } : { "data-ent-frame": "" })}>
    {(title || actions) && <header className="ent-frame-h"><div className="min-w-0 flex-1">{title && <h3 className="ent-title">{title}</h3>}{note && <p className="ent-frame-note">{note}</p>}</div>{actions}</header>}
    <div className="ent-frame-b">{children}</div>
  </section>;
}
