import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Configuration & governance pages (N74, N75, N78, N79, N81, N85, N88), the staff-only customer portal preview
 * (P01–P08, scoped by FSM Portal Grant), the honest server-required pages (N71, N83; N57 is the offline queue since F4) (group workspaces live in workspace.tsx). Configuration reads and
 * edits the canonical records (FSM Settings single, templates, technicians); nothing here stores a second copy.
 */
import type { ReactNode } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { isEnabled } from "@/plugins/runtime";
import { activeWorkflow } from "@/lib/workflow";
import { adapter } from "@/lib/adapter";
import { APP, by, canRead, list, rows } from "../domain/data";
import { OPEN_DEFICIENCY, s, today } from "../domain/rules";
import { FSM_CUSTOM_FIELDS, FSM_DOCTYPES, DOCTYPE_AR, SKILLS, SYSTEM_TYPES } from "../schema";
import { FSM_SCREENS, screenById } from "../screens";
import { FSM_REPORTS } from "../domain/reports";
import { FSM_KPIS } from "../analytics/kpis";
import { AppLink, BAND, DataTable, DocRef, DxState, Facts, INPUT, ListRef, PageHeader, Panel, StateChip, dateTxt, dtTxt, money, numTxt, opt, useFx, useUrlState } from "./kit";
import { portalCustomers, portalView } from "../domain/portal";
import { FieldOfflinePage } from "./fieldOffline";
import { nm } from "./dayBoard";
const nmc = (c: string, ar: boolean) => nm("Customer", c, ar);
import { PageInsights } from "./ov/ded";

const SETTINGS = () => adapter.get("FSM Settings", "FSM Settings") ?? {};
const setv = (k: string, d: unknown) => { const v = (SETTINGS() as Record<string, unknown>)[k]; return v === undefined || v === null || v === "" ? d : v; };

function ConfigShell({ id, title, question, basis, children, actions }: { id: string; title: string; question: string; basis: string; children: ReactNode; actions?: ReactNode }) {
  const { t } = useFx(); const sc = screenById(id);
  return (
    <div className="w-full min-w-0" data-page={`fsm-config-${id}`}>
      <PageHeader title={title} band={{ question, basis, meta: sc ? [{ label: t("Screen", "الشاشة"), value: <span data-no-i18n>{sc.id}</span> }] : [], actions: <>{actions}<DocRef doctype="FSM Settings" name="FSM Settings" form className={BAND.secondary}>{t("FSM settings", "إعدادات الخدمة الميدانية")}</DocRef></> }} />
      {children}
    </div>
  );
}

function TradePacks() {
  const { t, ar } = useFx();
  const tpls = list("FSM Inspection Template"); const sys = list("FSM Service System");
  const types = SYSTEM_TYPES.map((x) => { const act = tpls.filter((p) => s(p["system_type"]) === x && s(p["status"]) === "Active"); return { name: x, active: act.map((p) => p.name).join(", "), version: act.map((p) => s(p["version"])).join(", "), checks: act.reduce((n, p) => n + rows(p, "checks").length, 0), systems: sys.filter((y) => s(y["system_type"]) === x).length, techs: list("FSM Technician").filter((y) => rows(y, "skills").some((k) => s(k["skill"]) === x)).length }; });
  return (
    <ConfigShell id="N74" title={t("Trade packs", "حزم التخصص")} question={t("Which trades are configured, and is each system type ready to inspect?", "ما التخصصات المهيأة، وهل كل نوع نظام جاهز للفحص؟")} basis={t("Fire & Life Safety is the first configured pack. A system type is ready when it has an active template version and qualified technicians. Standards and intervals need an approved jurisdiction and edition (N78).", "السلامة من الحريق هي أول حزمة مهيأة. نوع النظام جاهز عندما يكون له إصدار قالب نشط وفنيون مؤهلون. المعايير والفترات تتطلب جهة واختصاصاً وإصداراً معتمداً (N78).")}>
      <PageInsights k="trade-packs" blocks={[
        { id: "packs", title: ["Fire & Life Safety — system types", "السلامة من الحريق — أنواع الأنظمة"], node: (
      <Panel title={t("Fire & Life Safety — system types", "السلامة من الحريق — أنواع الأنظمة")}>
        <DataTable id="cfg-packs" rows={types} searchable={false} empty="—" cols={[{ key: "name", label: t("System type", "نوع النظام"), render: (r) => <span>{opt(r.name, ar)}</span> }, { key: "active", label: t("Active template", "القالب النشط"), render: (r) => (r["active"] ? <span data-no-i18n>{s(r["active"])} (v{s(r["version"])})</span> : <span className="text-dx-warn">{t("None", "لا يوجد")}</span>) },
          { key: "checks", label: t("Checks", "البنود"), numeric: true }, { key: "systems", label: t("Systems", "الأنظمة"), numeric: true }, { key: "techs", label: t("Qualified technicians", "فنيون مؤهلون"), numeric: true },
          { key: "ready", label: t("Ready", "جاهز"), render: (r) => <StateChip value={r["active"] && Number(r["techs"]) > 0 ? "Active" : r["systems"] ? "Incomplete" : "Draft"} /> }]} />
      </Panel>
        ) },
        { id: "other", title: ["Other trade packs", "حزم تخصص أخرى"], node: (
      <Panel title={t("Other trade packs", "حزم تخصص أخرى")}><p className="text-sm text-muted-foreground">{t("Elevators, HVAC maintenance and security systems are not configured in this remix. Adding a pack means adding system types, templates and skills — no code change.", "المصاعد وصيانة التكييف وأنظمة الأمن غير مهيأة في هذا الإصدار. إضافة حزمة تعني إضافة أنواع أنظمة وقوالب ومهارات — دون تغيير برمجي.")}</p></Panel>
        ) },
      ]} />
    </ConfigShell>
  );
}

