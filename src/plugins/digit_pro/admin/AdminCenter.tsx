// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * DIGIT Pro Administration (/pro/admin) — owner OWN-45 / ADM-01..04 / HOST-ADMIN / HOST-ACCESS / PL3 / PL4 / PL6 / ENT-18 /
 * ENT-UI-013: feature on/off per company and role, dashboard blocks published to roles with preview and rollback, the role
 * permission matrix, automation, jobs and integrations, upgrade impact, site flags, demo data and external-engine providers.
 * System Manager only; every change is an adapter record read by the same rules the screens use.
 */
import { useMemo, useState, type ReactNode } from "react";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStoreVersion } from "@/lib/adapter";
import { useLang } from "@/i18n";
import { ADMIN, userRoles } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { defaultStore, resolveLayout, saveLayout, defaultLayout, type TemplateScope } from "@/lib/dashboards/layout";
import type { DashboardDef } from "@/lib/dashboards/registry";
import { setVolumeEnabled, volumeEnabled } from "@/lib/volume";
import { getDevMode, setDevMode } from "@/lib/mode";
import { ProFrame } from "../ProFrame";
import { IntegrationLogPanel } from "@/components/enterprise/CorePanels";
import { financeContext } from "../finance";
import { useNavResolver } from "../ProSidebar";
import { slug, DEPARTMENTS, SECTION_PAGES } from "../nav";
import { sectionDashboardDef } from "../SectionWorkspace";
import { deptDashboardDef } from "../DeptOverview";
import { DEPT_KEYS } from "../dash92";
import { EXEC_PAGES } from "../execPages";
import { pageDashboard } from "@/components/dashboards/PageBlocks";
import { blockFeature } from "@/components/dashboards/DashboardDesigner";
import { roleResolves } from "@/lib/coreShared/features";
import type { Bi } from "../command";
import { BRAND_HEADER, brandingFor, FRAME_CSS, frameHtml } from "@/lib/printFrame";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { adapter } from "@/lib/adapter";
import { ANY, clearFeature, featureCatalog, featurePreview, featureRules, setFeature, type FeatureKind } from "./featureControl";
import { BRANDING_FIELDS, setBranding, type BrandingField } from "./adminData";
import { automationOverview, jobMonitor, knownRoles, MATRIX_ACTIONS, matrixDoctypes, permissionMatrix, ENGINES, PROVIDER_LABEL, providerFor, setProvider, siteFlags, upgradeImpact, type Engine } from "./adminData";

export const ADMIN_TABS = ["features", "dashboards", "permissions", "automation", "jobs", "upgrade", "site", "branding", "integrations"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];
const TAB_LABEL: Record<AdminTab, Bi> = { features: ["Feature control", "التحكم بالميزات"], dashboards: ["Dashboard control", "التحكم بلوحات المعلومات"], permissions: ["Permissions matrix", "مصفوفة الصلاحيات"], automation: ["Automation", "الأتمتة"], jobs: ["Jobs & integrations", "المهام والتكاملات"], upgrade: ["Upgrade impact", "أثر الترقية"], site: ["Site & demo", "الموقع والعرض التجريبي"], branding: ["Print branding", "هوية الطباعة"], integrations: ["External engines", "المحركات الخارجية"] };
export interface AdminSearch { tab?: AdminTab | undefined }
export const isSiteAdmin = (user: string) => user === ADMIN || userRoles(user).includes("System Manager");

export function AdminCenter({ search }: { search: AdminSearch }) {
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en); const nav = useNavigate();
  const tab: AdminTab = ADMIN_TABS.includes(search.tab as AdminTab) ? (search.tab as AdminTab) : "features";
  useStoreVersion(); useScopeMetas(matrixDoctypes());
  return <ProFrame title={t("Administration", "الإدارة")} subtitle={t("Choose what each company and role sees, publish dashboards, review permissions, automation, jobs and upgrade impact.", "حدّد ما يراه كل دور وشركة، وانشر لوحات المعلومات، وراجع الصلاحيات والأتمتة والمهام وأثر الترقية.")} tabs={false} doctypes={["Role", "User", "Company"]}>
    {({ user }) => !isSiteAdmin(user) ? <section className="dp-card mt-4" data-dp-admin-denied><h2 className="font-semibold">{t("Not permitted", "غير مسموح")}</h2><p className="text-sm text-muted-foreground">{t("Administration needs the System Manager role.", "الإدارة تحتاج دور مدير النظام.")}</p></section>
      : <div className="mt-4 space-y-4" data-dp-admin={tab}>
        <nav className="dp-d92-tabs" role="tablist" aria-label={t("Administration", "الإدارة")}>{ADMIN_TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className="dp-d92-tab" data-on={tab === k ? "" : undefined} onClick={() => void nav({ to: "/pro/admin", search: { tab: k === "features" ? undefined : k } as never, replace: true })} data-dp-admin-tab={k}>{ar ? TAB_LABEL[k][1] : TAB_LABEL[k][0]}</button>)}</nav>
        {tab === "features" && <FeaturesTab ar={ar} user={user} />}
        {tab === "dashboards" && <DashboardsTab ar={ar} user={user} />}
        {tab === "permissions" && <PermissionsTab ar={ar} user={user} />}
        {tab === "automation" && <AutomationTab ar={ar} />}
        {tab === "jobs" && <JobsTab ar={ar} />}
        {tab === "upgrade" && <UpgradeTab ar={ar} />}
        {tab === "site" && <SiteTab ar={ar} />}
        {tab === "branding" && <BrandingTab ar={ar} user={user} />}
        {tab === "integrations" && <IntegrationsTab ar={ar} />}
      </div>}
  </ProFrame>;
}

