import type { ReactNode } from "react";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { useTx } from "./DigitHrLayout";

/** Phase 5 semantic tone for a stored status value. Stored values stay untranslated in data; only the label is localized. */
const TONES: Record<string, "success" | "warn" | "danger" | "info" | "neutral"> = {
  Active: "success", Valid: "success", Approved: "success", Present: "success", Submitted: "info", Paid: "success", Renewed: "info",
  Open: "warn", Pending: "warn", Expiring: "warn", Draft: "neutral", "On Leave": "info", "Half Day": "warn", "Work From Home": "info",
  Inactive: "neutral", Suspended: "warn", Left: "danger", Expired: "danger", Rejected: "danger", Absent: "danger", Cancelled: "danger",
};
const AR: Record<string, string> = {
  Active: "نشط", Inactive: "غير نشط", Suspended: "موقوف", Left: "غادر", Valid: "سارية", Expiring: "قاربت على الانتهاء", Expired: "منتهية", Renewed: "مُجدّدة",
  Open: "مفتوح", Approved: "معتمد", Rejected: "مرفوض", Cancelled: "ملغى", Draft: "مسودة", Submitted: "مُقدَّم", Paid: "مدفوع",
  Present: "حاضر", Absent: "غائب", "On Leave": "في إجازة", "Half Day": "نصف يوم", "Work From Home": "عمل عن بعد", Pending: "معلّق",
};

export function StatusBadge({ value }: { value: unknown }) {
  const { lang } = useTx(); const v = String(value ?? "");
  if (!v) return <span className="text-muted-foreground">—</span>;
  return <span className="dhr-badge" data-tone={TONES[v] ?? "neutral"} data-status={v}>{lang === "ar" ? AR[v] ?? v : v}</span>;
}

/**
 * Page header (Visual Fidelity V2): compact page identity on the canvas (module eyebrow + title), then the two-tone green
 * command band carrying the page's existing question/subtitle, context row and actions. Pages with only a title (records,
 * empty states) keep the compact identity alone and their actions stay beside it — nothing is added to fill a band.
 */
export function ModuleBand({ eyebrow, title, subtitle, actions, children, compact, chips }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; /** record pages: subtitle (record kind) sits under the title; no band */ compact?: boolean; /** live headline chips on the band (visual round R3) */ chips?: ReactNode }) {
  // ONE STANDARD (owner 2026-11-12): the page title, question and actions live in the shared Enterprise band; the page's
  // context row (scope controls, stats) follows directly under it in a shared card, never as white controls on the band
  const band = !compact && !!(subtitle || children);
  return (
    <header className="dhr-pagehead mb-4" data-dhr-band data-band-mode={band ? "band" : "identity"}>
      <ContextStrip icon={<img src="/icons/digit/mod/digit-mod-hr-dark.svg" alt="" className="h-6 w-6" />} eyebrow={eyebrow} title={<span className="dhr-display">{title}</span>} sub={subtitle} actions={actions} chips={chips} />
      {children && <div className="ek-card ek-filterbar dhr-band-ctx mt-3" data-dhr-cmdband>{children}</div>}
    </header>
  );
}

/** Compact stat chip inside a band (values always from real records). */
export function BandStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="dhr-bandstat"><div className="dhr-bandstat-l">{label}</div><div className="dhr-display dhr-bandstat-v" data-no-i18n>{value}</div></div>;
}
