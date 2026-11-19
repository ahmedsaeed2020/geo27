/**
 * Construction settings (SET-01 / ADM-01): seven setting families with current value, where each one is used, gaps the
 * research names without verified metadata, and an edit → validate → review → confirm → read-back flow with change
 * history. Owner policy decisions P1–P9 (SET-02) are adapter records; only System Manager may record them.
 */
import { BandTabsHost } from "@/components/enterprise/kit/templates";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { notifyError, notifySaved } from "./notify";
import { adapter, DocValidationError } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm } from "@/lib/session";
import type { PluginPageProps } from "@/plugins/pages";
import { enabledPlugins, installDemo } from "@/plugins/runtime";
import { CONSTRUCTION_ROLES, DOCTYPE_AR } from "../schema";
import { isFrappeHost } from "../domain/host";
import { APP, list, POLICY_AFFECTS, POLICY_TITLES, projectTitle, today } from "../domain/data";
import { policyQueues, type PolicyQueue } from "../domain/policyQueue";
import { FAMILIES, SETTING_DEFS, SETTING_GAPS, SETTING_SERVER, SETTINGS, saveSettings, settingsDiff, settingsDoc, settingsErrors, settingsHistory, type Change, type Family, type SettingDef } from "../domain/settingsAdmin";
import { PRINT_FORMATS, templateVersion } from "../domain/print";
import { demoDataOn, demoRecordCount, loadConstructionDemo, removeConstructionDemo } from "../demoControl";
import { ROLE_AR } from "./layoutEditor";
import { templateLabel } from "./printOutputs";
import { reportTitle } from "./reports";
import { AppLink, DataTable, DocRef, Empty, Field, hasRole, inputCls, ListRef, Note, OWN, PageHeader, Section, StateBadge, useCx, type Col, BTN } from "./kit";
import { DateInput } from "@/components/form/DateInput";