const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
function Panel({ title, note, children, actions }: { title: string; note?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="dp-card"><header className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 className="dp-d92-title">{title}</h2>{note && <p className="text-xs text-muted-foreground">{note}</p>}</div>{actions}</header>{children}</section>;
}
function DocA({ dt, name, children }: { dt: string; name: string; children?: ReactNode }) {
  const { appOf } = useNavResolver(); const app = appOf(dt);
  return app ? <Link to="/app/$app/$doctype/$name" params={{ app, doctype: slug(dt), name }} className="text-primary hover:underline" data-no-i18n>{children ?? name}</Link> : <span data-no-i18n>{children ?? name}</span>;
}
function useCompanies(user: string) { return financeContext(undefined, user).companies; }
function ScopePickers({ ar, company, role, setCompany, setRole, roles, companies, anyRole = true }: { ar: boolean; company: string; role: string; setCompany: (c: string) => void; setRole: (r: string) => void; roles: string[]; companies: string[]; anyRole?: boolean }) {
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <label className="flex items-center gap-1"><span className="text-muted-foreground">{ar ? "الشركة" : "Company"}</span><select className="field-input w-auto" value={company} onChange={(e) => setCompany(e.target.value)} data-dp-admin-company><option value={ANY}>{ar ? "كل الشركات" : "All companies"}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></label>
    <label className="flex items-center gap-1"><span className="text-muted-foreground">{ar ? "الدور" : "Role"}</span><select className="field-input w-auto" value={role} onChange={(e) => setRole(e.target.value)} data-dp-admin-role>{anyRole && <option value={ANY}>{ar ? "كل الأدوار" : "All roles"}</option>}{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
  </div>;
}

/* ------------------------------------------------------------------ ADM-01 ------------------------------------------------------------------ */
const KINDS: [FeatureKind, Bi][] = [["department", ["Departments", "الأقسام"]], ["workspace", ["Workspaces", "مساحات العمل"]], ["tab", ["Workspace tabs", "تبويبات المساحات"]], ["enterprise", ["Enterprise features", "ميزات المنصة"]], ["requirement", ["Run11.1 requirements", "متطلبات Run11.1"]]];
function FeaturesTab({ ar, user }: { ar: boolean; user: string }) {
  const roles = useMemo(() => knownRoles(), []); const companies = useCompanies(user);
  const [kind, setKind] = useState<FeatureKind>("department"); const [q, setQ] = useState(""); const [company, setCompany] = useState(ANY); const [role, setRole] = useState(ANY); const [limit, setLimit] = useState(40);
  const list = featureCatalog().filter((f) => f.kind === kind && (!q || `${f.key} ${f.label[0]} ${f.label[1]} ${f.group}`.toLowerCase().includes(q.toLowerCase())));
  const rules = featureRules();
  const previewRoles = role === ANY ? roles.slice(0, 4) : [role];
  return <Panel title={ar ? "التحكم بالميزات" : "Feature control"} note={ar ? "القاعدة الأدق تفوز: شركة+دور ← شركة ← دور ← الكل. المستخدم يرى الميزة إذا سمح بها أي من أدواره. المدير لا يُحجب." : "Most specific rule wins: company+role → company → role → everyone. A user sees a feature when any of their roles allows it. Administrator is never locked out."}>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={ar ? "النوع" : "Kind"}>{KINDS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={`rounded px-2 py-1 text-sm ${kind === k ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`} onClick={() => { setKind(k); setLimit(40); }} data-dp-feature-kind={k}>{pick(ar, l)}</button>)}</div>
      <input className="field-input w-56" placeholder={ar ? "بحث" : "Search"} value={q} onChange={(e) => setQ(e.target.value)} aria-label={ar ? "بحث" : "Search"} />
      <ScopePickers ar={ar} company={company} role={role} setCompany={setCompany} setRole={setRole} roles={roles} companies={companies} />
    </div>
    <div className="overflow-x-auto"><EntTable id="pro-admin-features" wrap><table className="w-full min-w-[720px] text-sm" data-dp-feature-table>
      <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-start">{ar ? "الميزة" : "Feature"}</th><th className="p-2 text-start">{ar ? "القاعدة في هذا النطاق" : "Rule at this scope"}</th><th className="p-2 text-start">{ar ? "معاينة حسب الدور" : "Preview by role"}</th></tr></thead>
      <tbody>{list.slice(0, limit).map((f) => { const here = rules.find((r) => r.feature === f.key && r.company === company && r.role === role); const pv = featurePreview(f.key, previewRoles, company === ANY ? "" : company);
        return <tr key={f.key} className="border-t border-border" data-dp-feature={f.key}>
          <td className="p-2"><div className={kind === "requirement" ? "" : ""} data-no-i18n={kind === "requirement" ? true : undefined}>{pick(ar, f.label)}</div><div className="text-[11px] text-muted-foreground" data-no-i18n>{f.key}</div></td>
          <td className="p-2"><div className="flex gap-1">{([["on", ar ? "تشغيل" : "On"], ["off", ar ? "إيقاف" : "Off"], ["inherit", ar ? "موروث" : "Inherit"]] as const).map(([v, l]) => { const on = v === "inherit" ? !here : here ? (v === "on") === here.enabled : false;
            return <button key={v} type="button" aria-pressed={on} className={`rounded border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary/10 font-semibold" : "border-border"}`} onClick={() => { if (v === "inherit") clearFeature(f.key, company, role); else setFeature(f.key, v === "on", company, role); toast(ar ? "حُفظ" : "Saved"); }} data-dp-feature-set={v}>{l}</button>; })}</div></td>
          <td className="p-2"><div className="flex flex-wrap gap-1">{Object.entries(pv).map(([r, on]) => <span key={r} className={`rounded-full px-2 py-0.5 text-[11px] ${on ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`} data-dp-feature-preview={`${r}:${on ? "on" : "off"}`}>{r}: {on ? (ar ? "ظاهر" : "visible") : (ar ? "مخفي" : "hidden")}</span>)}</div></td>
        </tr>; })}</tbody></table></EntTable></div>
    {list.length > limit && <button type="button" className="btn-ghost mt-2" onClick={() => setLimit(limit + 80)}>{ar ? `عرض المزيد (${list.length - limit})` : `Show more (${list.length - limit})`}</button>}
  </Panel>;
}

/* ------------------------------------------------------------------ ADM-02 / ENT-UI-013 ------------------------------------------------------------------ */
/** Every Pro / Enterprise page dashboard Administration controls: the 20 workspaces, the five department overviews, the executive pages and Home. */
function dashboardChoices(ar: boolean): { id: string; label: string; def: () => DashboardDef<unknown> }[] {
  return [
    { id: "enterprise:home", label: ar ? "الرئيسية" : "Enterprise Home", def: () => pageDashboard("enterprise", "home", ["Enterprise Home", "الرئيسية"], [{ id: "apps", title: ["Applications", "التطبيقات"] }, { id: "work", title: ["My work", "أعمالي"] }, { id: "footer", title: ["Company, support and settings", "الشركة والدعم والإعدادات"] }]) as unknown as DashboardDef<unknown> },
    ...DEPT_KEYS.map((d) => ({ id: `dept:${d}`, label: `${ar ? "نظرة القسم" : "Department"} · ${d}`, def: () => deptDashboardDef(d) as unknown as DashboardDef<unknown> })),
    ...EXEC_PAGES.map((p) => ({ id: `exec:${p.slug}`, label: `${ar ? "تنفيذي" : "Executive"} · ${ar ? p.label[1] : p.label[0]}`, def: () => pageDashboard("digit_pro", `exec:${p.slug}`, p.label, [{ id: "board", title: p.label }, { id: "extra", title: ["Related blocks", "كتل مرتبطة"] }]) as unknown as DashboardDef<unknown> })),
    ...SECTION_PAGES.map((p) => ({ id: p.id, label: `${p.id} · ${p.label}`, def: () => sectionDashboardDef(p.id)! as unknown as DashboardDef<unknown> })),
  ];
}
function DashboardsTab({ ar, user }: { ar: boolean; user: string }) {
  const roles = useMemo(() => knownRoles(), []); const companies = useCompanies(user);
  const choices = useMemo(() => dashboardChoices(ar), [ar]);
  const [ws, setWs] = useState(SECTION_PAGES[0]!.id); const [scope, setScope] = useState<TemplateScope>("Role"); const [role, setRole] = useState(roles.includes("Accounts User") ? "Accounts User" : roles[0] ?? ""); const [company, setCompany] = useState(companies[0] ?? "");
  const def = (choices.find((c) => c.id === ws) ?? choices[0]!).def();
  useStoreVersion();
  const blockKey = (wid: string) => blockFeature(def.app, def.id, wid);
  const roleSees = (wid: string) => roleResolves(blockKey(wid), scope === "Role" ? role : ANY, scope === "Company" ? company : "").enabled;
  const toggleBlock = (wid: string) => { setFeature(blockKey(wid), !roleSees(wid), scope === "Company" ? company : ANY, scope === "Role" ? role : ANY); toast(ar ? "حُدّثت صلاحية الكتلة" : "Block access updated"); };
  const [draft, setDraft] = useState<string[] | null>(null);
  const preview = resolveLayout(def, `preview::${role}`, [role], defaultStore, company);
  const items = draft ?? preview.layout.items.map((i) => i.id);
  const templates = defaultStore.templates(def.app, def.id);
  const move = (id: string, d: -1 | 1) => { const o = [...items]; const i = o.indexOf(id); const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j]!, o[i]!]; setDraft(o); };
  const publish = () => {
    const base = defaultLayout(def); const layout = { ...base, items: items.map((id) => base.items.find((x) => x.id === id) ?? { id, w: def.widgets.find((w) => w.id === id)?.size.w ?? 12 }) };
    const r = saveLayout(def, scope, layout as never, user, userRoles(user), scope === "Role" ? role : undefined, defaultStore, scope === "Company" ? company : undefined);
    if (r.ok) { toast(ar ? "نُشر التخطيط" : "Layout published"); setDraft(null); } else toast.error(pick(ar, r.reason));
  };
  return <Panel title={ar ? "التحكم بلوحات المعلومات" : "Dashboard control"} note={ar ? "اختر كتل لوحة كل مساحة عمل وترتيبها، ثم انشرها لدور أو شركة أو للجميع. المعاينة تُظهر ما سيراه الدور." : "Choose and order each workspace's dashboard blocks, then publish to a role, a company or everyone. The preview shows what that role will see."}>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1"><span className="text-muted-foreground">{ar ? "مساحة العمل" : "Workspace"}</span><select className="field-input w-auto" value={ws} onChange={(e) => { setWs(e.target.value); setDraft(null); }} data-dp-dash-ws>{choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="flex items-center gap-1"><span className="text-muted-foreground">{ar ? "النشر إلى" : "Publish to"}</span><select className="field-input w-auto" value={scope} onChange={(e) => setScope(e.target.value as TemplateScope)} data-dp-dash-scope><option value="Role">{ar ? "دور" : "Role"}</option><option value="Company">{ar ? "شركة" : "Company"}</option><option value="Global">{ar ? "الجميع (افتراضي النظام)" : "Everyone (system default)"}</option></select></label>
      {scope === "Role" && <select className="field-input w-auto" value={role} onChange={(e) => { setRole(e.target.value); setDraft(null); }} aria-label={ar ? "الدور" : "Role"} data-dp-dash-role>{roles.map((r) => <option key={r}>{r}</option>)}</select>}
      {scope === "Company" && <select className="field-input w-auto" value={company} onChange={(e) => { setCompany(e.target.value); setDraft(null); }} aria-label={ar ? "الشركة" : "Company"} data-no-i18n>{companies.map((c) => <option key={c}>{c}</option>)}</select>}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div><h3 className="mb-2 text-sm font-semibold">{ar ? "الكتل" : "Blocks"} <span className="text-xs font-normal text-muted-foreground">({ar ? "مصدر المعاينة" : "preview source"}: {preview.source.kind})</span></h3>
        <ul className="space-y-1" data-dp-dash-blocks>{def.widgets.map((w) => { const on = items.includes(w.id); return <li key={w.id} className="flex items-center gap-2 rounded border border-border p-2 text-sm" data-dp-dash-block={w.id} data-on={on || undefined}>
          <input type="checkbox" checked={on} disabled={!!w.required} onChange={() => setDraft(on ? items.filter((x) => x !== w.id) : [...items, w.id])} aria-label={pick(ar, w.title)} />
          <span className="flex-1">{pick(ar, w.title)}</span>
          {!w.required && <label className="flex items-center gap-1 text-xs text-muted-foreground" title={ar ? "يستطيع هذا الدور رؤية الكتلة أو إضافتها" : "This role may see or add the block"}><input type="checkbox" checked={roleSees(w.id)} onChange={() => toggleBlock(w.id)} data-dp-dash-block-allow={w.id} />{scope === "Global" ? (ar ? "متاحة للجميع" : "Available to all") : (ar ? "متاحة لهذا النطاق" : "Allowed here")}</label>}
          {on && <><button type="button" className="btn-ghost px-1" onClick={() => move(w.id, -1)} aria-label={ar ? "أعلى" : "Up"}>↑</button><button type="button" className="btn-ghost px-1" onClick={() => move(w.id, 1)} aria-label={ar ? "أسفل" : "Down"}>↓</button></>}
        </li>; })}</ul>
        <div className="mt-3 flex gap-2"><button type="button" className="btn-primary" onClick={publish} data-dp-dash-publish>{ar ? "نشر" : "Publish"}</button>{draft && <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>{ar ? "تجاهل التعديلات" : "Discard changes"}</button>}</div>
      </div>
      <div><h3 className="mb-2 text-sm font-semibold">{ar ? "التخطيطات المنشورة" : "Published layouts"}</h3>
        {templates.length === 0 ? <p className="text-sm text-muted-foreground">{ar ? "لا يوجد — يرى الجميع التخطيط الأصلي." : "None — everyone sees the original layout."}</p>
          : <ul className="space-y-1" data-dp-dash-templates>{templates.map((x) => <li key={`${x.scope}${x.role}${x.company}`} className="flex items-center justify-between gap-2 rounded border border-border p-2 text-sm" data-dp-dash-template={`${x.scope}:${x.role ?? x.company ?? ""}`}>
            <span>{x.scope}{x.role ? ` · ${x.role}` : ""}{x.company ? ` · ${x.company}` : ""} <span className="text-xs text-muted-foreground" data-no-i18n>({x.layout.items.length} · {x.modified.slice(0, 16)})</span></span>
            <button type="button" className="btn-ghost text-destructive" onClick={() => { defaultStore.removeTemplate(x.app, x.dashboard, x.scope, x.role, x.company); toast(ar ? "أُعيد إلى السابق" : "Rolled back"); }} data-dp-dash-rollback>{ar ? "تراجع" : "Roll back"}</button></li>)}</ul>}
      </div>
    </div>
  </Panel>;
}

