/**
 * Shared global-service pages (owner enterprise UI goal 2026-10-21, Lock 1): Compliance and Help open these Core pages
 * when the active DIGIT app has no page of its own, so every app's rail offers the same four services. Both render inside
 * the active app shell (Shell) and read only records the session user may read (scope.ts); nothing is stored or invented —
 * the vendor support desk and live chat open their Core screens (src/components/enterprise/SupportDesk.tsx).
 */
import { KnowledgeBase } from "@/components/enterprise/Knowledge";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { BandTabsHost, ContextStrip } from "@/components/enterprise/kit/templates";
import { BandSlotProvider } from "./bandSlot";
import { BucketBars, ColumnChart, CommandBand, DxPanel, DxSplit, DxState, SignalCard, SignalGrid } from "@/components/digit/Experience";
import { indexQuery } from "@/lib/catalog";
import { runtimeContractQuery } from "@/lib/runtimeContract";
import { canReadType, scopedList } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";
import { openShellDialog } from "@/lib/userSettings";
import { setAssistantOpen } from "@/lib/assistant/store";
import { t as tr, useLang } from "@/i18n";
import { enabledPlugins, usePluginsVersion } from "@/plugins/runtime";
import { setActiveExperience, useActiveExperience } from "@/plugins/theme";
import { railModules } from "@/plugins/appModules";
import { corePageOwner, useExperienceSlots } from "@/plugins/experienceSlots";
import { hrefOfTarget, navTarget } from "@/components/plugins/ModuleRailNav";
import { DigitIcon, type DigitIconName } from "./DigitIcon";
import { HELP_LINKS } from "./iconMap";
import { ACCOUNTING_CREATE, CreateMenu, type CreateItem } from "./CreateMenu";

type Entry = { name: string; app: string; slug: string };
/** Records live in browser storage: render the counts only after hydration so server and client markup match. */
const useHydratedFlag = () => useSyncExternalStore(() => () => {}, () => true, () => false);
const AREA: Record<string, [string, string, string]> = {
  finance: ["Finance", "المالية", "mod-accounts"], tax: ["Tax & Zakat", "الضرائب والزكاة", "trust-zatca"], control: ["Controls", "الضوابط والرقابة", "ui-settings"],
  buying: ["Purchasing", "المشتريات", "mod-purchases"], selling: ["Selling", "المبيعات", "mod-sales"], stock: ["Inventory", "المخزون", "mod-inventory"], support: ["Support", "الدعم", "ui-dashboard"], report: ["Reports", "التقارير", "mod-reports"],
};
/** «+ جديد ▾» of a service page band by area (owner CR-01: create actions where the work is). */
const AREA_CREATE: Record<string, CreateItem[]> = {
  finance: ACCOUNTING_CREATE,
  buying: [{ key: "purchase-invoice", doctype: "Purchase Invoice", label: ["Supplier invoice", "فاتورة مورد"] }, { key: "debit-note", doctype: "Purchase Invoice", label: ["Debit note", "إشعار مدين"], values: { is_return: 1 } },
    { key: "payment", doctype: "Payment Entry", label: ["Payment voucher", "سند صرف"], values: { payment_type: "Pay", party_type: "Supplier" } }, { key: "purchase-order", doctype: "Purchase Order" }, { key: "material-request", doctype: "Material Request" }, { key: "rfq", doctype: "Request for Quotation" }],
  selling: [{ key: "sales-invoice", doctype: "Sales Invoice", label: ["Sales invoice", "فاتورة مبيعات"] }, { key: "quotation", doctype: "Quotation" }, { key: "sales-order", doctype: "Sales Order" },
    { key: "receipt", doctype: "Payment Entry", label: ["Receipt voucher", "سند قبض"], values: { payment_type: "Receive", party_type: "Customer" } }, { key: "credit-note", doctype: "Sales Invoice", label: ["Credit note", "إشعار دائن"], values: { is_return: 1 } }],
  stock: [{ key: "stock-entry", doctype: "Stock Entry" }, { key: "material-request", doctype: "Material Request" }, { key: "stock-reconciliation", doctype: "Stock Reconciliation" }],
};
/**
 * Shared service page: Shell + the shared Enterprise band (eyebrow, page title, the page's controls and main action in the
 * band slot), then the page content. A page an app's navigation places (experience slot `corePage`, e.g. DIGIT Pro's
 * department menus) opens inside that app: its sidebar, the band eyebrow "app · department" and the section's sibling
 * pages as tabs directly under the band (owner 2026-11-13: the 16 Part B pages open under Pro, never the Desk sidebar).
 */
