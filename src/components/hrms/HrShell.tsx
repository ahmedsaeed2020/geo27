// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { DevOnly } from "@/components/DevOnly";
import { LangToggle } from "@/i18n/LangToggle";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { CURRENT_EMPLOYEE_NAME, HR_APP_SOURCE } from "@/lib/hrms";
import { DateInput } from "@/components/form/DateInput";

/**
 * Mobile chrome modelled on hrms/frontend/src/components/BaseLayout.vue,
 * BottomTabs.vue and TabButtons.vue. Rendered inside a phone-width frame like
 * the source's `sm:w-96` ion-content.
 */

/**
 * Adapter records live in localStorage, so anything reading them must render
 * only after hydration (otherwise SSR HTML shows an empty store and React
 * reports a hydration mismatch).
 */
/**
 * False while React hydrates server markup, true afterwards — and true from the first render for anything mounted after
 * hydration (useSyncExternalStore server/client snapshots), so late-mounted chrome never paints one stale "not hydrated"
 * frame that heavy work on the same tick could leave on screen.
 */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, isClient, isServer);
}
const noopSubscribe = () => () => {};
const isClient = () => true;
const isServer = () => false;

export function HrFrame({ children, source, toggle = false }: { children: ReactNode; source?: string; toggle?: boolean }) {
  return (
    <div className="min-h-screen bg-muted py-6">
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-lg min-h-[calc(100vh-3rem)] flex flex-col">
        {toggle && <div className="flex justify-center bg-muted/60 px-3 pt-1"><LangToggle /></div>}
        <DevOnly><div className="bg-muted/60 px-3 py-1 text-center text-[10px] text-muted-foreground">
          DIGIT HR app preview — reconstructed from {source ?? HR_APP_SOURCE}; synthetic data, no DIGIT server.
        </div></DevOnly>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

/** BaseLayout.vue: page title + notifications bell + profile avatar. */
export function BaseLayout({ title, back, children, tabs }: { title: string; back?: boolean; children: ReactNode; tabs?: boolean }) {
  const hydrated = useHydrated();
  return (
    <>
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {back && <Link to="/hr/home" className="rounded px-1 text-lg text-muted-foreground hover:bg-muted" aria-label="Back">‹</Link>}
            <h2 className="text-lg font-bold">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <LangToggle />
            <Link to="/hr/notifications" aria-label="Notifications" className="relative text-lg">🔔</Link>
            <Link to="/hr/profile" className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground" aria-label="Profile">
              {CURRENT_EMPLOYEE_NAME[0]}
            </Link>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-card px-4 py-4 pb-24">
        {hydrated ? children : <p className="py-10 text-center text-sm text-muted-foreground">Loading records…</p>}
      </div>
      {tabs && <BottomTabs />}
    </>
  );
}

/** BottomTabs.vue tab items in source order. */
const TAB_ITEMS = [
  { title: "Home", to: "/hr/home", icon: "⌂" },
  { title: "Attendance", to: "/hr/dashboard/attendance", icon: "◷" },
  { title: "Leaves", to: "/hr/dashboard/leaves", icon: "☘" },
  { title: "Expenses", to: "/hr/dashboard/expense-claims", icon: "❋" },
  { title: "Salary", to: "/hr/dashboard/salary-slips", icon: "❒" },
] as const;

export function BottomTabs() {
  const match = useMatchRoute();
  return (
    <nav className="sticky bottom-0 z-20 mx-[-1rem] mb-[-1rem] flex border-t border-border bg-card px-1 py-2 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      {TAB_ITEMS.map((t) => {
        const active = !!match({ to: t.to, fuzzy: true });
        return (
          <Link key={t.title} to={t.to} className={`flex flex-1 flex-col items-center gap-1 rounded px-1 py-1 text-[11px] ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            <span className="text-lg leading-none">{t.icon}</span>
            {t.title}
          </Link>
        );
      })}
    </nav>
  );
}

/** TabButtons.vue — segmented control used by lists and RequestPanel. */
export function TabButtons({ buttons, value, onChange }: { buttons: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3 flex rounded-lg bg-muted p-1 text-sm">
      {buttons.map((b) => (
        <button key={b} onClick={() => onChange(b)} className={`flex-1 rounded-md px-2 py-1.5 ${value === b ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>{b}</button>
      ))}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

const STATUS_TONES: Record<string, string> = {
  Approved: "var(--success)", Open: "var(--warning)", Draft: "var(--muted-foreground)", Rejected: "var(--destructive)",
  Present: "var(--success)", Absent: "var(--destructive)", "Half Day": "var(--warning)", Paid: "var(--success)",
  Unpaid: "var(--warning)", Submitted: "var(--primary)", Active: "var(--success)", IN: "var(--success)", OUT: "var(--muted-foreground)",
};

export function StatusChip({ value }: { value?: unknown }) {
  const s = String(value ?? "");
  if (!s) return null;
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `color-mix(in oklab, ${STATUS_TONES[s] ?? "var(--accent)"} 15%, transparent)`, color: STATUS_TONES[s] ?? "var(--accent-foreground)" }}>
      {s}
    </span>
  );
}

/**
 * RequestList.vue + item components (LeaveRequestItem, AttendanceRequestItem, …):
 * card rows with a right chevron. Callers wrap in a typed <Link> when the row
 * opens a record.
 */
export function Row({ title, subtitle, status, amount }: { title: ReactNode; subtitle?: ReactNode; status?: unknown; amount?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-1 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-2">
        {amount != null && <span className="text-sm font-semibold">{amount}</span>}
        <StatusChip value={status} />
        <span className="text-muted-foreground">›</span>
      </div>
    </div>
  );
}

/** Simple collapsible filter panel standing in for the source ListView filter modal. */
export function FilterPanel({ filters, values, onChange }: {
  filters: { fieldname: string; label: string; options?: string | string[]; fieldtype: string }[];
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = Object.values(values).filter(Boolean).length;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <button className="rounded border border-border px-3 py-1.5 text-sm" onClick={() => setOpen(!open)}>
          Filters{active ? ` (${active})` : ""}
        </button>
        {active > 0 && <button className="text-xs text-primary underline" onClick={() => onChange({})}>Clear</button>}
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
          {filters.map((f) => (
            <label key={f.fieldname} className="block text-xs">
              <span className="mb-1 block text-muted-foreground">{f.label}</span>
              {f.fieldtype === "Select" && Array.isArray(f.options) ? (
                <select className="field-input" value={values[f.fieldname] ?? ""} onChange={(e) => onChange({ ...values, [f.fieldname]: e.target.value })}>
                  <option value="">Any</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.fieldtype === "Date" ? (
                <DateInput className="field-input" value={values[f.fieldname] ?? ""} onChange={(e) => onChange({ ...values, [f.fieldname]: e.target.value })} />
              ) : (
                <input type="text" className="field-input" value={values[f.fieldname] ?? ""} onChange={(e) => onChange({ ...values, [f.fieldname]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