function Taxonomies() {
  const { t, ar } = useFx();
  const devs = list("FSM Device"); const sys = list("FSM Service System");
  const types = [...new Set(devs.map((d) => s(d["device_type"])).filter(Boolean))].map((x) => ({ name: x, count: devs.filter((d) => s(d["device_type"]) === x).length, active: devs.filter((d) => s(d["device_type"]) === x && s(d["lifecycle"]) === "Active").length }));
  return (
    <ConfigShell id="N75" title={t("Asset & system taxonomies", "تصنيفات الأصول والأنظمة")} question={t("How are systems and devices classified, and how many of each do we maintain?", "كيف تُصنّف الأنظمة والأجهزة، وكم نصون من كل منها؟")} basis={t("System types are the controlled list of the trade pack; device types come from the device register. Customer-owned equipment is never a company fixed asset.", "أنواع الأنظمة قائمة مضبوطة لحزمة التخصص؛ أنواع الأجهزة من سجل الأجهزة. معدات العميل ليست أصلاً ثابتاً للشركة.")}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 lg:grid-cols-2">
        <Panel title={t("System types", "أنواع الأنظمة")}><DataTable id="cfg-systypes" rows={SYSTEM_TYPES.map((x) => ({ name: x, count: sys.filter((y) => s(y["system_type"]) === x).length, impaired: sys.filter((y) => s(y["system_type"]) === x && s(y["operating_status"]) !== "In Service").length }))} searchable={false} empty="—"
          cols={[{ key: "name", label: t("Type", "النوع"), render: (r) => <ListRef doctype="FSM Service System" filters={[["system_type", "=", r.name]]}>{opt(r.name, ar)}</ListRef> }, { key: "count", label: t("Systems", "الأنظمة"), numeric: true }, { key: "impaired", label: t("Not in service", "خارج الخدمة"), numeric: true }]} /></Panel>
        <Panel title={t("Device types", "أنواع الأجهزة")}><DataTable id="cfg-devtypes" rows={types} searchable={false} empty={t("No devices registered yet.", "لا أجهزة مسجلة بعد.")} cols={[{ key: "name", label: t("Type", "النوع"), render: (r) => <ListRef doctype="FSM Device" filters={[["device_type", "=", r.name]]}><span data-no-i18n>{r.name}</span></ListRef> }, { key: "count", label: t("Devices", "الأجهزة"), numeric: true }, { key: "active", label: t("Active", "نشط"), numeric: true }]} /></Panel>
      </div>
      <Panel title={t("Skills", "المهارات")}><p className="text-sm" data-no-i18n={!ar || undefined}>{SKILLS.map((x) => opt(x, ar)).join(" · ")}</p></Panel>
    </ConfigShell>
  );
}