/* ------------------------------------------------------------------ ADM-03 / HOST-ACCESS ------------------------------------------------------------------ */
function PermissionsTab({ ar, user }: { ar: boolean; user: string }) {
  const roles = useMemo(() => knownRoles(), []); const companies = useCompanies(user);
  const [role, setRole] = useState(roles.includes("Accounts User") ? "Accounts User" : roles[0] ?? ""); const [company, setCompany] = useState(ANY);
  const rows = permissionMatrix(role, company === ANY ? "" : company);
  const allowed = rows.filter((r) => r.cells.read === "allowed").length;
  return <Panel title={ar ? "مصفوفة الصلاحيات" : "Permissions matrix"} note={ar ? "الدور × التطبيق × القسم × مساحة العمل × الإجراء، من قواعد الصلاحيات نفسها التي تطبّقها الشاشات. المرفوض مخفي وليس صفرًا." : "Role × app × department × workspace × action, from the same permission rules the screens apply. Denied is hidden, never shown as zero."}
    actions={<span className="text-xs text-muted-foreground" data-dp-matrix-summary>{allowed}/{rows.length} {ar ? "مستند مقروء" : "documents readable"}</span>}>
    <ScopePickers ar={ar} company={company} role={role} setCompany={setCompany} setRole={setRole} roles={roles} companies={companies} anyRole={false} />
    <div className="mt-3 max-h-[560px] overflow-auto"><table className="w-full min-w-[900px] text-sm" data-dp-matrix={role}>
      <thead className="sticky top-0 bg-card text-xs text-muted-foreground"><tr><th className="p-2 text-start">{ar ? "القسم / المساحة" : "Department / workspace"}</th><th className="p-2 text-start">{ar ? "المستند" : "Document"}</th>{MATRIX_ACTIONS.map((a) => <th key={a} className="p-2">{a}</th>)}<th className="p-2 text-start">{ar ? "المصدر" : "Source"}</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.workspace + r.doctype} className="border-t border-border" data-dp-matrix-row={`${r.workspace}:${r.doctype}`}>
        <td className="p-2 text-xs"><span>{DEPARTMENTS.find((d) => d.id === r.dept)?.label}</span> · <span data-no-i18n>{r.workspace}</span></td><td className="p-2">{r.doctype}</td>
        {MATRIX_ACTIONS.map((a) => <td key={a} className="p-2 text-center" data-cell={r.cells[a]}>{r.cells[a] === "allowed" ? <span className="text-success" aria-label={ar ? "مسموح" : "allowed"}>✓</span> : r.cells[a] === "hidden" ? <span className="text-muted-foreground" aria-label={ar ? "مخفي" : "hidden"}>—</span> : <span className="text-muted-foreground">?</span>}</td>)}
        <td className="p-2 text-xs text-muted-foreground">{r.source}</td></tr>)}</tbody></table></div>
  </Panel>;
}

