/**
 * Workspace switcher (Navigation V2): خدمات ميدانية / فحص وسلامة / الكل. The choice is a per-user presentation
 * preference kept in this browser (key per simulated session user), like the Shell's other view preferences; it only
 * changes which sections, KPIs and worklists are shown FIRST — it never hides a record, a route or a permission.
 * SSR and the first client render use "all", so hydration never mismatches.
 */
import { useSyncExternalStore } from "react";
import { currentUser, subscribeSession } from "@/lib/session";
import type { WorkspaceMode } from "../screens";
import { FSM_EXPERIENCES } from "../screens";
import { AppLink, useFx } from "./kit";

const KEY = (u: string) => `digit-fsm:workspace-mode:${u}`;
const subs = new Set<() => void>();
const MODES: WorkspaceMode[] = ["field", "itm", "all"];
function read(): WorkspaceMode {
  if (typeof window === "undefined") return "all";
  try { const v = window.localStorage.getItem(KEY(currentUser())); return MODES.includes(v as WorkspaceMode) ? (v as WorkspaceMode) : "all"; } catch { return "all"; }
}
export function setWorkspaceMode(m: WorkspaceMode) {
  try { window.localStorage.setItem(KEY(currentUser()), m); } catch { /* storage unavailable: the choice lasts for this page only */ }
  subs.forEach((f) => f());
}
function subscribe(f: () => void) {
  subs.add(f); const off = subscribeSession(f);
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("digit-fsm:workspace-mode:")) f(); };
  window.addEventListener("storage", onStorage);
  return () => { subs.delete(f); off(); window.removeEventListener("storage", onStorage); };
}
export function useWorkspaceMode(): WorkspaceMode { return useSyncExternalStore(subscribe, read, () => "all"); }

export const MODE_LABEL: Record<WorkspaceMode, [string, string]> = { field: ["Field Services", "خدمات ميدانية"], itm: ["Inspection & Safety", "فحص وسلامة"], all: ["All", "الكل"] };
export const MODE_HINT: Record<WorkspaceMode, [string, string]> = {
  field: ["Requests, agreements, jobs, visits, dispatch, parts and billing first.", "الطلبات والعقود وأوامر العمل والزيارات والجدولة والمواد والفوترة أولاً."],
  itm: ["Inspection runs, technical review, findings, impairments, retests and closure first.", "تشغيلات الفحص والمراجعة الفنية والملاحظات والتعطّلات وإعادة الفحص والإغلاق أولاً."],
  all: ["Everything, in the standard order.", "كل شيء بالترتيب المعتاد."],
};

/** Segmented control at the top of every DIGIT FSM page, plus the two separate experiences. */
export function WorkspaceSwitcher() {
  const { t, ar } = useFx(); const mode = useWorkspaceMode();
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-fsm-switcher data-mode={mode}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span id="fsm-ws-label" className="text-[12px] font-medium text-muted-foreground">{t("Workspace", "مساحة العمل")}</span>
        <div role="radiogroup" aria-labelledby="fsm-ws-label" className="inline-flex rounded-md border border-border bg-card p-0.5 shadow-sm">
          {MODES.map((m) => {
            const on = m === mode;
            return (
              <button key={m} type="button" role="radio" aria-checked={on} data-mode-option={m} title={ar ? MODE_HINT[m][1] : MODE_HINT[m][0]}
                onClick={() => setWorkspaceMode(m)}
                onKeyDown={(e) => { const i = MODES.indexOf(mode); const step = e.key === "ArrowRight" ? (ar ? -1 : 1) : e.key === "ArrowLeft" ? (ar ? 1 : -1) : 0; if (step) { e.preventDefault(); const nx = MODES[(i + step + MODES.length) % MODES.length]!; setWorkspaceMode(nx); (e.currentTarget.parentElement?.querySelector(`[data-mode-option="${nx}"]`) as HTMLElement | null)?.focus(); } }}
                tabIndex={on ? 0 : -1}
                className={`min-h-8 rounded px-3 text-[13px] font-medium transition-colors max-md:min-h-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {ar ? MODE_LABEL[m][1] : MODE_LABEL[m][0]}
              </button>
            );
          })}
        </div>
      </div>
      <nav aria-label={t("Separate experiences", "تجارب منفصلة")} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {FSM_EXPERIENCES.map((x) => <AppLink key={x.key} to={x.to} className="text-primary underline-offset-2 hover:underline">{ar ? x.label_ar : x.label}</AppLink>)}
      </nav>
    </div>
  );
}