function Standards() {
  const { t, ar } = useFx();
  const tpls = list("FSM Inspection Template");
  return (
    <ConfigShell id="N78" title={t("Standards references & applicability", "المراجع القياسية والانطباق")} question={t("Which standard does each template cite, and is that reference approved?", "ما المعيار الذي يستند إليه كل قالب، وهل المرجع معتمد؟")} basis={t("A template's standard reference is a citation entered by the configurer, not a compliance claim. Jurisdiction, edition and intervals require owner/authority approval before customer-facing use.", "المرجع القياسي للقالب استشهاد يدخله المهيئ وليس ادعاء امتثال. الجهة والإصدار والفترات تتطلب اعتماد المالك/الجهة قبل الاستخدام أمام العملاء.")}>
      <Panel title={t("Templates and their references", "القوالب ومراجعها")}>
        <DataTable id="cfg-standards" rows={tpls} searchable={false} empty="—" cols={[{ key: "name", label: t("Template", "القالب"), render: (r) => <DocRef doctype="FSM Inspection Template" name={r.name} title form /> }, { key: "system_type", label: t("System type", "نوع النظام"), render: (r) => <span>{opt(r["system_type"], ar)}</span> }, { key: "version", label: t("Version", "الإصدار"), numeric: true },
          { key: "status", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["status"]} /> }, { key: "standard_ref", label: t("Reference cited", "المرجع المذكور"), render: (r) => <span data-no-i18n>{s(r["standard_ref"]) || "—"}</span> },
          { key: "approval", label: t("Approval", "الاعتماد"), render: () => <span className="text-xs text-dx-warn">{t("Owner approval of jurisdiction & edition pending", "اعتماد المالك للجهة والإصدار معلّق")}</span> }]} />
      </Panel>
    </ConfigShell>
  );
}

function Policies() {
  const { t, ar } = useFx();
  const defs = list("FSM Deficiency"); const open = defs.filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"])));
  return (
    <ConfigShell id="N79" title={t("Severity, escalation & closure policies", "سياسات الخطورة والتصعيد والإغلاق")} question={t("How are findings classified, escalated and closed?", "كيف تُصنّف الملاحظات وتُصعّد وتُغلق؟")} basis={t("These rules are enforced by the FSM controller hooks and workflow — the same rules apply in app pages and native forms.", "تُطبَّق هذه القواعد عبر خطافات التحكم وسير العمل — القواعد نفسها في صفحات التطبيق والنماذج الأصلية.")}>
      <PageInsights k="policies" blocks={[
        { id: "settings", title: ["Settings in force", "الإعدادات السارية"], node: (
      <Panel title={t("Settings in force", "الإعدادات السارية")}>
        <Facts items={[[t("Default finding severity", "خطورة الملاحظة الافتراضية"), opt(setv("default_severity", "Major"), ar)], [t("Retest due (days after repair)", "استحقاق إعادة الفحص (أيام بعد الإصلاح)"), <span data-no-i18n>{s(setv("retest_due_days", 14))}</span>], [t("Technical review before publishing", "المراجعة الفنية قبل النشر"), Number(setv("require_review", 1)) ? t("Required", "مطلوبة") : t("Not required", "غير مطلوبة")], [t("Obligation generation horizon", "أفق توليد الالتزامات"), <span data-no-i18n>{s(setv("generation_horizon_months", 12))} {t("months", "أشهر")}</span>]]} />
      </Panel>
        ) },
        { id: "rules", title: ["Enforced rules", "القواعد المطبّقة"], node: (
      <Panel title={t("Enforced rules", "القواعد المطبّقة")}>
        <ul className="list-disc space-y-1.5 ps-5 text-sm">
          <li>{t("A run cannot be submitted while any check is Untested; Inaccessible is recorded as access, never as Not Applicable.", "لا يُقدَّم التشغيل وفيه بند لم يُفحص؛ تعذر الوصول يُسجل كوصول وليس «لا ينطبق».")}</li>
          <li>{t("Every failed check raises exactly one finding (run × check × device); repeated raising never duplicates.", "كل بند راسب ينشئ ملاحظة واحدة فقط (تشغيل × بند × جهاز)؛ التكرار لا ينشئ نسخاً.")}</li>
          <li>{t("Customer acceptance, repair completion or payment never closes a finding — only a reviewed, passing retest of the original check.", "قبول العميل أو إكمال الإصلاح أو السداد لا يغلق الملاحظة — فقط إعادة فحص ناجحة ومراجَعة للبند الأصلي.")}</li>
          <li>{t("Waiving an obligation, cancelling a job or returning a run requires a reason; obligations are never deleted.", "الإعفاء من التزام أو إلغاء أمر عمل أو إعادة تشغيل يتطلب سبباً؛ الالتزامات لا تُحذف.")}</li>
          <li>{t("Critical findings notify FSM Managers (native Notification); an active impairment keeps the system out of In Service.", "الملاحظات الحرجة تُشعر مديري الخدمة (إشعار أصلي)؛ التعطّل القائم يبقي النظام خارج «في الخدمة».")}</li>
        </ul>
      </Panel>
        ) },
        { id: "severity", title: ["Open findings by severity", "الملاحظات المفتوحة حسب الخطورة"], node: (
      <Panel title={t("Open findings by severity", "الملاحظات المفتوحة حسب الخطورة")}>
        <DataTable id="cfg-sev" rows={["Critical", "Major", "Minor"].map((x) => ({ name: x, open: open.filter((d) => s(d["severity"]) === x).length, all: defs.filter((d) => s(d["severity"]) === x).length }))} searchable={false} empty="—" cols={[{ key: "name", label: t("Severity", "الخطورة"), render: (r) => <StateChip value={r.name} /> }, { key: "open", label: t("Open", "مفتوحة"), numeric: true, render: (r) => <AppLink to={`reports/RP05?severity=${r.name}`}><span data-no-i18n>{s(r["open"])}</span></AppLink> }, { key: "all", label: t("All", "الكل"), numeric: true }]} />
      </Panel>
        ) },
      ]} />
    </ConfigShell>
  );
}