export function ServiceRoute({ en, ar: arLabel, children, band = true }: { en: string; ar: string; children: ReactNode; band?: boolean }) {
  const ar = useAr(); const ready = useHydratedFlag(); usePluginsVersion();
  useQuery(runtimeContractQuery); // shared service pages create and submit native documents (documentApi lifecycle evidence)
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = useActiveExperience(); const xp = useExperienceSlots();
  const owner = ready ? corePageOwner(path, active, enabledPlugins().map((p) => p.name)) : undefined;
  useEffect(() => { if (owner && owner !== active) setActiveExperience(owner); }, [owner, active]);
  const cp = xp && xp.name === owner ? xp.slots.corePage : undefined;
  const area = AREA[path.split("/")[1] ?? ""];
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const Eyebrow = cp?.Eyebrow; const Tabs = cp?.Tabs;
  return <Shell crumbs={[{ label: ar ? arLabel : en }]}>{ready ? <BandSlotProvider el={band ? slot : null}><BandTabsHost tabs={Tabs ? <Tabs /> : null}>
    {band && <div className="mb-4" data-service-band data-service-owner={owner ?? ""}><ContextStrip icon={<img src={`/icons/digit/${(area?.[2] ?? "ui-dashboard").split("-")[0]}/digit-${area?.[2] ?? "ui-dashboard"}-dark.svg`} alt="" className="h-6 w-6" />}
      eyebrow={Eyebrow ? <Eyebrow /> : <>{ar ? "ديجيت للمؤسسات" : "DIGIT Enterprise"}{area && <> · {ar ? area[1] : area[0]}</>}</>} title={ar ? arLabel : en}
      actions={<>{AREA_CREATE[path.split("/")[1] ?? ""] && <CreateMenu items={AREA_CREATE[path.split("/")[1] ?? ""]!} ar={ar} />}<div ref={setSlot} className="ek-band-slot" data-band-slot /></>} /></div>}
    {children}</BandTabsHost></BandSlotProvider> : <DxState kind="loading" />}</Shell>;
}
export function ComplianceRoute() { return <ServiceRoute band={false} en="Compliance & audit" ar="الامتثال والتدقيق"><CompliancePage /></ServiceRoute>; }
export function HelpRoute() { return <ServiceRoute band={false} en="Help & support" ar="المساعدة والدعم"><HelpPage /></ServiceRoute>; }
function useIndex() { const q = useQuery(indexQuery); return (dt: string): Entry | undefined => q.data?.find((e) => e.name === dt); }
const useAr = () => useLang() === "ar";
function useActiveApp() { usePluginsVersion(); const x = useActiveExperience(); return enabledPlugins().find((p) => p.name === x); }
const listSearch = (filters?: [string, string, string][]) => (filters ? { filters: JSON.stringify(filters) } : {});

function DocCard({ dt, label, icon, note, filters }: { dt: string; label: string; icon: DigitIconName; note: string; filters?: [string, string, string][] }) {
  const ix = useIndex(); const user = useSessionUser(); const e = ix(dt);
  if (!e || !canReadType(dt, user)) return null;
  const n = scopedList(dt).length;
  return <SignalCard label={label} value={n.toLocaleString("en-US")} basis={note} corner={<DigitIcon name={icon} size={18} />} footer={<>{label} ›</>}
    link={(b, cls) => <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} search={listSearch(filters) as never} className={cls}>{b}</Link>} attrs={{ "data-service-source": dt }} />;
}