const FAM_KEY = "family";
const NOTIF_AR: Record<string, string> = { "Construction Certificate Confirmed": "اعتماد شهادة دفعة — أنشئ فاتورة المبيعات", "Construction Bill Approved": "اعتماد مستخلص مقاول باطن — أنشئ فاتورة المشتريات" };
export function SettingsPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const fam = (FAMILIES.find((f) => f.key === search[FAM_KEY])?.key ?? "project") as Family;
  const go = (f: Family) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: "settings" }, search: { [FAM_KEY]: f } as never, replace: true });
  const sectionTabs = (
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label={t("Setting families", "مجموعات الإعدادات")}>
        {FAMILIES.map((f) => <button key={f.key} type="button" role="tab" aria-selected={fam === f.key} data-settings-tab={f.key} onClick={() => go(f.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${fam === f.key ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{ar ? f.ar : f.en}</button>)}
      </div>
  );
  return (
    <BandTabsHost tabs={sectionTabs}>
    <div className="w-full min-w-0" data-page="construction-settings" data-settings-family={fam}>
      <PageHeader title={t("Construction settings", "إعدادات المقاولات")} subtitle={t("Defaults, references and policies the app reads, with where each one is used. Unknown settings are listed as gaps, never guessed.", "الافتراضيات والمراجع والسياسات التي يقرؤها التطبيق مع مكان استخدام كل منها. الإعدادات غير المعروفة تُعرض كفجوات ولا تُفترض.")}
        actions={<AppLink to="settings/policies" className={BTN.primary}>{t("Policy decisions", "قرارات السياسات")}</AppLink>} />
      <Note>{t("Scope: one site-wide settings record. Company- or project-specific values are not supported yet; every company reads the same values.", "النطاق: سجل إعدادات واحد للموقع. القيم الخاصة بشركة أو مشروع غير مدعومة بعد؛ تقرأ كل الشركات القيم نفسها.")}</Note>
      {!isFrappeHost() && hasRole() && <DemoDataSection />}
      <div role="tabpanel">
        {(fam === "project" || fam === "finance") && <SettingsEditor family={fam} />}
        {fam === "access" && <AccessFamily />}
        {fam === "workflows" && <WorkflowsFamily />}
        {fam === "reports" && <ReportsFamily />}
        {fam === "print" && <PrintFamily />}
        {fam === "notifications" && <NotificationsFamily />}
        <Gaps family={fam} />
      </div>
      <History />
    </div>
    </BandTabsHost>
  );
}

/**
 * Owner round 2026-11-14: one switch for the app's demo data — remove every demo document (and the ledger rows posted for
 * it) or load it again. Setup (company, accounts, users, policies, settings) and the user's own records stay.
 */
function DemoDataSection() {
  const { t } = useCx();
  const [on, setOn] = useState(demoDataOn());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = demoRecordCount();
  const app = enabledPlugins().find((p) => p.name === APP);
  const remove = () => { setBusy(true); const n = removeConstructionDemo(); setBusy(false); setConfirming(false); setOn(false); notifySaved(t(`${n} demo records removed`, `تم حذف ${n} سجل تجريبي`)); };
  const load = () => { if (!app) return; setBusy(true); const n = loadConstructionDemo(() => installDemo(app)); setBusy(false); setOn(true); notifySaved(t(`${n} demo records loaded`, `تم تحميل ${n} سجل تجريبي`)); };
  return (
    <Section title={t("Demo data", "البيانات التجريبية")}>
      <div className="flex flex-wrap items-center gap-3" data-demo-data={on ? "on" : "off"}>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{on
          ? t(`${c.documents} demo documents in ${c.doctypes} document types: a fictional Saudi contractor with 12 projects (tenders, active, on hold, closeout, closed). Your own records are never part of it.`, `${c.documents} مستنداً تجريبياً في ${c.doctypes} نوعاً: مقاول سعودي افتراضي بـ 12 مشروعاً (مناقصات، نشطة، متوقفة، إغلاق، مغلقة). سجلاتك لا تدخل فيها.`)
          : t("Demo data is removed. Setup (company, accounts, users, policies and settings) and your own records are kept.", "تم حذف البيانات التجريبية. بقيت الإعدادات (الشركة والحسابات والمستخدمون والسياسات) وسجلاتك.")}</p>
        {on
          ? !confirming && <button type="button" className={BTN.danger} disabled={busy} onClick={() => setConfirming(true)} data-demo-remove>{t("Remove demo data", "حذف البيانات التجريبية")}</button>
          : <button type="button" className={BTN.primary} disabled={busy || !app} onClick={load} data-demo-load>{t("Load demo data", "تحميل البيانات التجريبية")}</button>}
      </div>
      {confirming && <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alertdialog" aria-label={t("Remove demo data", "حذف البيانات التجريبية")}>
        <p>{t(`This deletes ${c.documents} demo documents and the accounting and stock entries posted for them. It cannot be undone, but you can load the demo again.`, `سيُحذف ${c.documents} مستنداً تجريبياً مع القيود المحاسبية والمخزنية المرحّلة لها. لا يمكن التراجع، ويمكن تحميل البيانات التجريبية من جديد.`)}</p>
        <div className="mt-2 flex gap-2">
          <button type="button" className={BTN.danger} disabled={busy} onClick={remove} data-demo-remove-confirm>{t("Remove", "حذف")}</button>
          <button type="button" className={BTN.secondary} onClick={() => setConfirming(false)}>{t("Cancel", "إلغاء")}</button>
        </div>
      </div>}
    </Section>
  );
}

function Gaps({ family }: { family: Family }) {
  const { t, ar } = useCx();
  const gaps = SETTING_GAPS.filter((g) => g.family === family);
  const server = SETTING_SERVER.filter((g) => g.family === family);
  if (!gaps.length && !server.length) return null;
  return (
    <>
    {server.length > 0 && <Section title={t("Needs the DIGIT server", "يحتاج خادم DIGIT")}>
      <ul className="space-y-2 text-sm" data-settings-server={family}>{server.map((g) => <li key={g.key} data-settings-server-key={g.key}><span className="font-medium">{ar ? g.ar : g.en}</span> <span className="text-xs text-muted-foreground">— {settingsDoc()?.[g.key] ? <span data-no-i18n>{String(settingsDoc()?.[g.key])}</span> : t("not set", "غير محدد")}</span><p className="text-xs text-muted-foreground">{ar ? g.why_ar : g.why_en}</p></li>)}</ul>
    </Section>}
    {gaps.length > 0 && <Section title={t("Not provided — needs target metadata or an owner decision", "غير متاح — يحتاج بيانات وصفية مستهدفة أو قرار المالك")}>
      <ul className="space-y-2 text-sm" data-settings-gaps={family}>{gaps.map((g) => <li key={g.key} data-settings-gap={g.key}><span className="font-medium">{ar ? g.ar : g.en}</span> <code className="text-[11px] text-muted-foreground" data-no-i18n>{g.key}</code><p className="text-xs text-muted-foreground">{ar ? g.why_ar : g.why_en}</p></li>)}</ul>
    </Section>}
    </>
  );
}

function SettingsEditor({ family }: { family: Family }) {
  const { t, ar } = useCx();
  const defs = SETTING_DEFS.filter((s) => s.family === family);
  const cur = settingsDoc();
  const meta = cachedMeta(SETTINGS);
  const canWrite = !!meta && hasPerm(meta, "write", cur);
  const [stage, setStage] = useState<"view" | "edit" | "review">("view");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [base, setBase] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState<Change[] | null>(null);
  const companies = adapter.list("Company").map((c) => c.name);
  const start = () => { const d = settingsDoc(); setDraft(Object.fromEntries(defs.map((s) => [s.key, String(d?.[s.key] ?? "")]))); setBase(String(d?.["modified"] ?? "")); setErrs({}); setConflict(false); setSaved(null); setStage("edit"); };
  const changes = settingsDiff(cur, draft);
  const review = () => { const e = settingsErrors(Object.fromEntries(changes.map((c) => [c.key, c.after]))); setErrs(e); if (!Object.keys(e).length) setStage("review"); };
  const save = () => {
    const r = saveSettings(draft, base);
    if (r.conflict) { setConflict(true); notifyError(r.errors[0] ?? ""); return; }
    if (!r.ok) { setErrs(r.fieldErrors ?? {}); notifyError(r.errors.join("\n")); setStage("edit"); return; }
    setSaved(r.changes ?? []); setStage("view"); notifySaved(t("Settings saved", "حُفظت الإعدادات"));
  };
  const label = (k: string) => { const s = defs.find((x) => x.key === k); return s ? (ar ? s.ar : s.en) : k; };
  const opt = (s: SettingDef, v: string) => { const o = s.kind === "choice" ? (s.options ?? []).find((x) => x.value === v) : undefined; return o ? (ar ? o.ar : o.en) : v; };
  const shown = (s: SettingDef, v: string) => (v === "" ? t(`Not set — the app uses ${opt(s, s.fallback) || "no default"}`, `غير محدد — يستخدم التطبيق ${opt(s, s.fallback) || "بلا افتراضي"}`) : s.kind === "pct" ? `${v}%` : opt(s, v));
  return (
    <Section title={ar ? FAMILIES.find((f) => f.key === family)!.ar : FAMILIES.find((f) => f.key === family)!.en} actions={stage === "view" && canWrite ? <button type="button" className={BTN.secondary} onClick={start} data-settings-edit>{t("Edit", "تعديل")}</button> : undefined}>
      {!canWrite && <Note>{t("Only a System Manager or Digit Director changes these settings. You can read them.", "يغيّر هذه الإعدادات مدير النظام أو مدير المقاولات فقط. يمكنك قراءتها.")}</Note>}
      {saved && <div className="mb-3 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-sm" role="status" data-settings-saved>{saved.length ? <>{t("Saved and read back:", "حُفظ وأعيدت قراءته:")} {saved.map((c) => <span key={c.key} className="me-3 inline-block"><span>{label(c.key)}</span> = <span data-no-i18n>{String(settingsDoc()?.[c.key] ?? "") || "—"}</span></span>)}</> : t("Nothing changed.", "لم يتغير شيء.")}</div>}
      {stage === "view" && <DataTable rows={defs.map((s) => ({ name: s.key, s }))} empty="" cols={[
        { key: "label", label: t("Setting", "الإعداد"), render: (r) => <span>{ar ? r.s.ar : r.s.en} <code className="block text-[11px] text-muted-foreground" data-no-i18n>{r.s.key}</code></span> },
        { key: "value", label: t("Current value", "القيمة الحالية"), render: (r) => <span data-settings-value={r.s.key} data-no-i18n={String(cur?.[r.s.key] ?? "") !== "" ? true : undefined}>{shown(r.s, String(cur?.[r.s.key] ?? ""))}</span> },
        { key: "used", label: t("Used by", "يستخدمه"), render: (r) => <ul className="text-xs">{r.s.usedBy.map((u) => <li key={u.to}><AppLink to={u.to}>{ar ? u.ar : u.en}</AppLink></li>)}</ul> },
      ] as Col<{ name: string; s: SettingDef }>[]} />}
      {stage === "edit" && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); review(); }} data-settings-form>
        {defs.map((s) => <div key={s.key}>
          <Field label={ar ? s.ar : s.en}>
            {s.kind === "company"
              ? <select className={inputCls} value={draft[s.key] ?? ""} data-settings-input={s.key} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}><option value="">{t("— not set —", "— غير محدد —")}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select>
              : s.kind === "choice"
              ? <select className={inputCls} value={draft[s.key] ?? ""} data-settings-input={s.key} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}><option value="">{t("— not set —", "— غير محدد —")}</option>{(s.options ?? []).map((o) => <option key={o.value} value={o.value}>{ar ? o.ar : o.en}</option>)}</select>
              : <input type="number" inputMode="decimal" step={s.kind === "days" || s.kind === "grace" ? 1 : "any"} className={inputCls} value={draft[s.key] ?? ""} aria-invalid={!!errs[s.key]} data-settings-input={s.key} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} placeholder={s.fallback} />}
          </Field>
          {errs[s.key] && <p className="mt-1 text-xs text-destructive" role="alert" data-settings-error={s.key}>{ar ? arError(s) : errs[s.key]}</p>}
        </div>)}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={BTN.primary} disabled={!changes.length} data-settings-review>{t("Validate and review", "تحقق وراجع")}</button>
          <button type="button" className={BTN.secondary} onClick={() => setStage("view")} data-settings-discard>{t("Discard", "تجاهل")}</button>
          {!changes.length && <span className="self-center text-xs text-muted-foreground">{t("No change yet.", "لا يوجد تغيير بعد.")}</span>}
        </div>
      </form>}
      {stage === "review" && <div data-settings-review-panel>
        {conflict && <Note tone="bad"><span>{t("The settings were changed by someone else after you started editing.", "غيّر شخص آخر الإعدادات بعد أن بدأت التعديل.")}</span> <button type="button" className={`${BTN.compact} ms-2`} onClick={start} data-settings-reload>{t("Reload and start again", "إعادة التحميل والبدء من جديد")}</button></Note>}
        <p className="mb-2 text-sm">{t("Review the change before saving. Nothing is recalculated or reposted; screens read the new value the next time they open.", "راجع التغيير قبل الحفظ. لا يُعاد احتساب أو ترحيل أي شيء؛ تقرأ الشاشات القيمة الجديدة عند فتحها التالي.")}</p>
        <DataTable rows={changes.map((c) => ({ name: c.key, ...c }))} empty="" cols={[
          { key: "key", label: t("Setting", "الإعداد"), render: (r) => <span>{label(r.key)}</span> },
          { key: "before", label: t("Before", "قبل"), render: (r) => <span data-no-i18n>{r.before || "—"}</span> },
          { key: "after", label: t("After", "بعد"), render: (r) => <span className="font-medium" data-no-i18n data-settings-after={r.key}>{r.after || "—"}</span> },
          { key: "affects", label: t("Affects", "يؤثر على"), render: (r) => <span className="text-xs">{(defs.find((s) => s.key === r.key)?.usedBy ?? []).map((u) => (ar ? u.ar : u.en)).join("، ")}</span> },
        ] as Col<Change & { name: string }>[]} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN.primary} onClick={save} disabled={conflict} data-settings-confirm>{t("Confirm and save", "تأكيد وحفظ")}</button>
          <button type="button" className={BTN.secondary} onClick={() => setStage("edit")}>{t("Back to editing", "العودة للتعديل")}</button>
        </div>
      </div>}
    </Section>
  );
}
const arError = (s: SettingDef) => (s.kind === "company" ? "الشركة غير موجودة" : s.kind === "choice" ? `${s.ar}: اختر قيمة من القائمة` : s.kind === "hours" ? `${s.ar}: يجب أن تكون أكبر من 0 وحتى 24` : s.kind === "pct" ? `${s.ar}: يجب أن تكون بين 0 و100` : `${s.ar}: يجب أن تكون عددًا صحيحًا من 1 إلى 365 يومًا`);