function Eligibility() {
  const { t, ar } = useFx();
  const techs = list("FSM Technician");
  const skills = SKILLS.filter((k) => techs.some((x) => rows(x, "skills").some((r) => s(r["skill"]) === k)));
  return (
    <ConfigShell id="N81" title={t("Dispatch eligibility policies", "سياسات أهلية الجدولة")} question={t("Who may be sent to which system type today?", "من يمكن إرساله إلى أي نوع نظام اليوم؟")} basis={t("A technician is eligible when active, holding the skill of the system type, with a certificate valid on the booking date. Overlapping bookings and approved unavailability are refused at booking.", "الفني مؤهل عندما يكون نشطاً ويملك مهارة نوع النظام بشهادة سارية في تاريخ الحجز. الحجوزات المتداخلة وعدم التوفر المعتمد تُرفض عند الحجز.")}>
      <Panel title={t("Policy", "السياسة")}><Facts items={[[t("Block expired certification", "منع الشهادات المنتهية"), Number(setv("block_expired_certification", 1)) ? t("On — expired certificates block booking", "مفعّل — الشهادة المنتهية تمنع الحجز") : t("Off — warning only", "معطّل — تحذير فقط")], [t("Active technicians", "الفنيون النشطون"), <span data-no-i18n>{techs.filter((x) => s(x["status"]) !== "Inactive").length}</span>]]} /></Panel>
      <Panel title={t("Skill matrix (valid today)", "مصفوفة المهارات (سارية اليوم)")}>
        <DataTable id="cfg-matrix" rows={techs} searchable={false} empty={t("No technicians.", "لا فنيين.")} cols={[{ key: "technician_name", label: t("Technician", "الفني"), render: (r) => <DocRef doctype="FSM Technician" name={r.name} title form /> },
          ...skills.map((k) => ({ key: k, label: opt(k, ar), render: (r: Record<string, unknown>) => { const row = rows(r, "skills").find((x) => s(x["skill"]) === k); if (!row) return <span className="text-muted-foreground">—</span>; const v = s(row["valid_until"]); return <StateChip value={!v || v >= today() ? "Active" : "Expired"} />; } }))]} />
      </Panel>
    </ConfigShell>
  );
}