// ---------------------------------------------------------------- Compliance & audit
export function CompliancePage() {
  const ar = useAr(); const t = (en: string, a: string) => (ar ? a : en);
  const ix = useIndex(); const user = useSessionUser(); const app = useActiveApp();
  const versions = canReadType("Version", user) ? scopedList("Version") : [];
  const appTypes = new Set((app?.doctypes ?? []).map((d) => d.name));
  const today = new Date(); const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });
  const perDay = days.map((d) => versions.filter((v) => String(v["creation"] ?? "").slice(0, 10) === d).length);
  const byType = new Map<string, number>(); for (const v of versions) { const k = String(v["ref_doctype"] ?? ""); if (k) byType.set(k, (byType.get(k) ?? 0) + 1); }
  const ranked = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const vEntry = ix("Version");
  const vLink = (dt: string) => (node: ReactNode) => (vEntry ? <Link to="/app/$app/$doctype" params={{ app: vEntry.app, doctype: vEntry.slug }} search={listSearch([["ref_doctype", "=", dt]]) as never} className="block rounded hover:bg-muted">{node}</Link> : node);
  const recent = [...versions].sort((a, b) => String(b["creation"] ?? "").localeCompare(String(a["creation"] ?? ""))).slice(0, 12);
  const change = (v: Record<string, unknown>) => { try { const d = JSON.parse(String(v["data"] ?? "{}")) as { created?: boolean; changed?: unknown[] }; return d.created ? t("Created", "إنشاء") : `${t("Fields changed", "حقول معدّلة")}: ${(d.changed ?? []).length}`; } catch { return "—"; } };
  return (
    <div className="w-full min-w-0" data-page="core-compliance">
      <CommandBand eyebrow={app ? (ar ? app.title_ar ?? app.title : app.title) : t("DIGIT Enterprise", "ديجيت للمؤسسات")} title={t("Compliance & audit", "الامتثال والتدقيق")}
        description={t("Who changed what, who may see what, and which errors need attention — read from the system's own audit records.", "من غيّر ماذا، ومن يحق له رؤية ماذا، وأي أخطاء تحتاج انتباهاً — مقروءة من سجلات التدقيق في النظام نفسه.")}
        meta={[{ label: t("Change records", "سجلات التغيير"), value: <span data-no-i18n>{versions.length.toLocaleString("en-US")}</span> }, { label: t("Record types changed", "أنواع سجلات معدّلة"), value: <span data-no-i18n>{byType.size}</span> }]} />
      <DxSplit ratio="1:1">
        <DxPanel title={t("Changes in the last 7 days", "التغييرات خلال آخر 7 أيام")} subtitle={t("Version records per day (create and edit)", "سجلات الإصدار يومياً (إنشاء وتعديل)")}
          actions={vEntry ? <Link to="/app/$app/$doctype" params={{ app: vEntry.app, doctype: vEntry.slug }} className="text-primary hover:underline">{t("Open change history", "فتح سجل التغييرات")}</Link> : undefined} attrs={{ "data-insight": "changes-per-day" }}>
          {versions.length ? <ColumnChart labels={days} labelText={(l) => l.slice(5)} series={[{ name: "v", label: t("Changes", "التغييرات"), values: perDay }]} format={(v) => String(Math.round(v))} ariaLabel={t("Changes per day", "التغييرات يومياً")} />
            : <p className="text-sm text-muted-foreground">{canReadType("Version", user) ? t("No change records yet.", "لا سجلات تغيير بعد.") : t("You may not read the change history.", "لا يحق لك قراءة سجل التغييرات.")}</p>}
        </DxPanel>
        <DxPanel title={t("Most-changed record types", "أكثر أنواع السجلات تعديلاً")} subtitle={t("Each bar opens the change history of that record type", "كل شريط يفتح سجل تغييرات ذلك النوع")} attrs={{ "data-insight": "changes-by-type" }}>
          <BucketBars items={ranked.slice(0, 8).map(([k, v]) => ({ key: k, label: <span data-no-i18n>{tr(k)}</span>, value: v, wrap: vLink(k) }))} format={(v) => v.toLocaleString("en-US")} empty={t("No change records yet.", "لا سجلات تغيير بعد.")} />
        </DxPanel>
      </DxSplit>
      {app && appTypes.size > 0 && <DxPanel title={t("Changes to this application's records", "التغييرات على سجلات هذا التطبيق")} subtitle={<span data-no-i18n>{ar ? app.title_ar ?? app.title : app.title}</span>} attrs={{ "data-insight": "app-changes" }}>
        <BucketBars items={ranked.filter(([k]) => appTypes.has(k)).slice(0, 8).map(([k, v]) => ({ key: k, label: <span data-no-i18n>{tr(k)}</span>, value: v, wrap: vLink(k) }))} format={(v) => v.toLocaleString("en-US")} empty={t("No change records for this application yet.", "لا سجلات تغيير لهذا التطبيق بعد.")} />
      </DxPanel>}
      <h2 className="mb-2 mt-2 text-sm font-semibold">{t("Audit & activity", "التدقيق والنشاط")}</h2>
      <SignalGrid>
        <DocCard dt="Version" label={t("Change history", "سجل التغييرات")} icon="trust-knowledge" note={t("Every create and edit", "كل إنشاء وتعديل")} />
        <DocCard dt="Activity Log" label={t("Activity log", "سجل النشاط")} icon="svc-discovery" note={t("Logins and actions", "الدخول والإجراءات")} />
        <DocCard dt="Access Log" label={t("Access log", "سجل الوصول")} icon="feat-security" note={t("Exports and prints", "التصدير والطباعة")} />
        <DocCard dt="Error Log" label={t("Error logs", "سجلات الأخطاء")} icon="ui-warning" note={t("System errors to review", "أخطاء نظام للمراجعة")} />
        <DocCard dt="Deleted Document" label={t("Deleted documents", "المستندات المحذوفة")} icon="ui-trash" note={t("Restorable deletions", "حذوفات قابلة للاستعادة")} />
      </SignalGrid>
      <h2 className="mb-2 text-sm font-semibold">{t("Access control", "التحكم في الوصول")}</h2>
      <SignalGrid>
        <DocCard dt="User" label={t("Users", "المستخدمون")} icon="ui-user" note={t("Accounts", "الحسابات")} />
        <DocCard dt="Role" label={t("Roles", "الأدوار")} icon="feat-permissions" note={t("Role definitions", "تعريفات الأدوار")} />
        <DocCard dt="Role Profile" label={t("Role profiles", "ملفات الأدوار")} icon="feat-permissions" note={t("Role bundles", "حزم الأدوار")} />
        <DocCard dt="User Permission" label={t("User permissions", "صلاحيات المستخدمين")} icon="feat-security" note={t("Record-level restrictions", "قيود على مستوى السجل")} />
        <DocCard dt="DocShare" label={t("Shared documents", "المستندات المشاركة")} icon="ui-share" note={t("Per-record shares", "مشاركات لكل سجل")} />
      </SignalGrid>
      <DxPanel title={t("Recent changes", "أحدث التغييرات")} flush attrs={{ "data-recent-changes": "" }}>
        {recent.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-start text-[11.5px] text-muted-foreground"><th className="px-4 py-2 text-start font-medium">{t("Record type", "نوع السجل")}</th><th className="px-4 py-2 text-start font-medium">{t("Record", "السجل")}</th><th className="px-4 py-2 text-start font-medium">{t("Change", "التغيير")}</th><th className="px-4 py-2 text-start font-medium">{t("When", "الوقت")}</th></tr></thead>
          <tbody>{recent.map((v) => { const e = ix(String(v["ref_doctype"] ?? "")); const dn = String(v["docname"] ?? ""); return <tr key={v.name} className="border-b border-border/60 last:border-0">
            <td className="px-4 py-2" data-no-i18n>{tr(String(v["ref_doctype"] ?? ""))}</td>
            <td className="px-4 py-2" data-no-i18n>{e ? <Link to="/app/$app/$doctype/$name" params={{ app: e.app, doctype: e.slug, name: dn }} className="text-primary hover:underline">{dn}</Link> : dn}</td>
            <td className="px-4 py-2">{change(v)}</td><td className="px-4 py-2 tabular-nums" data-no-i18n>{String(v["creation"] ?? "").slice(0, 16).replace("T", " ")}</td></tr>; })}</tbody></table></div>
          : <p className="p-4 text-sm text-muted-foreground">{t("No change records yet.", "لا سجلات تغيير بعد.")}</p>}
      </DxPanel>
      <p className="text-[11px] text-muted-foreground">{t("Role permissions are managed in the Role Permissions Manager; tax and e-invoicing compliance needs the related integration app on the server and is not shown here.", "تُدار صلاحيات الأدوار من مدير صلاحيات الأدوار؛ امتثال الضرائب والفوترة الإلكترونية يتطلب تطبيق التكامل المعني على الخادم ولا يظهر هنا.")} <Link to="/page/$name" params={{ name: "permission-manager" } as never} className="text-primary hover:underline">{t("Role Permissions Manager", "مدير صلاحيات الأدوار")}</Link></p>
    </div>
  );
}