function History() {
  const { t, ar } = useCx();
  const h = settingsHistory();
  const label = (k: string) => { const s = SETTING_DEFS.find((x) => x.key === k); return s ? (ar ? s.ar : s.en) : k; };
  return (
    <Section title={t("Change history", "سجل التغييرات")} id="history">
      {!h.length ? <Empty>{t("No change has been saved yet; the app uses the defaults shown above.", "لم يُحفظ أي تغيير بعد؛ يستخدم التطبيق الافتراضيات المعروضة.")}</Empty>
        : <ul className="divide-y divide-border text-sm" data-settings-history>{h.map((e) => <li key={e.name} className="py-2" data-settings-version={e.name}>
            <div className="text-xs text-muted-foreground"><span data-no-i18n>{e.at.replace("T", " ").slice(0, 19)}</span>{e.by && <> · <span data-no-i18n>{e.by}</span></>}{e.created && <> · {t("record created", "إنشاء السجل")}</>}</div>
            {e.changes.map((c) => <div key={c[0]}><span>{label(c[0])}</span>: <span data-no-i18n>{String(c[1] ?? "—")} → {String(c[2] ?? "—")}</span></div>)}
          </li>)}</ul>}
    </Section>
  );
}

function AccessFamily() {
  const { t, ar } = useCx();
  const users = adapter.list("User");
  const roleUsers = (role: string) => users.filter((u) => (u["roles"] as Record<string, unknown>[] | undefined ?? []).some((r) => r["role"] === role)).map((u) => u.name);
  const pol = list("Digit Policy Decision").sort((a, b) => a.name.localeCompare(b.name));
  const undefinedN = pol.filter((p) => p["status"] !== "Defined").length;
  return (
    <>
      <Section title={t("Policy decisions", "قرارات السياسات")} actions={<AppLink to="settings/policies" className={BTN.secondary}>{t("Open", "فتح")}</AppLink>}>
        <p className="mb-2 text-sm">{undefinedN ? t(`${undefinedN} of ${pol.length} policies are not defined; the final actions that depend on them stay blocked.`, `${undefinedN} من ${pol.length} سياسات غير محددة؛ تبقى الإجراءات النهائية المعتمدة عليها موقوفة.`) : t("Every policy is defined.", "كل السياسات محددة.")}</p>
        <DataTable rows={pol as Record<string, unknown>[]} empty="" cols={[
          { key: "name", label: t("Key", "الرمز"), render: (r) => <DocRef doctype="Digit Policy Decision" name={r["name"]} /> },
          { key: "title", label: t("Policy", "السياسة"), render: (r) => <span>{ar ? POLICY_TITLES[String(r["name"])]?.[1] : POLICY_TITLES[String(r["name"])]?.[0] ?? String(r["title"])}</span> },
          { key: "status", label: t("Status", "الحالة"), kind: "state" },
          { key: "affects", label: t("Blocks", "يوقف"), render: (r) => <span className="text-xs">{POLICY_AFFECTS[String(r["name"])]?.[ar ? 1 : 0] ?? ""}</span> },
        ] as Col<Record<string, unknown>>[]} />
      </Section>
      <Section title={t("Roles", "الأدوار")}>
        <DataTable rows={CONSTRUCTION_ROLES.map((r) => ({ name: r, users: roleUsers(r) }))} empty="" cols={[
          { key: "name", label: t("Role", "الدور"), render: (r) => <span>{ar ? ROLE_AR[String(r["name"])] ?? String(r["name"]) : String(r["name"])}</span> },
          { key: "users", label: t("Users", "المستخدمون"), render: (r) => <span className="text-xs" data-no-i18n>{(r["users"] as string[]).join(", ") || "—"}</span> },
        ] as Col<Record<string, unknown>>[]} />
        <p className="mt-2 text-xs text-muted-foreground">{t("Permissions are the DocType role rules and User Permissions; they are enforced on every read and write. Switch the simulated user from the avatar menu to test a role.", "الصلاحيات هي قواعد الأدوار لأنواع المستندات وصلاحيات المستخدم، وتُطبّق على كل قراءة وكتابة. بدّل المستخدم المحاكى من قائمة الصورة الشخصية لاختبار دور.")}</p>
      </Section>
    </>
  );
}