function Mappings() {
  const { t, ar } = useFx();
  const owned = FSM_DOCTYPES.filter((d) => !d.istable);
  return (
    <ConfigShell id="N85" title={t("Core field & document mappings", "ربط حقول ومستندات النواة")} question={t("Which native documents does FSM reuse, which fields does it add, and which objects does it own?", "ما المستندات الأصلية التي تعيد الخدمة الميدانية استخدامها، وما الحقول المضافة، وما الكائنات المملوكة؟")} basis={t("Decision order: reuse native → configure → additive custom field → app DocType. Native masters (Customer, Contact, Item, Employee, Supplier) are linked, never copied; finance and stock stay native.", "ترتيب القرار: إعادة الاستخدام الأصلي ← التهيئة ← حقل مخصص إضافي ← نوع مستند للتطبيق. السجلات الرئيسية الأصلية مرتبطة ولا تُنسخ؛ المالية والمخزون تبقى أصلية.")}>
      <Panel title={t("Additive custom fields on native documents", "حقول مخصصة إضافية على المستندات الأصلية")}>
        <DataTable id="cfg-cf" rows={FSM_CUSTOM_FIELDS.map((c, i) => ({ ...c, name: `${c.dt}-${c.fieldname}-${i}` }) as unknown as Record<string, unknown> & { name: string })} searchable={false} empty="—" cols={[{ key: "dt", label: t("Native DocType", "نوع المستند الأصلي"), render: (r) => <ListRef doctype={s(r["dt"])}><span data-no-i18n>{s(r["dt"])}</span></ListRef> }, { key: "fieldname", label: t("Field", "الحقل") }, { key: "label", label: t("Label", "التسمية") }, { key: "fieldtype", label: t("Type", "النوع") }, { key: "options", label: t("Links to", "يرتبط بـ") }]} />
      </Panel>
      <Panel title={t("App-owned DocTypes", "أنواع المستندات المملوكة للتطبيق")}>
        <DataTable id="cfg-owned" rows={owned.map((d) => ({ name: d.name, ar: DOCTYPE_AR[d.name] ?? "", count: canRead(d.name) ? list(d.name).length : -1, wf: activeWorkflow(d.name) ? 1 : 0, single: d.issingle ? 1 : 0 }))} searchable={false} empty="—" cols={[{ key: "name", label: t("DocType", "نوع المستند"), render: (r) => (r["single"] ? <DocRef doctype={r.name} name={r.name} form>{ar ? s(r["ar"]) || r.name : r.name}</DocRef> : <ListRef doctype={r.name}>{ar ? s(r["ar"]) || r.name : r.name}</ListRef>) }, { key: "count", label: t("Records you can read", "سجلات يمكنك قراءتها"), numeric: true, render: (r) => <span data-no-i18n>{Number(r["count"]) < 0 ? t("Restricted", "مقيّد") : s(r["count"])}</span> }, { key: "wf", label: t("Workflow", "سير العمل"), render: (r) => <span>{r["wf"] ? t("Active", "نشط") : "—"}</span> }]} />
      </Panel>
    </ConfigShell>
  );
}