/* ------------------------------------------------------------------ PL6 / PL3 / PL4 / ENT-18 ------------------------------------------------------------------ */
function AutomationTab({ ar }: { ar: boolean }) {
  const groups = automationOverview();
  return <Panel title={ar ? "الأتمتة" : "Automation"} note={ar ? "قواعد الإسناد والإشعارات والمستندات المتكررة وسير العمل والنصوص — كل سجل يفتح نموذجه الأصلي." : "Assignment rules, notifications, recurring documents, workflows and scripts — every record opens its native form."}>
    <div className="grid gap-3 md:grid-cols-2">{groups.map((g) => <div key={g.doctype} className="rounded border border-border p-3" data-dp-automation={g.doctype}>
      <h3 className="mb-1 flex justify-between text-sm font-semibold"><span>{pick(ar, g.label)}</span><span data-no-i18n>{g.rows.length}</span></h3>
      {g.rows.length === 0 ? <p className="text-xs text-muted-foreground">{ar ? "لا توجد سجلات." : "No records."}</p> : <ul className="space-y-0.5 text-sm">{g.rows.slice(0, 8).map((r) => <li key={r.name} className="flex justify-between gap-2"><DocA dt={g.doctype} name={r.name} /><span className="text-xs text-muted-foreground" data-no-i18n>{r.target}{r.enabled ? "" : " · off"}</span></li>)}</ul>}
    </div>)}</div>
  </Panel>;
}
function JobsTab({ ar }: { ar: boolean }) {
  const m = jobMonitor();
  const table = (rows: typeof m.jobs, id: string) => rows.length === 0 ? <p className="text-sm text-muted-foreground">{ar ? "لا توجد سجلات في المعاينة." : "No records in the preview."}</p>
    : <table className="w-full text-sm" data-dp-monitor={id}><tbody>{rows.map((r) => <tr key={r.route.doctype + r.name} className="border-t border-border"><td className="p-2"><DocA dt={r.route.doctype} name={r.name} /></td><td className="p-2 text-xs">{pick(ar, r.kind)}</td><td className="p-2 text-xs" data-no-i18n>{r.detail}</td><td className="p-2 text-xs">{r.status}</td></tr>)}</tbody></table>;
  return <div className="grid gap-4 lg:grid-cols-2">
    <Panel title={ar ? "المهام في الخلفية" : "Background jobs"} note={pick(ar, m.server.note)}>{table(m.jobs, "jobs")}<p className="mt-2 text-[11px] text-muted-foreground" data-dp-server-method>{ar ? "طريقة الخادم: " : "Server method: "}<code data-no-i18n>{m.server.method}</code></p></Panel>
    <Panel title={ar ? "التكاملات" : "Integrations"}>{table(m.integrations, "integrations")}</Panel>
  </div>;
}
function UpgradeTab({ ar }: { ar: boolean }) {
  const rows = upgradeImpact(); const n = (r: string) => rows.filter((x) => x.risk === r).length;
  return <Panel title={ar ? "أثر الترقية" : "Upgrade impact"} note={ar ? "تخصيصات الموقع مقابل تعريفات المستندات الحالية: ما الذي سينكسر أو يحتاج مراجعة بعد الترقية." : "Site customizations checked against the current DocType definitions: what breaks or needs review after an upgrade."}
    actions={<span className="text-xs" data-dp-upgrade-summary={`${n("breaks")}/${n("review")}/${n("ok")}`}><b className="text-destructive">{n("breaks")}</b> {ar ? "ينكسر" : "breaks"} · <b className="text-warning">{n("review")}</b> {ar ? "مراجعة" : "review"} · <b className="text-success">{n("ok")}</b> {ar ? "سليم" : "ok"}</span>}>
    {rows.length === 0 ? <p className="text-sm text-muted-foreground">{ar ? "لا توجد تخصيصات على الموقع." : "No site customizations."}</p>
      : <table className="w-full text-sm" data-dp-upgrade><tbody>{rows.map((r) => <tr key={r.doctype + r.name} className="border-t border-border" data-risk={r.risk}><td className="p-2"><DocA dt={r.doctype} name={r.name} /></td><td className="p-2 text-xs">{r.doctype}</td><td className="p-2 text-xs" data-no-i18n>{r.target}</td><td className={`p-2 text-xs ${r.risk === "breaks" ? "text-destructive" : r.risk === "review" ? "text-warning" : "text-success"}`}>{pick(ar, r.reason)}</td></tr>)}</tbody></table>}
  </Panel>;
}
function SiteTab({ ar }: { ar: boolean }) {
  const [, force] = useState(0);
  return <div className="grid gap-4 lg:grid-cols-2">
    <Panel title={ar ? "أعلام الموقع" : "Site flags"}><table className="w-full text-sm" data-dp-site-flags><tbody>{siteFlags().map((f) => <tr key={f.key} className="border-t border-border" data-flag={f.key}><td className="p-2">{pick(ar, f.label)}</td><td className="p-2 font-medium" data-no-i18n>{f.value}</td><td className="p-2 text-xs text-muted-foreground">{f.source}</td></tr>)}</tbody></table></Panel>
    <Panel title={ar ? "وضع العرض التجريبي" : "Demo mode"} note={ar ? "البيانات التجريبية الغنية تعيش في الذاكرة فقط ولا تغيّر سجلاتك." : "The rich sample data lives in memory only and never changes your records."}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={volumeEnabled() ? "btn-primary" : "btn-ghost"} aria-pressed={volumeEnabled()} onClick={() => { const n = setVolumeEnabled(!volumeEnabled()); toast(ar ? `تم (${n})` : `Done (${n})`); force((x) => x + 1); }} data-dp-demo-toggle>{volumeEnabled() ? (ar ? "البيانات التجريبية: تشغيل" : "Demo data: on") : (ar ? "البيانات التجريبية: إيقاف" : "Demo data: off")}</button>
        <button type="button" className={getDevMode() ? "btn-primary" : "btn-ghost"} aria-pressed={getDevMode()} onClick={() => { setDevMode(!getDevMode()); force((x) => x + 1); }} data-dp-devmode-toggle>{ar ? "وضع المطوّر" : "Developer mode"}: {getDevMode() ? (ar ? "تشغيل" : "on") : (ar ? "إيقاف" : "off")}</button>
      </div>
    </Panel>
  </div>;
}
/* ------------------------------------------------------------------ print branding (T6) ------------------------------------------------------------------ */
const BRAND_LABEL: Record<BrandingField, Bi> = { company_name_ar: ["Company name (Arabic)", "اسم الشركة (عربي)"], company_name_en: ["Company name (English)", "اسم الشركة (إنجليزي)"], logo: ["Logo", "الشعار"],
  vat_number: ["VAT number (empty = company Tax ID)", "الرقم الضريبي (فارغ = الرقم الضريبي للشركة)"], cr_number: ["Commercial registration (CR)", "السجل التجاري"], address_ar: ["Address (Arabic)", "العنوان (عربي)"], address_en: ["Address (English)", "العنوان (إنجليزي)"],
  phone: ["Phone", "الهاتف"], email: ["Email", "البريد الإلكتروني"], website: ["Website", "الموقع الإلكتروني"], bank_name: ["Bank name", "اسم البنك"], account_name: ["Account name", "اسم الحساب"], iban: ["IBAN", "الآيبان"],
  terms_ar: ["Terms (Arabic)", "الشروط (عربي)"], terms_en: ["Terms (English)", "الشروط (إنجليزي)"], footer_note_ar: ["Footer note (Arabic)", "ملاحظة التذييل (عربي)"], footer_note_en: ["Footer note (English)", "ملاحظة التذييل (إنجليزي)"] };
