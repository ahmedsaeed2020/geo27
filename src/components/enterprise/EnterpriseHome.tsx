import { DevOnly } from "@/components/DevOnly";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { useHydrated } from "@/components/hrms/HrShell";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { translateTo, useLang } from "@/i18n";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { indexQuery } from "@/lib/catalog";
import { matchFilter } from "@/lib/desk";
import { canReadType, readLimited, scopedList, useScopeMetas } from "@/lib/scope";
import { defaultCompany } from "@/lib/sessionDefaults";
import { openShellDialog, useSettings } from "@/lib/userSettings";
import { indicatorHref, owningApp, useEnterprise, type EnterpriseApp } from "@/plugins/enterprise";
import { setActiveExperience } from "@/plugins/theme";
import type { EnterpriseIndicator } from "@/plugins/experienceSlots";
import { appLabel, AppTile, leaveExperience } from "./EnterpriseDock";
import { DigitIcon } from "./DigitIcon";
import { ADMIN_LINKS, HELP_LINKS, type PlaceLink } from "./iconMap";
import { notificationSubject, notificationType, recentUserChanges } from "@/lib/activityFeed";
import { accentOf, ContextStrip, darkArt, CustomizeScope, DeltaChip, hasAccent, Page, Spark, WorkPanel, Zone } from "./kit";
import { PageBlocks, pageDashboard } from "@/components/dashboards/PageBlocks";

const L = {
  eyebrow: { en: "DIGIT Enterprise", ar: "ديجيت للمؤسسات" },
  hello: { en: "Welcome", ar: "مرحبًا" },
  sub: { en: "Every DIGIT application you use, on one set of records.", ar: "كل تطبيقات ديجيت التي تستخدمها، على سجلات واحدة." },
  company: { en: "Company", ar: "الشركة" },
  today: { en: "Today", ar: "اليوم" },
  search: { en: "Search everything", ar: "ابحث في كل شيء" },
  apps: { en: "Applications", ar: "التطبيقات" },
  appsSub: { en: "Each app shows one headline figure from the records you may read; open the app or jump straight to a module.", ar: "يعرض كل تطبيق رقمًا رئيسيًا واحدًا من السجلات المسموح لك بقراءتها؛ افتح التطبيق أو انتقل مباشرة إلى وحدة." },
  open: { en: "Open", ar: "فتح" },
  modules: { en: "Modules", ar: "الوحدات" },
  also: { en: "Also", ar: "أيضًا" },
  denied: { en: "Not permitted", ar: "غير مسموح" },
  limited: { en: "Limited to records you can see", ar: "يقتصر على السجلات المسموح لك برؤيتها" },
  work: { en: "My work", ar: "أعمالي" },
  workSub: { en: "Assignments, notifications and your recent changes in one place.", ar: "المهام المسندة والإشعارات وآخر تغييراتك في مكان واحد." },
  assigned: { en: "Assigned to me", ar: "المسندة إليّ" },
  noAssigned: { en: "Nothing is assigned to you.", ar: "لا توجد أعمال مسندة إليك." },
  notes: { en: "Notifications", ar: "الإشعارات" },
  noNotes: { en: "No notifications.", ar: "لا توجد إشعارات." },
  recent: { en: "Recent changes", ar: "آخر التغييرات" },
  noRecent: { en: "No recent changes by you.", ar: "لا توجد تغييرات حديثة منك." },
  unread: { en: "Unread", ar: "غير مقروء" },
  myTasks: { en: "My tasks", ar: "مهامي" },
  unreadN: { en: "Unread notifications", ar: "إشعارات غير مقروءة" },
  none: { en: "No DIGIT application is enabled for you. An administrator can enable apps in Apps & Plugins.", ar: "لا يوجد تطبيق ديجيت مفعّل لك. يمكن للمسؤول تفعيل التطبيقات من التطبيقات والإضافات." },
  loading: { en: "Loading…", ar: "جارٍ التحميل…" },
  help: { en: "Help & services", ar: "المساعدة والخدمات" },
  admin: { en: "Administration", ar: "الإدارة" },
  vat: { en: "VAT no.", ar: "الرقم الضريبي" },
  openCompany: { en: "Company record", ar: "سجل الشركة" },
  pos: { en: "Point of sale", ar: "نقطة البيع" },
  last6: { en: "by month, last 6 months", ar: "حسب الشهر، آخر 6 أشهر" },
  ofTotal: { en: "of all records", ar: "من كل السجلات" },
  vs30: { en: "vs 30 days ago", ar: "مقارنة بقبل 30 يومًا" },
  noSession: { en: "No session company", ar: "لا توجد شركة للجلسة" },
  week: { en: "This week", ar: "هذا الأسبوع" },
  weekSub: { en: "Calendar events of the next seven days — open one to see it in full.", ar: "أحداث التقويم للأيام السبعة القادمة — افتح أيًّا منها لعرضه كاملًا." },
  noEvents: { en: "Nothing scheduled", ar: "لا مواعيد" },
  todayDay: { en: "Today", ar: "اليوم" },
};
type K = keyof typeof L;