function Health() {
  const { t, ar } = useFx();
  const exc = list("FSM Integration Exception"); const open = exc.filter((e) => s(e["status"]) !== "Resolved");
  const bySrc = by(open, "source");
  const kinds = FSM_SCREENS.reduce<Record<string, number>>((m, x) => { m[x.kind] = (m[x.kind] ?? 0) + 1; return m; }, {});
  return (
    <ConfigShell id="N88" title={t("Adapter & integration health", "صحة المحول والتكامل")} question={t("Is the app running correctly here, and what still needs the DIGIT server?", "هل يعمل التطبيق بشكل صحيح هنا، وما الذي ما زال يتطلب خادم DIGIT؟")} basis={t("Virtual Core status of the app: enabled state, open integration exceptions, workflows, screen classification and server-required capabilities. Nothing here claims staging or production readiness.", "حالة التطبيق في النواة الافتراضية: التفعيل، استثناءات التكامل المفتوحة، سير العمل، تصنيف الشاشات والقدرات التي تتطلب الخادم. لا شيء هنا يدّعي جاهزية بيئة الاختبار أو الإنتاج.")}>
      <Panel title={t("Status", "الحالة")}>
        <Facts items={[[t("App enabled", "التطبيق مفعّل"), isEnabled(APP) ? t("Yes", "نعم") : t("No", "لا")], [t("Execution", "التنفيذ"), t("Virtual (browser adapter); DIGIT server not installed", "افتراضي (محول المتصفح)؛ خادم DIGIT غير مثبت")], [t("Open integration exceptions", "استثناءات تكامل مفتوحة"), <span data-no-i18n>{open.length}</span>], [t("Active workflows", "سير عمل نشط"), <span data-no-i18n>{FSM_DOCTYPES.filter((d) => activeWorkflow(d.name)).length}</span>],
          [t("Screens", "الشاشات"), <span data-no-i18n>{Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · ")}</span>], [t("Reports / KPIs", "التقارير / المؤشرات"), <span data-no-i18n>{FSM_REPORTS.length} / {FSM_KPIS.length} ({FSM_KPIS.filter((k) => k.status === "SERVER_REQUIRED").length} SERVER_REQUIRED)</span>]]} />
      </Panel>
      <Panel title={t("Open exceptions by source", "الاستثناءات المفتوحة حسب المصدر")} actions={<AppLink to="queue/exceptions">{t("Open queue", "فتح الطابور")}</AppLink>}>
        <DataTable id="cfg-exc" rows={[...bySrc.entries()].map(([k, v]) => ({ name: k, count: v.length, last: v.map((e) => s(e["last_attempt"])).sort().pop() ?? "" }))} searchable={false} empty={t("No open exceptions.", "لا استثناءات مفتوحة.")} cols={[{ key: "name", label: t("Source", "المصدر"), render: (r) => <span>{opt(r.name, ar)}</span> }, { key: "count", label: t("Open", "مفتوحة"), numeric: true }, { key: "last", label: t("Last attempt", "آخر محاولة"), render: (r) => <span data-no-i18n>{dtTxt(r["last"])}</span> }]} />
      </Panel>
      <Panel title={t("Server-required capabilities", "قدرات تتطلب الخادم")}>
        <DataTable id="cfg-server" rows={[...FSM_SCREENS.filter((x) => x.kind === "DEFERRED_SERVER_EXPLICIT").map((x) => ({ name: x.id, label: ar ? x.label_ar : x.label, note: x.note ?? "" })), { name: "W10", label: t("Sales Invoice hand-off", "تسليم فاتورة المبيعات"), note: "digit_fsm.api.handoff_charge" }, { name: "RP", label: t("Script Report execution", "تنفيذ تقارير السكربت"), note: "digit_fsm/report/* — NotImplementedError until ported" }]} searchable={false} empty="—"
          cols={[{ key: "name", label: "ID" }, { key: "label", label: t("Capability", "القدرة"), render: (r) => <span>{s(r["label"])}</span> }, { key: "note", label: t("Why", "السبب") }]} />
      </Panel>
    </ConfigShell>
  );
}

export function ConfigPage({ params }: PluginPageProps) {
  const { t } = useFx(); const k = String(params["key"] ?? "");
  switch (k) {
    case "trade-packs": return <TradePacks />;
    case "taxonomies": return <Taxonomies />;
    case "standards": return <Standards />;
    case "policies": return <Policies />;
    case "eligibility": return <Eligibility />;
    case "mappings": return <Mappings />;
    case "health": return <Health />;
    default: return <DxState kind="empty" title={t("Unknown configuration page", "صفحة تهيئة غير معروفة")} action={<AppLink to="modules/set">{t("Configuration directory", "دليل التهيئة")}</AppLink>} />;
  }
}

// ---------------------------------------------------------------- customer portal preview (staff only)
const PORTAL: Record<string, { id: string }> = { p01: { id: "P01" }, p02: { id: "P02" }, p03: { id: "P03" }, p04: { id: "P04" }, p05: { id: "P05" }, p06: { id: "P06" }, p07: { id: "P07" }, p08: { id: "P08" } };
export function PortalPage({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx; const [q, set] = useUrlState();
  const k = String(params["key"] ?? "").toLowerCase(); const sc = PORTAL[k] ? screenById(PORTAL[k]!.id) : undefined;
  // F4-06: the customer sees only the sites of its active portal grants (domain/portal.ts); reports, findings and requests
  // follow the per-site grant switches, so the preview never shows more than the customer would be given.
  const custs = portalCustomers(); const cust = q["c"] && custs.includes(q["c"]) ? q["c"] : custs[0];
  const pv = cust ? portalView(cust) : undefined; const scope = pv?.scope;
  const mySites = scope?.sites ?? []; const ids = new Set(mySites.map((x) => x.name)); const sites = mySites;
  const repIds = scope?.reports ?? new Set<string>(); const findIds = scope?.findings ?? new Set<string>(); const reqIds = scope?.requests ?? new Set<string>();
  if (!sc) return <DxState kind="empty" title={t("Unknown portal page", "صفحة بوابة غير معروفة")} />;
  const body = () => {
    switch (k) {
      case "p01": return <Facts items={[[t("Sites", "المواقع"), <span data-no-i18n>{mySites.length}</span>], [t("Active agreements", "الاتفاقيات النشطة"), <span data-no-i18n>{list("FSM Service Agreement").filter((a) => ids.has(s(a["site"])) && s(a["workflow_state"]) === "Active").length}</span>], [t("Open findings", "الملاحظات المفتوحة"), <span data-no-i18n>{list("FSM Deficiency").filter((d) => findIds.has(s(d["site"])) && OPEN_DEFICIENCY.has(s(d["workflow_state"]))).length}</span>], [t("Upcoming visits", "الزيارات القادمة"), <span data-no-i18n>{list(VISIT_DT).filter((v) => ids.has(s(v["site"])) && ["Planned", "Dispatched"].includes(s(v["workflow_state"]))).length}</span>]]} />;
      case "p02": return <DataTable id="portal-sites" rows={mySites} searchable={false} empty="—" cols={[{ key: "site_name", label: t("Site", "الموقع") }, { key: "city", label: t("City", "المدينة") }, { key: "status", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["status"]} /> }]} />;
      case "p03": return <DataTable id="portal-visits" rows={list(VISIT_DT).filter((v) => ids.has(s(v["site"])) && ["Planned", "Dispatched"].includes(s(v["workflow_state"])))} searchable={false} empty={t("No upcoming visits.", "لا زيارات قادمة.")} cols={[{ key: "site", label: t("Site", "الموقع"), render: (r) => <span data-no-i18n>{s(sites.find((x) => x.name === s(r["site"]))?.["site_name"])}</span> }, { key: "scheduled_start", label: t("When", "الموعد"), render: (r) => <span data-no-i18n>{dtTxt(r["scheduled_start"])}</span> }, { key: "visit_purpose", label: t("Purpose", "الغرض"), render: (r) => <span>{opt(r["visit_purpose"], ar)}</span> }]} />;
      case "p04": return <DataTable id="portal-reports" rows={pv?.reports ?? []} searchable={false} empty={t("No published reports — only Published, current revisions are ever shown to customers.", "لا تقارير منشورة — تُعرض للعملاء فقط الإصدارات المنشورة الحالية.")} cols={[{ key: "name", label: t("Report", "التقرير") }, { key: "technical_result", label: t("Result", "النتيجة"), render: (r) => <StateChip value={r["technical_result"]} /> }, { key: "published_on", label: t("Published", "النشر"), render: (r) => <span data-no-i18n>{dtTxt(r["published_on"])}</span> }]} />;
      case "p05": return <DataTable id="portal-findings" rows={pv?.findings ?? []} searchable={false} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} cols={[{ key: "title", label: t("Finding", "الملاحظة") }, { key: "severity", label: t("Severity", "الخطورة"), render: (r) => <StateChip value={r["severity"]} /> }, { key: "workflow_state", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["workflow_state"]} /> }]} />;
      case "p06": return <DataTable id="portal-quotes" rows={list("FSM Deficiency").filter((d) => findIds.has(s(d["site"])) && s(d["workflow_state"]) === "Quoted")} searchable={false} empty={t("No quotes waiting for a decision.", "لا عروض بانتظار القرار.")} cols={[{ key: "title", label: t("Finding", "الملاحظة") }, { key: "quotation", label: t("Quotation", "عرض السعر") }, { key: "commercial_decision", label: t("Decision", "القرار"), render: (r) => <StateChip value={r["commercial_decision"]} /> }]} />;
      case "p07": return <DataTable id="portal-requests" rows={list("Issue").filter((i) => reqIds.has(s(i["digit_fsm_site"])))} searchable={false} empty={t("No requests.", "لا طلبات.")} cols={[{ key: "subject", label: t("Request", "الطلب") }, { key: "opening_date", label: t("Opened", "الفتح"), render: (r) => <span data-no-i18n>{dateTxt(r["opening_date"])}</span> }, { key: "status", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["status"]} /> }]} />;
      default: return <DataTable id="portal-history" rows={list("FSM Charge Proposal").filter((c) => ids.has(s(c["site"])))} searchable={false} empty={t("No financial references.", "لا مراجع مالية.")} cols={[{ key: "job", label: t("Job", "أمر العمل") }, { key: "coverage_decision", label: t("Coverage", "التغطية"), render: (r) => <span>{opt(r["coverage_decision"], ar)}</span> }, { key: "amount", label: t("Amount", "المبلغ"), numeric: true, render: (r) => <span data-no-i18n>{money(r["amount"])}</span> }, { key: "status", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["status"]} /> }]} />;
    }
  };
  return (
    <div className="w-full min-w-0" data-page="fsm-portal" data-portal={sc.id}>
      <PageHeader title={ar ? sc.label_ar : sc.label} crumbs={[{ label: t("Customer portal", "بوابة العميل"), to: `portal${cust ? `?c=${encodeURIComponent(cust)}` : ""}` }]} band={{ question: t("What would this customer see? (staff preview)", "ماذا سيرى هذا العميل؟ (معاينة للموظفين)"),
        basis: t("Only the sites of the customer's active portal grants; per site the grant decides reports, findings and requests. Only published, current report revisions are shown.", "مواقع منح البوابة النشطة للعميل فقط؛ لكل موقع تحدد المنحة التقارير والملاحظات والطلبات. لا تُعرض إلا الإصدارات المنشورة الحالية من التقارير."),
        meta: [{ label: t("Previewing customer", "العميل المعاين"), value: <span data-no-i18n>{cust ? nmc(cust, ar) : "—"}</span> }, { label: t("Sites in scope", "المواقع ضمن النطاق"), value: <span data-no-i18n>{mySites.length}</span> }, { label: t("Screen", "الشاشة"), value: <span data-no-i18n>{sc.id}</span> }],
        controls: custs.length > 1 ? <select className={`${INPUT} min-h-10`} value={cust} onChange={(e) => set({ c: e.target.value })} aria-label={t("Customer", "العميل")} data-portal-pick>{custs.map((c) => <option key={c} value={c}>{nmc(c, ar)}</option>)}</select> : undefined }} />
      {scope && scope.revoked.length > 0 && <p className="mb-3 text-sm" data-portal-revoked>{t("Not visible (grant revoked):", "غير ظاهر (منحة ملغاة):")} {scope.revoked.map((g) => <span key={g.name} className="ms-1 font-bold" data-no-i18n>{s(adapter.get("FSM Service Site", s(g["site"]))?.["site_name"]) || s(g["site"])}</span>)}</p>}
      <Panel title={ar ? sc.label_ar : sc.label}>{cust ? body() : <DxState kind="empty" title={t("No customer has portal access yet.", "لا عميل لديه وصول للبوابة بعد.")} />}</Panel>
    </div>
  );
}

