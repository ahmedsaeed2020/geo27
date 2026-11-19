/**
 * FIN-05 dashboard layout bar + editor and saved report views bar.
 * Layout: shows which level applies (personal / role default / company default / system), lets every user reorder and
 * hide cards and charts for themselves (Save for me / Reset mine), and lets a System Manager or Digit Director publish the
 * same arrangement as a role or company default. Saved views: personal named filter sets of a Construction report.
 * All writes go through domain/layoutActions.ts (document API, owner-only permissions, validation hooks).
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { notifyError, notifySaved } from "./notify";
import type { Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { chartById, type DashboardDef } from "../analytics/catalog";
import { metricById } from "../analytics/metricDefs";
import { APP, list } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { CONSTRUCTION_ROLES } from "../schema";
import { fallbackLayout, layoutRecordFor, resolveLayout, viewKeys, viewState, type LayoutItem, type LayoutLevel, type ResolvedLayout } from "../domain/layouts";
import { archiveView, deleteView, resetLayout, saveLayout, saveView, type ActionResult } from "../domain/layoutActions";
import { BTN, inputCls, useCx } from "./kit";

const LEVEL: Record<LayoutLevel, [string, string]> = { User: ["Your personal layout", "تخطيطك الشخصي"], Role: ["Role default", "الافتراضي للدور"], Company: ["Company default", "الافتراضي للشركة"], System: ["System default", "الافتراضي للنظام"] };
export { ROLE_AR } from "../roleLabels";
import { ROLE_AR } from "../roleLabels";
const canPublish = (u = currentUser()) => u === "Administrator" || userRoles(u).some((r) => r === "System Manager" || r === "Digit Director");
const done = (r: ActionResult, ok: string, ar: boolean) => { if (r.ok) notifySaved(ok); else notifyError(r.errors.join("\n") || (ar ? "تعذر الحفظ" : "Could not save")); return r.ok; };
export function itemTitle(i: LayoutItem, ar: boolean): string {
  if (i.type === "Metric") { const m = metricById(i.id); return m ? (ar ? m.ar : m.en) : i.id; }
  const c = chartById(i.id); return c ? (ar ? c.ar : c.en) : i.id;
}
/** Company used for the company level: the scope company, else the only company of the user's construction projects. */
export function layoutCompany(scopeCompany?: string): string | undefined {
  if (scopeCompany) return scopeCompany;
  const cs = [...new Set(constructionProjects().map((p) => String(p["company"] ?? "")).filter(Boolean))];
  return cs.length === 1 ? cs[0] : undefined;
}
export function useLayout(dash: DashboardDef, scopeCompany?: string): ResolvedLayout {
  useCx(); // re-render on store / session change
  return resolveLayout(dash, { company: layoutCompany(scopeCompany) });
}