/** Headline visual per app (owner 2026-11-12 C1): each app shows its one insight in a different form. */
type Form = "spark" | "ring" | "bars" | "delta" | "progress";
const FORM_OF: Record<string, Form> = { digit_pro: "spark", digit_hr: "ring", digit_construction: "bars", digit_crm: "delta", digit_fsm: "progress" };
const FORMS: Form[] = ["spark", "ring", "bars", "delta", "progress"];

/**
 * DIGIT Enterprise Home (template T1): hero strip (company, date, search, my tasks), the app switcher — large branded
 * tiles, each with one headline insight drawn in its own visual form and the app's module shortcuts — then one tabbed
 * "My work" panel and a compact footer row for company, help and administration links.
 */
export function EnterpriseHome() {
  useStoreVersion();
  const hyd = useHydrated();
  const ar = useLang() === "ar"; const t = (k: K) => (ar ? L[k].ar : L[k].en);
  const { apps, user, desk } = useEnterprise();
  const s = useSettings();
  const [tab, setTab] = useState("assigned");
  // Opening the Enterprise Home is a deliberate choice: no app experience is active here.
  useEffect(() => { leaveExperience(); }, []);
  const idx = useQuery(indexQuery);
  const inds = apps.flatMap((a) => a.entry?.indicators ?? []);
  useScopeMetas(hyd ? [...inds.map((i) => i.doctype), "ToDo", "Notification Log", "Version", "Company", "POS Profile", "Event"] : []);
  const entry = (dt: string) => idx.data?.find((e) => e.name === dt);
  // a native document opens inside the DIGIT app whose navigation hosts it (its shell + return path), else in the Desk
  const docLink = (dt: string, name: string) => { const e = entry(dt); if (!e) return undefined; const own = owningApp(dt, user); return { to: "/app/$app/$doctype/$name" as const, params: { app: e.app, doctype: e.slug, name }, onClick: () => { if (own) setActiveExperience(own); } }; };
  const company = hyd ? defaultCompany(user) : "";
  const today = new Date().toISOString().slice(0, 10);
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || user;
  const assigned = hyd ? assignedTo(user) : []; const notes = hyd ? notifications(user) : []; const recent = hyd ? recentChanges(user) : [];
  const unread = notes.filter((n) => !n["read"]).length;
  const rowList = (rows: Doc[], empty: string, denied: boolean, render: (d: Doc) => ReactNode, meta: (d: Doc) => string) => denied ? <p className="ek-empty">{t("denied")}</p> : rows.length === 0 ? <p className="ek-empty">{empty}</p>
    : <ul className="ek-rowlist">{rows.map((d) => <li key={d.name} className="ek-row" data-ek-work-row>{render(d)}<span className="ek-row-meta" data-no-i18n>{meta(d)}</span></li>)}</ul>;
  return (
    <Shell nav="enterprise">
      <Page template="T1" id="enterprise-home">
        <div className="dx-page ek-home" data-enterprise-home>
          <Zone zone="hero" label={t("eyebrow")}><CustomizeScope on={hyd}>
            <ContextStrip eyebrow={t("eyebrow")} title={<>{t("hello")}{ar ? "، " : ", "}<bdi data-no-i18n>{name}</bdi></>} sub={t("sub")}
              facts={[{ id: "company", label: t("company"), value: company || "—" }, { id: "today", label: t("today"), value: today }]}
              aside={hyd ? <div className="ek-home-me" role="group" aria-label={t("work")}>
                <button type="button" className="ek-home-me-chip" onClick={() => { setTab("assigned"); document.getElementById("ek-home-work")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} data-ek-home-tasks={assigned.length}><b data-no-i18n>{assigned.length}</b><span>{t("myTasks")}</span></button>
                <button type="button" className="ek-home-me-chip" onClick={() => { setTab("notes"); document.getElementById("ek-home-work")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} data-ek-home-unread={unread}><b data-no-i18n>{unread}</b><span>{t("unreadN")}</span></button>
              </div> : null}
              actions={<button type="button" className="ek-btn-on-dark" onClick={() => openShellDialog("global-search")} data-enterprise-search><DigitIcon name="ui-search" on="dark" size={18} />{t("search")}</button>} />
          </CustomizeScope></Zone>

          {hyd ? <PageBlocks def={HOME_DASH()} company={company} nodes={{
          apps: <Zone zone="apps" title={t("apps")} sub={t("appsSub")}>
            {!hyd ? <p className="ek-empty">{t("loading")}</p> : apps.length === 0 ? <p className="ek-empty" data-enterprise-empty>{t("none")}</p> : (
              <div className="ek-home-apps" data-ek-app-count={apps.length}>
                {apps.map((a, i) => <AppSwitchTile key={a.name} a={a} ar={ar} t={t} form={FORM_OF[a.name] ?? FORMS[i % FORMS.length]!} appOf={(dt) => entry(dt)?.app} ready={!!idx.data} user={user} today={today} />)}
              </div>
            )}
          </Zone>,
          work: <div id="ek-home-work"><Zone zone="work">
            {hyd && <WorkPanel id="home-work" title={t("work")} sub={t("workSub")} active={tab} onTab={setTab} height={360} tabs={[
              { id: "assigned", label: t("assigned"), count: assigned.length, tone: "attention", attrs: { "data-ek-home-tab": "assigned" }, content: rowList(assigned, t("noAssigned"), !canReadType("ToDo", user), (d) => {
                const ref = d["reference_type"] && d["reference_name"] ? docLink(String(d["reference_type"]), String(d["reference_name"])) : docLink("ToDo", d.name);
                const label = String(d["description"] ?? d.name).replace(/<[^>]+>/g, "").slice(0, 90);
                return <span className="ek-row-main"><DigitIcon name="ui-user" size={16} />{ref ? <Link {...ref} className="ek-row-title" data-no-i18n>{label}</Link> : <span className="ek-row-title" data-no-i18n>{label}</span>}
                  {d["reference_type"] ? <span className="ek-row-meta">{ar ? translateTo(String(d["reference_type"]), "ar") : String(d["reference_type"])}</span> : null}</span>;
              }, (d) => String(d["date"] ?? "")) },
              { id: "notes", label: t("notes"), count: unread, tone: "risk", attrs: { "data-ek-home-tab": "notes" }, content: rowList(notes, t("noNotes"), false, (d) => {
                const ref = d["document_type"] && d["document_name"] ? docLink(String(d["document_type"]), String(d["document_name"])) : undefined;
                // subject in the UI language (activityFeed.notificationSubject); the stored subject is unchanged
                const label = notificationSubject(d, ar ? "ar" : "en").slice(0, 90);
                return <span className="ek-row-main">{!d["read"] ? <span className="ek-dot" data-tone="risk" title={t("unread")} aria-label={t("unread")} /> : <span className="ek-dot" />}{ref ? <Link {...ref} className="ek-row-title" data-no-i18n>{label}</Link> : <span className="ek-row-title" data-no-i18n>{label}</span>}
                  <span className="ek-row-meta">{notificationType(String(d["type"] ?? ""), ar ? "ar" : "en")}</span></span>;
              }, (d) => String(d["creation"] ?? "").slice(0, 10)) },
              { id: "recent", label: t("recent"), count: recent.length, attrs: { "data-ek-home-tab": "recent" }, content: rowList(recent, t("noRecent"), !canReadType("Version", user), (d) => {
                const ref = docLink(String(d["ref_doctype"]), String(d["docname"])); const dt = String(d["ref_doctype"]);
                // DocType name follows the UI language; the document name stays record content (data-no-i18n)
                const label = <><span>{ar ? translateTo(dt, "ar") : dt}</span><span data-no-i18n>{` · ${String(d["docname"])}`}</span></>;
                return <span className="ek-row-main"><DigitIcon name="ui-refresh" size={16} />{ref ? <Link {...ref} className="ek-row-title">{label}</Link> : <span className="ek-row-title">{label}</span>}</span>;
              }, (d) => String(d["creation"] ?? "").slice(0, 16).replace("T", " ")) },
            ]} />}
          </Zone></div>,
          week: <Zone zone="week" title={t("week")} sub={t("weekSub")}>
            <WeekAgenda user={user} today={today} ar={ar} t={t} docLink={docLink} />
          </Zone>,
          footer: <Zone zone="footer">
            {hyd && <HomeFooter company={company} user={user} ar={ar} t={t} desk={desk} entry={entry} />}
          </Zone>,
          }} /> : <p className="ek-empty">{t("loading")}</p>}
        </div>
      </Page>
    </Shell>
  );
}

/** Home as a page dashboard (owner 2026-11-13 §2.4): apps, my work and the footer links are blocks users reorder, resize or remove. */
const HOME_DASH = () => pageDashboard("enterprise", "home", ["Enterprise Home", "الرئيسية"], [
  { id: "apps", title: ["Applications", "التطبيقات"], meaning: ["Every DIGIT app you may open, with its headline figure and sections.", "كل تطبيقات ديجيت المسموح لك بفتحها مع رقمها الرئيسي وأقسامها."] },
  { id: "work", title: ["My work", "أعمالي"] },
  { id: "week", title: ["This week", "هذا الأسبوع"], meaning: ["Your calendar events of the next seven days, day by day.", "أحداث تقويمك للأيام السبعة القادمة، يومًا بيوم."] },
  { id: "footer", title: ["Company, support and settings", "الشركة والدعم والإعدادات"] },
]);

/**
 * "This week" (owner 2026-11-13 §2d — Home gets a fourth, different visual): a seven-day strip of the user's Event
 * records (public events and the user's own private ones, role-checked), each opening the event. Figures appear nowhere
 * else on Home.
 */
function WeekAgenda({ user, today, ar, t, docLink }: { user: string; today: string; ar: boolean; t: (k: K) => string; docLink: (dt: string, name: string) => ({ to: "/app/$app/$doctype/$name"; params: { app: string; doctype: string; name: string }; onClick: () => void } | undefined) }) {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const events = canReadType("Event", user) ? scopedList("Event", user).filter((e) => (e["event_type"] !== "Private" || !e["owner"] || e["owner"] === user) && e["status"] !== "Cancelled") : [];
  const on = (day: string) => events.filter((e) => String(e["starts_on"] ?? "").slice(0, 10) === day).sort((a, b) => String(a["starts_on"]).localeCompare(String(b["starts_on"])));
  const wd = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "long", timeZone: "UTC" });
  return <ol className="ek-week" data-ek-chart="week" data-ek-home-week={events.length}>{days.map((day) => { const list = on(day); return (
    <li key={day} className="ek-week-day" data-today={day === today || undefined} data-ek-week-day={day}>
      <div className="ek-week-h"><span>{day === today ? t("todayDay") : wd(day)}</span><b data-no-i18n>{day.slice(8, 10)}</b></div>
      {list.length ? <ul className="ek-week-list">{list.map((e) => { const ref = docLink("Event", e.name); const label = String((ar && e["subject_ar"]) || e["subject"] || e.name);
        const time = String(e["starts_on"] ?? "").slice(11, 16);
        return <li key={e.name} data-ek-week-event={e.name}>{time && time !== "00:00" ? <time data-no-i18n>{time}</time> : null}{ref ? <Link {...ref} className="ek-week-title" data-no-i18n>{label}</Link> : <span className="ek-week-title" data-no-i18n>{label}</span>}</li>; })}</ul>
        : <p className="ek-week-none">{t("noEvents")}</p>}
    </li>
  ); })}</ol>;
}

