/**
 * Standard working panel (owner addendum A, 2026-10-19): every section of a DIGIT work area sits in one white panel —
 * #FFFFFF, 1px #D7DEDA border, 10px radius, 16px padding (12px on phones), 16px between panels — with an 18px/600 ink
 * title, an optional 12px muted subtitle and optional title actions on the opposite edge. Tables inside use the full
 * panel width with the muted #EBEFEC header row. `PanelGrid` puts two side-by-side sections in a grid that stacks to one
 * column below 1024px; a narrow table (≤ 4 columns) goes in a half-width panel (`half`) instead of stretching the page.
 * Presentation only: callers pass the content they already render.
 */
import type { ReactNode } from "react";

export function SectionPanel({ title, subtitle, actions, children, half, id, className, as: Tag = "section", ...data }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; half?: boolean | undefined; id?: string | undefined; className?: string | undefined; as?: "section" | "div" | "article";
} & Record<`data-${string}`, string | number | boolean | undefined>) {
  const headId = id ? `${id}-title` : undefined;
  return (
    <Tag className={`dx-sec ${half ? "dx-sec-half" : ""} ${className ?? ""}`} aria-labelledby={title ? headId : undefined} data-dx-section {...data}>
      {(title || actions) && (
        <header className="dx-sec-head">
          <div className="dx-sec-titles">
            {title && <h2 id={headId} className="dx-sec-title">{title}</h2>}
            {subtitle && <p className="dx-sec-sub">{subtitle}</p>}
          </div>
          {actions && <div className="dx-sec-actions">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}

/** Two (or more) panels side by side from 1024px, one column below. */
export function PanelGrid({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <div className={`dx-sec-grid ${className ?? ""}`} data-dx-section-grid>{children}</div>;
}