const BRAND_GROUPS: [Bi, BrandingField[]][] = [[["Header", "الترويسة"], ["company_name_ar", "company_name_en", "address_ar", "address_en"]], [["Registration & contact", "التسجيل والتواصل"], ["vat_number", "cr_number", "phone", "email", "website"]],
  [["Footer", "التذييل"], ["bank_name", "account_name", "iban", "terms_ar", "terms_en", "footer_note_ar", "footer_note_en"]]];
const LONG = new Set<BrandingField>(["address_ar", "address_en", "terms_ar", "terms_en"]);
function BrandingTab({ ar, user }: { ar: boolean; user: string }) {
  const companies = useCompanies(user); const [company, setCompany] = useState(financeContext(undefined, user).company || companies[0] || "");
  const rec = adapter.get(CORE_DT.printBranding, company);
  const init = (): Record<BrandingField, string> => Object.fromEntries(BRANDING_FIELDS.map((k) => [k, String(rec?.[k] ?? "")])) as Record<BrandingField, string>;
  const [form, setForm] = useState(init); const [loaded, setLoaded] = useState(company);
  if (loaded !== company) { setLoaded(company); setForm(init()); }
  const set = (k: BrandingField, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const sample = adapter.list("Sales Invoice").filter((d) => d["company"] === company && Number(d.docstatus) === 1 && !Number(d["is_return"] ?? 0)).sort((a, b) => String(b["posting_date"]).localeCompare(String(a["posting_date"])))[0];
  const b = brandingFor(company);
  const upload = (file: File | undefined) => { if (!file) return; if (file.size > 400_000) { toast.error(ar ? "الحد الأقصى للشعار 400 كيلوبايت." : "The logo may be up to 400 KB."); return; } const r = new FileReader(); r.onload = () => set("logo", String(r.result)); r.readAsDataURL(file); };
  const field = (k: BrandingField) => <label key={k} className={`block ${LONG.has(k) ? "sm:col-span-2" : ""}`}><span className="text-xs text-muted-foreground">{pick(ar, BRAND_LABEL[k])}</span>
    {LONG.has(k) ? <textarea className="field-input min-h-16" value={form[k]} onChange={(e) => set(k, e.target.value)} dir={k.endsWith("_en") ? "ltr" : "rtl"} data-no-i18n data-dp-brand-field={k} />
      : <input className="field-input" value={form[k]} onChange={(e) => set(k, e.target.value)} dir={k.endsWith("_ar") ? "rtl" : ["vat_number", "cr_number", "phone", "email", "website", "iban", "company_name_en", "footer_note_en"].includes(k) ? "ltr" : undefined} placeholder={k === "vat_number" ? b.vat : undefined} data-no-i18n data-dp-brand-field={k} />}</label>;
  const preview = sample ? frameHtml({ doctype: "Sales Invoice", doc: sample, lang: ar ? "ar" : "en", body: "", header: "brand", titleBand: true }) : "";
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-dp-admin-branding>
    <Panel title={ar ? "هوية الطباعة" : "Print branding"} note={ar ? "تظهر في ترويسة وتذييل كل مستند مطبوع في كل التطبيقات (فواتير، أوامر، سندات، قيود)." : "Shown in the header and footer of every printed document in every app (invoices, orders, vouchers, journals)."}
      actions={<label className="flex items-center gap-1 text-sm"><span className="text-muted-foreground">{ar ? "الشركة" : "Company"}</span><select className="field-input w-auto" value={company} onChange={(e) => setCompany(e.target.value)} data-dp-brand-company>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></label>}>
      <form className="space-y-4 text-sm" onSubmit={(ev) => { ev.preventDefault(); const r = setBranding(company, form); if (r.ok) toast(ar ? "حُفظت هوية الطباعة" : "Print branding saved"); else toast.error(pick(ar, r.error)); }} data-dp-brand-form>
        <div className="flex flex-wrap items-center gap-3"><span className="grid h-16 w-40 place-items-center rounded-lg border border-border bg-card p-2">{form.logo ? <img src={form.logo} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">{ar ? "لا شعار" : "No logo"}</span>}</span>
          <label className="btn-ghost cursor-pointer"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} data-dp-brand-logo />{ar ? "رفع شعار" : "Upload logo"}</label>
          {form.logo && <button type="button" className="btn-ghost" onClick={() => set("logo", "")}>{ar ? "إزالة" : "Remove"}</button>}</div>
        {BRAND_GROUPS.map(([g, ks]) => <fieldset key={g[0]} className="space-y-2"><legend className="text-xs font-semibold text-muted-foreground">{pick(ar, g)}</legend><div className="grid gap-2 sm:grid-cols-2">{ks.map(field)}</div></fieldset>)}
        <div className="flex flex-wrap gap-2"><button type="submit" className="btn-primary" data-dp-brand-save>{ar ? "حفظ" : "Save"}</button>
          {sample && <Link to="/printview" search={{ doctype: "Sales Invoice", name: sample.name, letterhead: BRAND_HEADER } as never} className="btn-ghost" data-dp-brand-print>{ar ? "معاينة فاتورة مطبوعة" : "Preview a printed invoice"}</Link>}</div>
      </form>
    </Panel>
    <Panel title={ar ? "المعاينة" : "Preview"} note={ar ? "الترويسة والتذييل كما يُطبعان بعد الحفظ." : "Header and footer as they print once saved."}>
      <style>{FRAME_CSS}</style>
      {preview ? <div className="overflow-auto rounded-lg border border-border bg-card p-5 text-sm" lang={ar ? "ar" : "en"} dir={ar ? "rtl" : "ltr"} data-no-i18n data-dp-brand-preview dangerouslySetInnerHTML={{ __html: preview }} />
        : <p className="text-sm text-muted-foreground">{ar ? "لا توجد فاتورة معتمدة لهذه الشركة للمعاينة." : "No submitted invoice of this company to preview."}</p>}
    </Panel>
  </div>;
}
function IntegrationsTab({ ar }: { ar: boolean }) {
  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-3">{ENGINES.map((e) => <ProviderForm key={e} engine={e} ar={ar} />)}</div>
    <IntegrationLogPanel ar={ar} />
  </div>;
}
function ProviderForm({ engine, ar }: { engine: Engine; ar: boolean }) {
  const cur = providerFor(engine);
  const [mode, setMode] = useState(cur.mode); const [provider, setProv] = useState(cur.provider); const [endpoint, setEndpoint] = useState(cur.endpoint); const [secret, setSecret] = useState(cur.secret_name);
  return <Panel title={pick(ar, PROVIDER_LABEL[engine])} note={ar ? "تُجهَّز البيانات محليًا؛ يُستدعى المزوّد المتصل من خادم ديجيت باسم السر." : "Everything is prepared here; a connected provider is called from the DIGIT server using the secret name."}>
    <form className="space-y-2 text-sm" data-dp-provider={engine} onSubmit={(ev) => { ev.preventDefault(); const r = setProvider(engine, { provider, mode, endpoint, secret_name: secret }); if (r.ok) toast(ar ? "حُفظ" : "Saved"); else toast.error(pick(ar, r.reason)); }}>
      <label className="block"><span className="text-xs text-muted-foreground">{ar ? "الوضع" : "Mode"}</span><select className="field-input" value={mode} onChange={(e) => setMode(e.target.value as "preview" | "server")} data-dp-provider-mode><option value="preview">{ar ? "محرك المعاينة" : "Preview engine"}</option><option value="server">{ar ? "مزوّد عبر الخادم" : "Server provider"}</option></select></label>
      <label className="block"><span className="text-xs text-muted-foreground">{ar ? "المزوّد" : "Provider"}</span><input className="field-input" value={provider} onChange={(e) => setProv(e.target.value)} data-no-i18n /></label>
      {mode === "server" && <><label className="block"><span className="text-xs text-muted-foreground">{ar ? "عنوان الخدمة (https)" : "Endpoint (https)"}</span><input className="field-input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} data-dp-provider-endpoint data-no-i18n /></label>
        <label className="block"><span className="text-xs text-muted-foreground">{ar ? "اسم السر" : "Secret name"}</span><input className="field-input" value={secret} onChange={(e) => setSecret(e.target.value.toUpperCase())} placeholder="OCR_API_KEY" data-no-i18n /></label></>}
      <button type="submit" className="btn-primary" data-dp-provider-save>{ar ? "حفظ" : "Save"}</button>
    </form>
  </Panel>;
}