function WorkflowsFamily() {
  const { t, ar } = useCx();
  const app = enabledPlugins().find((p) => p.name === APP);
  type R = { name: string; doctype: string; states: number; transitions: number; sod: number };
  const rows: R[] = (app?.workflows ?? []).map((w) => ({ name: w.name, doctype: w.document_type, states: w.states.length, transitions: w.transitions.length, sod: w.transitions.filter((x) => String(x.allow_self_approval ?? "1") === "0").length }));
  return (
    <Section title={<span>{t("Approval workflows", "مسارات الاعتماد")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({rows.length})</span></span>}>
      <DataTable<R & Record<string, unknown>> rows={rows as (R & Record<string, unknown>)[]} empty={t("No workflows.", "لا توجد مسارات عمل.")} cols={[
        { key: "doctype", label: t("Document", "المستند"), render: (r) => <ListRef doctype={r.doctype}>{ar ? DOCTYPE_AR[r.doctype] ?? r.doctype : r.doctype}</ListRef> },
        { key: "states", label: t("States", "الحالات"), align: "end", render: (r) => <span data-no-i18n>{r.states}</span> },
        { key: "transitions", label: t("Transitions", "الانتقالات"), align: "end", render: (r) => <span data-no-i18n>{r.transitions}</span> },
        { key: "sod", label: t("Not by the document owner", "لا ينفذها مالك المستند"), align: "end", render: (r) => <span data-no-i18n>{r.sod}</span> },
      ]} />
      <p className="mt-2 text-xs text-muted-foreground">{t("Workflows are part of the app and export as DIGIT Workflow fixtures. Changing who approves what is an owner decision recorded as a policy, not a setting here.", "مسارات العمل جزء من التطبيق وتُصدّر كمسارات عمل DIGIT. تغيير من يعتمد ماذا قرار للمالك يُسجّل كسياسة وليس إعدادًا هنا.")}</p>
    </Section>
  );
}

function ReportsFamily() {
  const { t, ar } = useCx();
  const app = enabledPlugins().find((p) => p.name === APP);
  const views = list("Digit Saved View").length, layouts = list("Digit Dashboard Layout").length;
  return (
    <Section title={<span>{t("Reports", "التقارير")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({app?.reports?.length ?? 0})</span></span>} actions={<AppLink to="reports" className={BTN.secondary}>{t("Report centre", "مركز التقارير")}</AppLink>}>
      <p className="mb-2 text-sm">{t("Every report and dashboard figure is computed when it is opened, from the same records the documents show; there is no stored copy that can go stale.", "كل تقرير ورقم في اللوحات يُحسب عند فتحه من السجلات نفسها التي تعرضها المستندات؛ لا توجد نسخة مخزنة قد تتقادم.")}</p>
      <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">{(app?.reports ?? []).map((r) => <li key={r.name}><AppLink to={`reports/${encodeURIComponent(r.name)}`}>{reportTitle(r.name, ar)}</AppLink></li>)}</ul>
      <p className="mt-3 text-xs text-muted-foreground">{t(`Personal saved views: ${views} · dashboard layouts: ${layouts} (you see your own and the defaults that apply to you).`, `العروض الشخصية المحفوظة: ${views} · تخطيطات اللوحات: ${layouts} (ترى ما يخصك والافتراضيات التي تنطبق عليك).`)}</p>
    </Section>
  );
}

function PrintFamily() {
  const { t, ar } = useCx();
  const issued = list("Digit Print Artifact");
  type R = { name: string; doctype: string; version: string; n: number };
  const rows: R[] = PRINT_FORMATS.map((f) => ({ name: f.name, doctype: f.doc_type, version: templateVersion(f), n: issued.filter((a) => a["print_format"] === f.name).length }));
  return (
    <Section title={t("Print templates", "قوالب الطباعة")} actions={<AppLink to="outputs" className={BTN.secondary}>{t("Controlled print outputs", "المخرجات المطبوعة المضبوطة")}</AppLink>}>
      <DataTable<R & Record<string, unknown>> rows={rows as (R & Record<string, unknown>)[]} empty="" cols={[
        { key: "name", label: t("Template", "القالب"), render: (r) => <span>{templateLabel(r.name, ar)}</span> },
        { key: "doctype", label: t("Document", "المستند"), render: (r) => <span>{ar ? DOCTYPE_AR[r.doctype] ?? r.doctype : r.doctype}</span> },
        { key: "version", label: t("Version", "الإصدار"), render: (r) => <code className="text-[11px]" data-no-i18n data-print-version={r.name}>v{r.version}</code> },
        { key: "lang", label: t("Languages", "اللغات"), render: () => <span>{t("Bilingual (Arabic + English)", "ثنائي اللغة (عربي + إنجليزي)")}</span> },
        { key: "n", label: t("Issued copies", "النسخ المصدرة"), align: "end", render: (r) => <AppLink to={`outputs?doctype=${encodeURIComponent(r.doctype)}`}><span data-no-i18n>{r.n}</span></AppLink> },
      ]} />
      <p className="mt-2 text-xs text-muted-foreground">{t("The same templates export as DIGIT Print Formats and appear in each document's print menu. Signature blocks are left blank: who signs is an owner decision.", "تُصدّر القوالب نفسها كتنسيقات طباعة DIGIT وتظهر في قائمة الطباعة لكل مستند. خانات التوقيع تُترك فارغة: من يوقّع قرار للمالك.")}</p>
    </Section>
  );
}

function NotificationsFamily() {
  const { t, ar } = useCx();
  const app = enabledPlugins().find((p) => p.name === APP);
  const reinstall = () => { if (!app) return; const n = installDemo(app); notifySaved(n ? t(`${n} missing demo records restored`, `تمت استعادة ${n} سجل تجريبي ناقص`) : t("Demo data is complete — nothing inserted", "البيانات التجريبية مكتملة — لم يُدرج شيء")); };
  return (
    <>
      <Section title={t("Notifications", "التنبيهات")}>
        <DataTable rows={(app?.notifications ?? []).map((n) => ({ name: n.name, doctype: n.document_type, event: n.event, roles: n.recipients.map((r) => r.receiver_by_role ?? r.receiver_by_document_field ?? "").filter(Boolean) }))} empty={t("No notifications.", "لا توجد تنبيهات.")} cols={[
          { key: "name", label: t("Notification", "التنبيه"), render: (r) => <span>{ar ? NOTIF_AR[String(r["name"])] ?? String(r["name"]) : String(r["name"])}</span> },
          { key: "doctype", label: t("Document", "المستند"), render: (r) => <span>{ar ? DOCTYPE_AR[String(r["doctype"])] ?? String(r["doctype"]) : String(r["doctype"])}</span> },
          { key: "event", label: t("When", "متى"), render: (r) => <span>{r["event"] === "Submit" ? t("On submit", "عند الترحيل") : String(r["event"])}</span> },
          { key: "roles", label: t("Recipients", "المستلمون"), render: (r) => <span className="text-xs">{(r["roles"] as string[]).map((x) => (ar ? ROLE_AR[x] ?? x : x)).join("، ")}</span> },
        ] as Col<Record<string, unknown>>[]} />
      </Section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Section title={t("App", "التطبيق")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{t("Version", "الإصدار")}</dt><dd data-no-i18n>{app?.version ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("App DocTypes", "أنواع مستندات التطبيق")}</dt><dd data-no-i18n>{OWN.size}</dd>
            <dt className="text-muted-foreground">{t("Workflows", "مسارات العمل")}</dt><dd data-no-i18n>{app?.workflows?.length ?? 0}</dd>
            <dt className="text-muted-foreground">{t("Reports", "التقارير")}</dt><dd data-no-i18n>{app?.reports?.length ?? 0}</dd>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {hasRole() && (isFrappeHost()
              ? <p className="text-xs text-muted-foreground" data-demo-server-only>{t("Demo records on a DIGIT site are installed only by a System Manager with the opt-in server installer, on a disposable test site.", "تُثبَّت السجلات التجريبية على موقع DIGIT فقط بواسطة مدير النظام عبر المثبّت الاختياري على الخادم، وعلى موقع اختبار مؤقت.")}</p>
              : <button type="button" className={BTN.secondary} onClick={reinstall}>{t("Restore missing demo records", "استعادة السجلات التجريبية الناقصة")}</button>)}
            <AppLink to="integration" className={BTN.secondary}>{t("Integration map", "خريطة التكامل")}</AppLink>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{isFrappeHost()
            ? t("Who can open these screens is managed in DIGIT with the DIGIT Construction roles and User Permissions.", "يُدار من يمكنه فتح هذه الشاشات في DIGIT عبر أدوار ديجيت للمقاولات وصلاحيات المستخدمين.")
            : t("Disabling the app in Apps & Plugins hides it but never deletes records. Demo restore inserts only missing records.", "تعطيل التطبيق من صفحة التطبيقات يخفيه ولا يحذف أي سجلات. الاستعادة تُدرج الناقص فقط.")}</p>
        </Section>
        {isFrappeHost() ? (
          <Section title={t("Running on DIGIT", "التشغيل على DIGIT")}>
            <ul className="list-disc space-y-1 ps-5 text-sm" data-frappe-host-notes>
              <li>{t("Every save from these screens or the Desk is checked again by the app's server rules — the same rules these screens apply — and saved through the normal DIGIT document lifecycle.", "يُعاد فحص كل حفظ من هذه الشاشات أو من المكتب بقواعد التطبيق على الخادم — وهي القواعد نفسها التي تطبقها هذه الشاشات — ويُحفظ عبر دورة حياة المستند المعتادة في DIGIT.")}</li>
              <li>{t("Reports and indicators are computed in these screens from the records you may read on this site; DIGIT Script Report versions are not part of the package yet.", "تُحسب التقارير والمؤشرات في هذه الشاشات من السجلات التي يحق لك قراءتها على هذا الموقع؛ ولا تتضمن الحزمة بعدُ نسخًا منها كتقارير برمجية في DIGIT.")}</li>
              <li>{t("The app never writes accounting or stock ledger entries itself; DIGIT documents post them when they are submitted.", "لا يكتب التطبيق قيود المحاسبة أو المخزون بنفسه؛ تُرحّلها مستندات DIGIT عند اعتمادها.")}</li>
            </ul>
          </Section>
        ) : (
          <Section title={t("DIGIT export boundary", "حدود التصدير إلى DIGIT")}>
            <ul className="list-disc space-y-1 ps-5 text-sm">
              <li>{t("DocTypes, custom fields, workflows, roles, reports and print formats export as DIGIT JSON fixtures.", "تُصدَّر أنواع المستندات والحقول المخصصة ومسارات العمل والأدوار والتقارير وتنسيقات الطباعة كملفات DIGIT.")}</li>
              <li>{t("Controller rules (validate/on_submit) and Script Report execute() are virtual ports here and must be implemented in Python and tested on staging.", "قواعد المتحكمات وتنفيذ التقارير منقولة افتراضياً هنا ويجب تنفيذها بلغة بايثون واختبارها على بيئة تجريبية.")}</li>
              <li>{t("These React screens are not a DIGIT frontend build; they are listed as a candidate bundle only.", "هذه الشاشات ليست واجهة DIGIT مبنية؛ تُدرج كحزمة مرشحة فقط.")}</li>
            </ul>
          </Section>
        )}
      </div>
      <Section title={t("Documents of the app", "مستندات التطبيق")}>
        <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">{[...OWN].filter((d) => !app?.doctypes?.find((x) => x.name === d)?.istable).map((d) => <li key={d}><ListRef doctype={d} className="flex justify-between rounded px-2 py-1 hover:bg-muted"><span>{ar ? DOCTYPE_AR[d] ?? d : d.replace(/^Digit /, "")}</span><span className="text-xs text-muted-foreground" data-no-i18n>{list(d).length}</span></ListRef></li>)}</ul>
      </Section>
    </>
  );
}

export function PoliciesPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const pol = list("Digit Policy Decision").sort((a, b) => a.name.localeCompare(b.name));
  const canEdit = hasRole();
  const [edit, setEdit] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const queues = new Map(policyQueues().map((q) => [q.key, q]));
  const blocked = [...queues.values()].filter((q) => q.mode === "BLOCKED");
  const waiting = blocked.reduce((n, q) => n + q.items.length, 0);
  const sel = open ? queues.get(open) : undefined;
  return (
    <div className="w-full min-w-0" data-page="construction-policies">
      <PageHeader title={t("Policy decisions", "قرارات السياسات")} crumbs={[{ label: t("Construction settings", "إعدادات المقاولات"), to: "settings" }]}
        subtitle={t("Final actions that depend on owner policy stay blocked until the decision is recorded here. Drafts and calculations always remain available.", "الإجراءات النهائية المعتمدة على سياسة المالك تبقى موقوفة حتى يُسجل القرار هنا. المسودات والحسابات متاحة دائماً.")} />
      {!canEdit && <Note>{t("Only a System Manager can record policy decisions. You can read them.", "مدير النظام فقط يمكنه تسجيل قرارات السياسات. يمكنك قراءتها.")}</Note>}
      {pol.length > 0 && <Note tone={waiting ? "warn" : "info"}><span data-testid="policy-waiting-summary">{t(`${waiting} item(s) you can see wait on ${blocked.length} undefined polic${blocked.length === 1 ? "y" : "ies"}. Counts use the same conditions as the blocked actions; nothing is decided here.`,
        `العناصر المنتظرة مما يمكنك رؤيته: ${waiting} · السياسات غير المحددة: ${blocked.length}. تُحسب الأعداد بنفس شروط الإجراءات الموقوفة، ولا يُتخذ أي قرار هنا.`)}</span></Note>}
      <Section title={t("Owner decisions P1–P9", "قرارات المالك P1–P9")}>
        <DataTable rows={pol as Record<string, unknown>[]} empty={t("Policy records are missing — restore the demo records from Construction settings.", "سجلات السياسات ناقصة — استعدها من إعدادات المقاولات.")} cols={[
          { key: "name", label: t("Key", "الرمز"), render: (r) => <DocRef doctype="Digit Policy Decision" name={r["name"]} /> },
          { key: "title", label: t("Policy", "السياسة"), render: (r) => <span>{ar ? POLICY_TITLES[String(r["name"])]?.[1] : POLICY_TITLES[String(r["name"])]?.[0] ?? String(r["title"])}</span> },
          { key: "status", label: t("Status", "الحالة"), kind: "state" },
          { key: "waiting", label: t("Waiting now", "بالانتظار الآن"), render: (r) => <WaitingCell q={queues.get(String(r["name"]))} active={open === r["name"]} onOpen={() => setOpen(open === r["name"] ? null : String(r["name"]))} /> },
          { key: "affects", label: t("Blocks when undefined", "يوقف عند عدم التحديد"), render: (r) => <span className="text-xs">{ar ? POLICY_AFFECTS[String(r["name"])]?.[1] : POLICY_AFFECTS[String(r["name"])]?.[0]}</span> },
          { key: "value", label: t("Decision value", "قيمة القرار"), render: (r) => <span className="text-xs" data-no-i18n>{String(r["value"] ?? "") || "—"}</span> },
          { key: "authority", label: t("Authority", "جهة القرار"), render: (r) => <span className="text-xs" data-no-i18n>{String(r["authority"] ?? "") || "—"}</span> },
          { key: "act", label: "", render: (r) => canEdit ? <button type="button" className="text-sm text-primary hover:underline" onClick={() => setEdit(String(r["name"]))}>{t("Record decision", "تسجيل القرار")}</button> : null },
        ] as Col<Record<string, unknown>>[]} />
      </Section>
      {sel && <PolicyWorkList q={sel} onClose={() => setOpen(null)} />}
      {edit && <DecisionForm key={edit} name={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

const WHAT_AR: Record<string, string> = {
  "Approve final account": "اعتماد الحساب الختامي", "Approve retention release": "اعتماد الإفراج عن المحتجزات", "Pay subcontractor": "سداد مقاول الباطن",
  "Approve Not Applicable item": "اعتماد بند غير منطبق", "Accept matching variance": "قبول فرق المطابقة", "Approve estimate with expired rates": "اعتماد تقدير بأسعار منتهية",
  "Post site expense journal": "ترحيل قيد مصروف الموقع", "Approve subcontractor profile": "اعتماد ملف مقاول الباطن", "Create sales invoice": "إنشاء فاتورة المبيعات",
  "Quantity variance": "فرق كمية", "Price variance": "فرق سعر",
};
function WaitingCell({ q, active, onOpen }: { q: PolicyQueue | undefined; active: boolean; onOpen: () => void }) {
  const { t } = useCx();
  if (!q || q.mode === "CLEAR") return <span className="text-xs text-muted-foreground">{t("Nothing blocked", "لا شيء موقوف")}</span>;
  const n = q.items.length;
  const label = q.mode === "ILLUSTRATIVE" ? t(`${n} use the demo assumption`, `تستخدم افتراض العرض: ${n}`) : t(`${n} blocked`, `موقوف: ${n}`);
  if (!n) return <span className="text-xs text-muted-foreground">{q.mode === "ILLUSTRATIVE" ? label : t("0 blocked", "موقوف: 0")}</span>;
  return <button type="button" aria-expanded={active} data-testid={`policy-waiting-${q.key}`} className={`text-xs font-medium hover:underline ${q.mode === "BLOCKED" ? "text-destructive" : "text-primary"}`} onClick={onOpen}>{label}</button>;
}
function PolicyWorkList({ q, onClose }: { q: PolicyQueue; onClose: () => void }) {
  const { t, ar } = useCx();
  const title = ar ? POLICY_TITLES[q.key]?.[1] : POLICY_TITLES[q.key]?.[0];
  return (
    <Section title={<span><span data-no-i18n>{q.key}</span> — {title} · {q.mode === "ILLUSTRATIVE" ? t("work using the demo assumption", "أعمال تستخدم افتراض العرض") : t("work blocked now", "أعمال موقوفة الآن")}</span>}
      actions={<button type="button" className={BTN.secondary} onClick={onClose}>{t("Close", "إغلاق")}</button>}>
      {q.mode === "ILLUSTRATIVE" && <Note>{t("This value is a labelled demo assumption, not an owner decision. These actions run with it; record the owner's decision before real use.", "هذه القيمة افتراض عرض موسوم وليست قرار مالك. تعمل هذه الإجراءات به؛ سجّل قرار المالك قبل الاستخدام الفعلي.")}</Note>}
      <DataTable rows={q.items.map((i, k) => ({ ...i, key: `${i.doctype}:${i.name}:${i.row ?? ""}:${i.item ?? ""}:${k}` })) as unknown as Record<string, unknown>[]} empty={t("Nothing waits on this policy in the records you can see.", "لا شيء بانتظار هذه السياسة في السجلات التي يمكنك رؤيتها.")} cols={[
        { key: "what", label: t("Action", "الإجراء"), render: (r) => <span>{ar ? WHAT_AR[String(r["what"])] ?? String(r["what"]) : String(r["what"])}{r["detail"] ? <span className="text-muted-foreground"> · {ar ? WHAT_AR[String(r["detail"])] ?? String(r["detail"]) : String(r["detail"])}</span> : null}</span> },
        { key: "doctype", label: t("Document type", "نوع المستند"), render: (r) => <span className="text-xs">{ar ? DOCTYPE_AR[String(r["doctype"])] ?? String(r["doctype"]) : String(r["doctype"])}</span> },
        { key: "name", label: t("Document", "المستند"), render: (r) => <DocRef doctype={String(r["doctype"])} name={r["name"]} row={r["table"] ? `${String(r["table"])}:${String(r["row"])}` : undefined} /> },
        { key: "item", label: t("Item / row", "الصنف / السطر"), render: (r) => <span className="text-xs" data-no-i18n>{r["item"] ? String(r["item"]) : r["row"] ? `#${String(r["row"])}` : "—"}</span> },
        { key: "project", label: t("Project", "المشروع"), render: (r) => r["project"] ? <DocRef doctype="Project" name={r["project"]}>{projectTitle(adapter.get("Project", String(r["project"])), !ar)}</DocRef> : <span className="text-muted-foreground">—</span> },
      ] as Col<Record<string, unknown>>[]} />
    </Section>
  );
}

function DecisionForm({ name, onClose }: { name: string; onClose: () => void }) {
  const { t, ar } = useCx();
  const p = adapter.get("Digit Policy Decision", name)!;
  const [v, setV] = useState({ status: String(p["status"] ?? "Undefined"), authority: String(p["authority"] ?? ""), value: String(p["value"] ?? ""), decision: String(p["decision"] ?? ""), effective_date: String(p["effective_date"] ?? today()) });
  const [err, setErr] = useState("");
  const save = () => {
    if (v.status === "Defined" && (!v.authority.trim() || !v.decision.trim())) { setErr(t("A defined decision needs the decision authority and the decision text.", "القرار المحدد يتطلب جهة القرار ونص القرار.")); return; }
    try { adapter.update("Digit Policy Decision", name, { ...v, modified_by: currentUser() }); notifySaved(t(`Policy ${name} saved`, `تم حفظ السياسة ${name}`)); onClose(); }
    catch (e) { setErr(e instanceof DocValidationError ? e.errors.join("\n") : (e as Error).message); }
  };
  return (
    <Section title={<span>{t("Record decision", "تسجيل القرار")} · <span data-no-i18n>{name}</span> — {ar ? POLICY_TITLES[name]?.[1] : POLICY_TITLES[name]?.[0]}</span>} actions={<StateBadge state={p["status"]} />}>
      {err && <Note tone="bad"><span data-no-i18n>{err}</span></Note>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        <Field label={t("Status", "الحالة")}><select className={inputCls} value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>{["Undefined", "Draft", "Defined"].map((s) => <option key={s} value={s}>{ar ? ({ Undefined: "غير محدد", Draft: "مسودة", Defined: "محدد" } as Record<string, string>)[s] : s}</option>)}</select></Field>
        <Field label={t("Effective date", "تاريخ السريان")}><DateInput className={inputCls} value={v.effective_date} onChange={(e) => setV({ ...v, effective_date: e.target.value })} /></Field>
        <Field label={t("Decision authority", "جهة القرار")}><input className={inputCls} value={v.authority} onChange={(e) => setV({ ...v, authority: e.target.value })} /></Field>
        <Field label={t("Decision value (account, tolerance, role…)", "قيمة القرار (حساب، حد تفاوت، دور…)")}><input className={inputCls} value={v.value} onChange={(e) => setV({ ...v, value: e.target.value })} /></Field>
        <div className="md:col-span-2"><Field label={t("Decision", "القرار")}><textarea className={`${inputCls} min-h-24`} value={v.decision} onChange={(e) => setV({ ...v, decision: e.target.value })} /></Field></div>
      </div>
      <div className="mt-3 flex gap-2"><button type="button" className={BTN.primary} onClick={save}>{t("Save", "حفظ")}</button><button type="button" className={BTN.secondary} onClick={onClose}>{t("Cancel", "إلغاء")}</button></div>
    </Section>
  );
}