export function LayoutBar({ dash, layout, scopeCompany }: { dash: DashboardDef; layout: ResolvedLayout; scopeCompany?: string | undefined }) {
  const { t, ar } = useCx();
  const [edit, setEdit] = useState<LayoutItem[] | null>(null);
  const [role, setRole] = useState("");
  const user = currentUser();
  const company = layoutCompany(scopeCompany);
  const publisher = canPublish(user);
  const levelTxt = ar ? LEVEL[layout.level][1] : LEVEL[layout.level][0];
  const target = layout.level === "Role" ? ` · ${ar ? ROLE_AR[layout.target ?? ""] ?? layout.target : layout.target}` : layout.level === "Company" ? ` · ${layout.target}` : "";
  const roles = CONSTRUCTION_ROLES;
  const move = (i: number, d: -1 | 1) => setEdit((xs) => { if (!xs) return xs; const j = i + d; if (j < 0 || j >= xs.length) return xs; const c = [...xs]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; });
  const toggle = (i: number) => setEdit((xs) => (xs ? xs.map((x, k) => (k === i ? { ...x, hidden: !x.hidden } : x)) : xs));
  const mineExists = !!layoutRecordFor(dash.key, "User", user);
  const fallback = fallbackLayout(dash, "User", { company });
  return (
    <div className="mb-3" data-layout-bar data-layout-level={layout.level}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("Layout", "التخطيط")}:</span>
        <span className="font-medium" data-layout-level-label>{levelTxt}<span data-no-i18n>{target}</span></span>
        {!edit && <button type="button" className={BTN.compact} data-layout-customize onClick={() => setEdit(layout.items.map((x) => ({ ...x })))}>{t("Customize", "تخصيص")}</button>}
        {!edit && mineExists && <button type="button" className={BTN.compact} data-layout-reset-mine onClick={() => { if (done(resetLayout(dash.key, "User", user), t(`Back to the ${LEVEL[fallback.level][0].toLowerCase()}`, `عودة إلى ${LEVEL[fallback.level][1]}`), ar)) setEdit(null); }}>{t("Reset mine", "إعادة تخطيطي")}</button>}
      </div>
      {edit && (
        <div className="panel mt-2 p-3" role="region" aria-label={t("Customize the dashboard", "تخصيص اللوحة")} data-layout-editor>
          <p className="mb-2 text-xs text-muted-foreground">{t("Reorder or hide cards and charts. Hidden items keep their data; figures and drill-downs never change.", "رتّب البطاقات والمخططات أو أخفها. العناصر المخفية تحتفظ ببياناتها؛ الأرقام والتفاصيل لا تتغير.")}</p>
          <ol className="divide-y divide-border rounded-md border border-border text-sm">
            {edit.map((x, i) => (
              <li key={`${x.type}|${x.id}`} className={`flex items-center gap-2 px-2 py-1.5 ${x.hidden ? "text-muted-foreground" : ""}`} data-layout-item={`${x.type}|${x.id}`} data-hidden={x.hidden ? 1 : 0}>
                <span className="w-14 shrink-0 text-xs text-muted-foreground">{x.type === "Metric" ? t("Card", "بطاقة") : t("Chart", "مخطط")}</span>
                <span className={`min-w-0 flex-1 truncate ${x.hidden ? "line-through" : ""}`}>{itemTitle(x, ar)}</span>
                <button type="button" className={BTN.compact} aria-label={t("Move up", "تحريك لأعلى")} disabled={i === 0} onClick={() => move(i, -1)} data-layout-up>↑</button>
                <button type="button" className={BTN.compact} aria-label={t("Move down", "تحريك لأسفل")} disabled={i === edit.length - 1} onClick={() => move(i, 1)} data-layout-down>↓</button>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!x.hidden} onChange={() => toggle(i)} data-layout-show />{t("Show", "إظهار")}</label>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={BTN.primary} data-layout-save-mine onClick={() => { if (done(saveLayout(dash.key, "User", user, edit), t("Saved as your layout", "حُفظ كتخطيطك"), ar)) setEdit(null); }}>{t("Save for me", "حفظ لي")}</button>
            <button type="button" className={BTN.secondary} onClick={() => setEdit(null)}>{t("Cancel", "إلغاء")}</button>
            <button type="button" className={BTN.secondary} data-layout-default onClick={() => setEdit(fallback.items.map((x) => ({ ...x })))}>{t("Start from the default", "البدء من الافتراضي")}</button>
            {publisher && <span className="ms-auto flex flex-wrap items-center gap-2" data-layout-publish>
              <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} aria-label={t("Role", "الدور")} data-layout-role>
                <option value="">{t("Role…", "الدور…")}</option>{roles.map((r) => <option key={r} value={r}>{ar ? ROLE_AR[r] ?? r : r}</option>)}
              </select>
              <button type="button" className={BTN.secondary} disabled={!role} data-layout-save-role onClick={() => { if (done(saveLayout(dash.key, "Role", role, edit), t("Published as the role default", "نُشر كافتراضي للدور"), ar)) setEdit(null); }}>{t("Publish for role", "نشر للدور")}</button>
              {role && layoutRecordFor(dash.key, "Role", role) && <button type="button" className={BTN.compact} data-layout-reset-role onClick={() => { if (done(resetLayout(dash.key, "Role", role), t("Role default removed", "أزيل افتراضي الدور"), ar)) setEdit(null); }}>{t("Remove role default", "إزالة افتراضي الدور")}</button>}
              {company && <button type="button" className={BTN.secondary} data-layout-save-company onClick={() => { if (done(saveLayout(dash.key, "Company", company, edit), t("Published as the company default", "نُشر كافتراضي للشركة"), ar)) setEdit(null); }}>{t("Publish for company", "نشر للشركة")}</button>}
              {company && layoutRecordFor(dash.key, "Company", company) && <button type="button" className={BTN.compact} data-layout-reset-company onClick={() => { if (done(resetLayout(dash.key, "Company", company), t("Company default removed", "أزيل افتراضي الشركة"), ar)) setEdit(null); }}>{t("Remove company default", "إزالة افتراضي الشركة")}</button>}
            </span>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("Precedence: your layout → role default → company default → system default. Reset returns to the next level.", "الأولوية: تخطيطك ← افتراضي الدور ← افتراضي الشركة ← افتراضي النظام. الإعادة ترجع إلى المستوى التالي.")}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- saved report views
export function myViews(report: string, user = currentUser()): Doc[] {
  return list("Digit Saved View", (v) => v["report"] === report && String(v["owner"] ?? "") === user && v["status"] !== "Archived").sort((a, b) => String(a["view_name"]).localeCompare(String(b["view_name"])));
}
export function SavedViewsBar({ report }: { report: string }) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const user = currentUser();
  const views = myViews(report, user);
  const keys = viewKeys(report);
  const state = Object.fromEntries(keys.filter((k) => typeof search[k] === "string" && search[k] !== "").map((k) => [k, String(search[k])]));
  const sig = (s: Record<string, string>) => JSON.stringify(Object.entries(s).sort());
  const active = views.find((v) => sig(viewState(v)) === sig(state) && typeof search["view"] === "string" && search["view"] === v.name);
  const apply = (v: Doc) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: `reports/${report}` }, search: { ...viewState(v), view: v.name } as never });
  const modified = active ? false : typeof search["view"] === "string" && views.some((v) => v.name === search["view"]);
  const current = views.find((v) => v.name === search["view"]);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" data-saved-views>
      <label className="flex items-center gap-1.5"><span className="text-muted-foreground">{t("My views", "عروضي")}</span>
        <select className={inputCls} value={current?.name ?? ""} data-saved-view-select onChange={(e) => { const v = views.find((x) => x.name === e.target.value); if (v) apply(v); else void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: `reports/${report}` }, search: {} as never }); }}>
          <option value="">{views.length ? t("— choose a saved view —", "— اختر عرضًا محفوظًا —") : t("No saved views yet", "لا توجد عروض محفوظة بعد")}</option>
          {views.map((v) => <option key={v.name} value={v.name} data-no-i18n>{String(v["view_name"])}</option>)}
        </select>
      </label>
      {modified && current && <span className="text-xs text-warning" data-saved-view-modified>{t("Filters changed", "تغيّرت المرشحات")}</span>}
      {modified && current && <button type="button" className={BTN.compact} data-saved-view-update onClick={() => { const r = saveView(report, String(current["view_name"]), state, current.name, user); if (done(r, t("View updated", "حُدّث العرض"), ar)) void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: `reports/${report}` }, search: { ...state, view: current.name } as never, replace: true }); }}>{t("Update view", "تحديث العرض")}</button>}
      {!naming ? <button type="button" className={BTN.compact} data-saved-view-new onClick={() => { setNaming(true); setName(""); }}>{t("Save view", "حفظ العرض")}</button>
        : <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const r = saveView(report, name, state, undefined, user); if (done(r, t("View saved", "حُفظ العرض"), ar)) { setNaming(false); void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: `reports/${report}` }, search: { ...state, view: r.name } as never, replace: true }); } }}>
            <input className={inputCls} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("View name", "اسم العرض")} aria-label={t("View name", "اسم العرض")} data-saved-view-name />
            <button type="submit" className={BTN.primary} disabled={!name.trim()} data-saved-view-save>{t("Save", "حفظ")}</button>
            <button type="button" className={BTN.compact} onClick={() => setNaming(false)}>{t("Cancel", "إلغاء")}</button>
          </form>}
      {current && <>
        <button type="button" className={BTN.compact} data-saved-view-archive onClick={() => { if (done(archiveView(current.name, user), t("View archived", "أُرشف العرض"), ar)) void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: `reports/${report}` }, search: { ...state } as never, replace: true }); }}>{t("Archive", "أرشفة")}</button>
        <button type="button" className={BTN.compact} data-saved-view-delete onClick={() => { if (window.confirm(t("Delete this saved view?", "حذف هذا العرض المحفوظ؟")) && done(deleteView(current.name, user), t("View deleted", "حُذف العرض"), ar)) void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: `reports/${report}` }, search: { ...state } as never, replace: true }); }}>{t("Delete", "حذف")}</button>
      </>}
      <span className="text-xs text-muted-foreground">{t("Views are personal; they keep filters only, never data.", "العروض شخصية؛ تحفظ المرشحات فقط ولا تحفظ بيانات.")}</span>
    </div>
  );
}