function assignedTo(user: string): Doc[] {
  if (!canReadType("ToDo", user)) return [];
  return scopedList("ToDo", user).filter((d) => d["allocated_to"] === user && (d["status"] ?? "Open") === "Open").sort((a, b) => String(b["date"] ?? b["creation"] ?? "").localeCompare(String(a["date"] ?? a["creation"] ?? ""))).slice(0, 12);
}
/** Notification Log rows addressed to the user (the bell's own rule), unread first. */
function notifications(user: string): Doc[] {
  return adapter.list("Notification Log").filter((n) => n["for_user"] === user).sort((a, b) => Number(!!a["read"]) - Number(!!b["read"]) || String(b["creation"]).localeCompare(String(a["creation"]))).slice(0, 12);
}
function recentChanges(user: string): Doc[] {
  if (!canReadType("Version", user)) return [];
  // provenance rule (src/lib/activityFeed.ts): sample/setup creations are not changes "by you"
  return recentUserChanges(scopedList("Version", user), user);
}

/* ------------------------------------------------------------------ headline insight ------------------------------------------------------------------ */
const DATE_FIELDS = ["posting_date", "transaction_date", "schedule_date", "date_of_joining", "opening_date", "expected_start_date", "date", "creation"];
const dateOf = (d: Doc) => { for (const f of DATE_FIELDS) { const v = d[f]; if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); } return ""; };
const ym = (iso: string, back: number) => { const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
/** The indicator's own count plus its shape over time — all from the same filtered, permission-scoped records (indicatorValue's rule). */
export function indicatorInsight(ind: EnterpriseIndicator, user: string, today: string): { value: number; total: number; months: number[]; monthKeys: string[]; prev: number } | undefined {
  if (!canReadType(ind.doctype, user)) return undefined;
  const all = scopedList(ind.doctype, user); const hit = all.filter((d) => ind.filters.every((f) => matchFilter(d, f as [string, string, unknown])));
  const monthKeys = [5, 4, 3, 2, 1, 0].map((b) => ym(today, b));
  const months = monthKeys.map((k) => hit.filter((d) => dateOf(d).startsWith(k)).length);
  const cut = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  return { value: hit.length, total: all.length, months, monthKeys, prev: hit.filter((d) => { const x = dateOf(d); return !!x && x <= cut; }).length };
}

function Headline({ ind, form, ar, t, user, today, href }: { ind: EnterpriseIndicator; form: Form; ar: boolean; t: (k: K) => string; user: string; today: string; href: ((n: ReactNode) => ReactNode) | undefined }) {
  const v = indicatorInsight(ind, user, today);
  const label = ar ? ind.label.ar : ind.label.en; const def = ar ? ind.definition.ar : ind.definition.en;
  const fmtN = (n: number) => n.toLocaleString("en-US");
  if (!v) return <div className="ek-home-insight" data-form={form} data-denied data-enterprise-indicator={ind.id}><span className="ek-home-ins-label">{label}</span><span className="ek-home-ins-note">{t("denied")}</span></div>;
  const share = v.total ? v.value / v.total : 0;
  const value = <b className="ek-home-ins-value" data-no-i18n>{fmtN(v.value)}</b>;
  let visual: ReactNode = null; let note = def;
  if (form === "spark") { visual = <Spark values={v.months} tone={ind.tone === "attention" ? "attention" : "good"} height={44} label={`${label}: ${v.months.join(", ")}`} />; note = t("last6"); }
  else if (form === "ring") { const C = 2 * Math.PI * 16; visual = <span className="ek-home-ring" aria-hidden><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" className="ek-ring-track" /><circle cx="20" cy="20" r="16" className="ek-ring-fill" style={{ stroke: "var(--ek-app)", strokeDasharray: `${share * C} ${C}` }} /></svg><em data-no-i18n>{Math.round(share * 100)}%</em></span>; note = `${t("ofTotal")} (${fmtN(v.total)})`; }
  else if (form === "bars") { const mx = Math.max(1, ...v.months); visual = <span className="ek-home-bars" aria-hidden>{v.months.map((m, i) => <i key={v.monthKeys[i]} style={{ height: `${Math.max(6, (m / mx) * 100)}%` }} title={`${v.monthKeys[i]}: ${m}`} />)}</span>; note = t("last6"); }
  else if (form === "delta") { const pct = v.prev ? ((v.value - v.prev) / v.prev) * 100 : v.value ? 100 : 0; visual = <DeltaChip d={{ pct, better: ind.tone === "attention" ? "down" : "up" }} ar={ar} />; note = t("vs30"); }
  else { visual = <span className="ek-home-progress" aria-hidden><i style={{ width: `${Math.max(2, share * 100)}%` }} /></span>; note = `${t("ofTotal")} (${fmtN(v.total)})`; }
  const body = <><span className="ek-home-ins-label">{label}</span><span className="ek-home-ins-main">{value}{form === "delta" || form === "ring" ? visual : null}</span>{form !== "delta" && form !== "ring" && visual}<span className="ek-home-ins-note" title={def}>{note}</span>
    {readLimited(ind.doctype) && <span className="ek-home-ins-note" data-enterprise-limited>{t("limited")}</span>}</>;
  return <div className="ek-home-insight" data-form={form} data-enterprise-indicator={ind.id} data-ek-headline={form}>{href ? href(body) : body}</div>;
}

function AppSwitchTile({ a, ar, t, form, appOf, ready, user, today }: { a: EnterpriseApp; ar: boolean; t: (k: K) => string; form: Form; appOf: (dt: string) => string | undefined; ready: boolean; user: string; today: string }) {
  const mods = a.entry?.modules() ?? [];
  const inds = a.entry?.indicators ?? [];
  const head = inds[0]; const rest = inds.slice(1);
  const linkFor = (ind: EnterpriseIndicator) => { const app = ind.app ?? appOf(ind.doctype); if (!ready || !app) return undefined; return (n: ReactNode) => <Link {...indicatorHref(ind, app)} onClick={() => setActiveExperience(a.name)} className="ek-home-ins-link">{n}</Link>; };
  return (
    <article className="ek-home-app" data-ek-app={a.name} data-enterprise-card={a.name} data-dx-card>
      <Link to={a.dock.home as "/"} className="ek-home-app-head" data-enterprise-open={a.name} data-row-primary aria-label={`${t("open")} ${appLabel(a, ar)}`}>
        <AppTile icon={a.dock.icon} tile={a.dock.tile} size="lg" app={a.name} />
        <span className="min-w-0 flex-1"><span className="ek-home-app-name" data-no-i18n>{appLabel(a, ar)}</span>{a.entry && <span className="ek-home-app-desc" data-no-i18n>{ar ? a.entry.description.ar : a.entry.description.en}</span>}</span>
        <span className="ek-home-app-go" aria-hidden>{ar ? "←" : "→"}</span>
      </Link>
      <DevOnly><span className="dx-badge" data-no-i18n data-app-version>v{a.version}</span></DevOnly>
      {head && <Headline ind={head} form={form} ar={ar} t={t} user={user} today={today} href={linkFor(head)} />}
      {rest.length > 0 && <ul className="ek-home-also" aria-label={t("also")}>{rest.map((ind) => { const v = indicatorInsight(ind, user, today); const l = linkFor(ind); const body = <><span>{ar ? ind.label.ar : ind.label.en}</span><b data-no-i18n>{v ? v.value.toLocaleString("en-US") : "—"}</b></>;
        return <li key={ind.id} data-enterprise-indicator={ind.id} data-tone={ind.tone ?? "neutral"}>{v && l ? l(body) : <span className="ek-home-ins-link">{body}</span>}</li>; })}</ul>}
      {mods.length > 0 && <nav className="ek-home-mods" aria-label={`${t("modules")} — ${appLabel(a, ar)}`}>
        {mods.map((m) => (
          <Link key={m.id} to={m.to as "/"} search={(m.search ?? {}) as never} className="ek-home-mod" data-enterprise-home-module={`${a.name}:${m.id}`} onClick={() => setActiveExperience(a.name)}>
            <span className="ek-home-mod-ico" data-ek-accent={hasAccent(m.id) ? m.id : a.name} style={{ "--ek-mod-acc": hasAccent(m.id) ? accentOf(m.id) : "var(--ek-app)" } as CSSProperties}>{m.Icon ? <m.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} /> : m.icon ? <img src={darkArt(m.icon)} alt="" /> : null}</span>
            <span className="ek-home-mod-l" data-no-i18n>{ar ? m.label.ar : m.label.en}</span>
          </Link>
        ))}
      </nav>}
    </article>
  );
}

/* ------------------------------------------------------------------ footer row ------------------------------------------------------------------ */
type IndexEntry = { name: string; app: string; slug: string };
function placeTo(l: PlaceLink, entry: (dt: string) => IndexEntry | undefined): { to: string; params?: Record<string, string> } | undefined {
  if (l.doctype) { const e = entry(l.doctype); return e ? { to: "/app/$app/$doctype", params: { app: e.app, doctype: e.slug } } : undefined; }
  const page = l.to?.match(/^\/page\/(.+)$/)?.[1];
  return page ? { to: "/page/$name", params: { name: page } } : l.to ? { to: l.to } : undefined;
}
function LinkMenu({ id, title, icon, links, user, ar, entry }: { id: string; title: string; icon: "ui-support" | "ui-settings"; links: PlaceLink[]; user: string; ar: boolean; entry: (dt: string) => IndexEntry | undefined }) {
  const shown = links.filter((l) => (l.doctype ? !!entry(l.doctype) && canReadType(l.doctype, user) : true));
  if (!shown.length) return null;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" className="ek-link-chip" data-enterprise-links={id}><DigitIcon name={icon} size={16} />{title}<span className="ek-chip-n" data-no-i18n>{shown.length}</span></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-56" data-ek-home-menu={id}>{shown.map((l) => { const to = placeTo(l, entry); return to ? <DropdownMenuItem key={l.id} asChild><Link to={to.to as "/"} params={to.params as never} data-place-link={l.id} className="flex items-center gap-2"><DigitIcon name={l.icon} size={16} /><span>{ar ? l.label.ar : l.label.en}</span></Link></DropdownMenuItem> : null; })}</DropdownMenuContent>
  </DropdownMenu>;
}
function HomeFooter({ company, user, ar, t, desk, entry }: { company: string; user: string; ar: boolean; t: (k: K) => string; desk: boolean; entry: (dt: string) => IndexEntry | undefined }) {
  const readCo = canReadType("Company", user);
  const companies = readCo ? scopedList("Company", user) : [];
  const doc = company ? companies.find((c) => c.name === company) : undefined;
  const ce = entry("Company"); const posE = entry("POS Profile");
  const pos = canReadType("POS Profile", user) ? scopedList("POS Profile", user).filter((p) => !p["company"] || p["company"] === company) : [];
  const val = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v));
  const facts: [string, string, string | undefined][] = doc ? [["country", ar ? "الدولة" : "Country", val(doc["country"])], ["currency", ar ? "العملة الافتراضية" : "Default currency", val(doc["default_currency"])], ["tax", t("vat"), val(doc["tax_id"])],
    ["phone", ar ? "الهاتف" : "Phone", val(doc["phone_no"])], ["email", ar ? "البريد الإلكتروني" : "Email", val(doc["email"])], ["domain", ar ? "القطاع" : "Industry", val(doc["domain"])], ...(companies.length > 1 ? [["companies", ar ? "الشركات المتاحة لك" : "Companies you can access", String(companies.length)] as [string, string, string]] : [])] : [];
  return <nav className="ek-card ek-home-foot" aria-label={`${t("company")} · ${t("help")}`} data-enterprise-company>
    {doc ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="ek-home-foot-co" data-ek-home-company><DigitIcon name="ind-multibranch" size={18} /><b data-no-i18n>{company}</b>{doc["tax_id"] ? <span className="ek-muted">{t("vat")} <bdi data-no-i18n>{String(doc["tax_id"])}</bdi></span> : null}<span aria-hidden className="ek-muted">▾</span></button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64" data-ek-home-menu="company">
        <dl className="grid gap-1 px-2 py-1.5 text-sm">{facts.map(([id, label, v]) => <div key={id} className="flex justify-between gap-4" data-company-fact={id}><dt className="text-muted-foreground">{label}</dt>{v ? <dd data-no-i18n>{v}</dd> : <dd data-unset className="text-muted-foreground">{ar ? "غير محدد" : "Not set"}</dd>}</div>)}</dl>
        {ce && <DropdownMenuItem asChild><Link to="/app/$app/$doctype/$name" params={{ app: ce.app, doctype: ce.slug, name: company }} data-company-open>{t("openCompany")}</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu> : <span className="ek-home-foot-co"><DigitIcon name="ind-multibranch" size={18} /><b data-no-i18n>{company || t("noSession")}</b></span>}
    <div className="ek-links-list">
      {pos.length > 0 && <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" className="ek-link-chip" data-pos-menu><DigitIcon name="mod-pos" size={16} />{t("pos")}<span className="ek-chip-n" data-no-i18n>{pos.length}</span></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56" data-ek-home-menu="pos">
          <DropdownMenuItem asChild><Link to="/page/$name" params={{ name: "point-of-sale" }} data-pos-page>{ar ? "فتح نقطة البيع" : "Open Point of Sale"}</Link></DropdownMenuItem>
          {posE && pos.map((p: Doc) => <DropdownMenuItem key={p.name} asChild><Link to="/app/$app/$doctype/$name" params={{ app: posE.app, doctype: posE.slug, name: p.name }} data-pos-profile={p.name}><span data-no-i18n>{p.name}</span></Link></DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>}
      <LinkMenu id="help" title={t("help")} icon="ui-support" links={HELP_LINKS} user={user} ar={ar} entry={entry} />
      {desk && <LinkMenu id="admin" title={t("admin")} icon="ui-settings" links={ADMIN_LINKS} user={user} ar={ar} entry={entry} />}
    </div>
  </nav>;
}