// ---------------------------------------------------------------- server-required pages
const DEFERRED: Record<string, { id: string; needs: [string, string][] }> = {
  offline: { id: "N57", needs: [["Durable on-device drafts and files", "مسودات وملفات دائمة على الجهاز"], ["Operation IDs with server idempotency", "معرّفات عمليات مع عدم تكرار على الخادم"], ["Upload acknowledgement and replay", "إقرار الرفع وإعادة التشغيل"], ["Conflict detection and recovery UI", "كشف التعارض وواجهة الاسترداد"]] },
  notifications: { id: "N71", needs: [["Configured SMS / WhatsApp / e-mail provider", "مزود رسائل / واتساب / بريد مهيأ"], ["Delivery receipts stored per message", "إيصالات تسليم لكل رسالة"], ["Retry policy on the server", "سياسة إعادة المحاولة على الخادم"]] },
  "portal-grants": { id: "N83", needs: [["Site-scoped permission query on the server", "استعلام صلاحيات حسب الموقع على الخادم"], ["Invitation / revocation workflow with audit", "سير دعوة / إلغاء مع تدقيق"], ["Publication policy (Published revisions only)", "سياسة النشر (الإصدارات المنشورة فقط)"]] },
};
export function DeferredPage({ params }: PluginPageProps) {
  const { t, ar } = useFx(); const k = String(params["key"] ?? ""); const d = DEFERRED[k]; const sc = d ? screenById(d.id) : undefined;
  if (k === "offline") return <FieldOfflinePage />; // F4-06: the offline queue is built (owner: nothing waits); old links land on it
  if (!d || !sc) return <DxState kind="empty" title={t("Unknown page", "صفحة غير معروفة")} />;
  const fallback: Record<string, [string, string, string]> = { offline: ["queue/workpacks", "Work-pack readiness", "جاهزية حزمة العمل"], notifications: ["doctype", "Message intents (Communication)", "رسائل التواصل"], "portal-grants": ["portal/p01", "Portal staff preview", "معاينة البوابة للموظفين"] };
  const fb = fallback[k]!;
  return (
    <div className="w-full min-w-0" data-page="fsm-deferred" data-deferred={sc.id}>
      <PageHeader title={ar ? sc.label_ar : sc.label} band={{ question: t("Why is this not available here?", "لماذا هذه غير متاحة هنا؟"), basis: ar ? t("", "هذه القدرة تتطلب خادم DIGIT أو خدمة خارجية. لا نعرض زراً وهمياً ولا ندّعي توفرها.") : sc.note ?? "", meta: [{ label: t("Screen", "الشاشة"), value: <span data-no-i18n>{sc.id}</span> }, { label: t("Status", "الحالة"), value: "SERVER_REQUIRED" }] }} />
      <Panel title={t("What the server must provide", "ما يجب أن يوفره الخادم")}><ul className="list-disc space-y-1.5 ps-5 text-sm">{d.needs.map(([en, a]) => <li key={en}>{ar ? a : en}</li>)}</ul></Panel>
      <Panel title={t("What you can use now", "ما يمكنك استخدامه الآن")}>{fb[0] === "doctype" ? <ListRef doctype="Communication">{ar ? fb[2] : fb[1]}</ListRef> : <AppLink to={fb[0]}>{ar ? fb[2] : fb[1]}</AppLink>}</Panel>
    </div>
  );
}