// ---------------------------------------------------------------- Help & support
export function HelpPage() {
  const ar = useAr(); const t = (en: string, a: string) => (ar ? a : en);
  const ix = useIndex(); const user = useSessionUser(); const app = useActiveApp();
  const slot = (dt: string) => { const e = ix(dt); return e ? { app: e.app, slug: e.slug } : undefined; };
  const mods = app?.navigation ? railModules(app) : [];
  const HelpExtra = useExperienceSlots()?.slots.HelpExtras;
  const btn = "inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted";
  return (
    <div className="w-full min-w-0" data-page="core-help">
      <CommandBand eyebrow={app ? (ar ? app.title_ar ?? app.title : app.title) : t("DIGIT Enterprise", "ديجيت للمؤسسات")} title={t("Help & support", "المساعدة والدعم")}
        description={t("How to find your way around this application, and where to get help inside the system.", "كيف تتنقل في هذا التطبيق، وأين تجد المساعدة داخل النظام.")} />
      <DxPanel title={t("Get help now", "احصل على المساعدة الآن")} attrs={{ "data-help-actions": "" }}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setAssistantOpen(true)} data-help-action="assistant"><img src="/icons/digit/logo/digit-icon-app.svg" alt="" className="h-5 w-5" />{t("Ask the DIGIT Assistant", "اسأل مساعد ديجيت")}</button>
          <button type="button" className={btn} onClick={() => openShellDialog("global-search")} data-help-action="search"><DigitIcon name="ui-search" size={18} />{t("Search screens and records", "ابحث في الشاشات والسجلات")}</button>
          <button type="button" className={btn} onClick={() => openShellDialog("shortcuts")} data-help-action="shortcuts"><DigitIcon name="ui-info" size={18} />{t("Keyboard shortcuts", "اختصارات لوحة المفاتيح")}</button>
          <button type="button" className={btn} onClick={() => openShellDialog("settings")} data-help-action="settings"><DigitIcon name="ui-settings" size={18} />{t("My settings", "إعداداتي")}</button>
        </div>
      </DxPanel>
      {app && <DxPanel title={t("This application", "هذا التطبيق")} subtitle={<span data-no-i18n>{ar ? app.title_ar ?? app.title : app.title}</span>} attrs={{ "data-help-app": app.name }}>
        <p className="mb-3 text-sm text-muted-foreground" data-no-i18n>{ar ? app.description_ar ?? app.description : app.description}</p>
        {mods.length > 0 && <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{mods.map((m) => { const tg = m.overview ? navTarget(app, m.overview.to, slot) : undefined; const href = tg ? hrefOfTarget(app, tg) : "";
          return <li key={m.key}>{href ? <a href={href} className="block rounded-md border border-border px-3 py-2 text-sm hover:bg-muted" data-help-module={m.key}><span className="font-medium" data-no-i18n>{ar ? m.label_ar ?? m.label : m.label}</span><span className="block text-[11.5px] text-muted-foreground">{t("Open overview", "فتح النظرة العامة")} ›</span></a> : <span data-no-i18n>{m.label}</span>}</li>; })}</ul>}
      </DxPanel>}
      <KnowledgeBase />
      {HelpExtra && <HelpExtra />}
      <h2 className="mb-2 mt-2 text-sm font-semibold">{t("Help content in this system", "محتوى المساعدة في النظام")}</h2>
      <SignalGrid>{HELP_LINKS.filter((l) => l.doctype).map((l) => { const e = ix(l.doctype!); if (!e || !canReadType(l.doctype!, user)) return null;
        return <SignalCard key={l.id} label={ar ? l.label.ar : l.label.en} value={scopedList(l.doctype!).length.toLocaleString("en-US")} corner={<DigitIcon name={l.icon} size={18} />} footer={<>{t("Open", "فتح")} ›</>}
          link={(b, cls) => <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className={cls}>{b}</Link>} attrs={{ "data-help-source": l.doctype }} />; })}</SignalGrid>
      <DxPanel title={t("DIGIT support", "دعم ديجيت")} attrs={{ "data-help-support": "" }}>
        <div className="flex flex-wrap gap-2">
          <Link to="/support" className={btn} data-help-action="support-desk"><DigitIcon name="ui-support" size={18} />{t("DIGIT vendor support desk", "مكتب دعم ديجيت")}</Link>
          <Link to="/support" className={btn} data-help-action="live-chat"><DigitIcon name="ui-info" size={18} />{t("Live chat with a person", "المحادثة المباشرة مع موظف")}</Link>
        </div>
      </DxPanel>
    </div>
  );
}
