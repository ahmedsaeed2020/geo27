/** Settings & governance workspace overviews: Permissions, Templates, Communications. */
import { canReadType } from "@/lib/scope";
import { list, rows, titleOf } from "../../domain/data";
import { addDays, s, today } from "../../domain/rules";
import { FSM_DOCTYPES, FSM_ROLES } from "../../schema";
import { opt } from "../kit";
import { Bars, Cols, Insight, Ring, Stack, Unavailable, countBy, inWin, monthAxis, monthEnd, monthLabel, perMonth, pts } from "../insights";
import { C, K, LS, M, Q, type OvFn } from "./ctx";

type Perm = { role: string; read?: number; write?: number; create?: number; submit?: number; delete?: number };
const MAIN = FSM_DOCTYPES.filter((d) => !d.istable && !d.issingle);

export const permissions: OvFn = (c) => {
  const { t } = c;
  const lvl = (role: string, d: (typeof MAIN)[number]) => { const p = ((d.permissions ?? []) as Perm[]).filter((x) => x.role === role); return p.some((x) => x.create) ? "create" : p.some((x) => x.write) ? "write" : p.some((x) => x.read) ? "read" : "none"; };
  const users = canReadType("User") ? list("User").filter((u) => Number(u["enabled"] ?? 1) === 1) : [];
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive");
  const now = today(); const soon = addDays(now, 30);
  const skills = techs.flatMap((x) => rows(x, "skills").map((k) => ({ ...k, tech: x.name }) as Record<string, unknown>));
  const cert = (k: Record<string, unknown>) => { const d = s(k["valid_until"]); return !d ? "none" : d < now ? "expired" : d <= soon ? "soon" : "valid"; };
  return {
    scope: false, queues: false,
    charts: <>
      <Insight id="perm-role" title={["Access level per FSM role", "مستوى الوصول لكل دور خدمة"]} q={["What may each FSM role do across the app's documents?", "ماذا يمكن لكل دور خدمة أن يفعل في مستندات التطبيق؟"]}
        meta={M(["DocPerm", "FSM DocTypes"], ["One FSM DocType per role (the app's declared role permissions, permlevel 0)", "نوع مستند خدمة لكل دور (صلاحيات الأدوار المعلنة، المستوى 0)"], ["Count of DocTypes where the role may create, only write, only read, or has no access", "عدد أنواع المستندات التي يمكن للدور إنشاؤها أو تعديلها فقط أو قراءتها فقط أو لا وصول"], ["Permissions are enforced by the session rules; open Role Permissions to change them", "الصلاحيات تُفرض بقواعد الجلسة؛ افتح صلاحيات الأدوار لتغييرها"], ["User Permissions (site / company restrictions) narrow these further per user", "صلاحيات المستخدم (قيود الموقع/الشركة) تضيّقها أكثر لكل مستخدم"])}>
        <Stack legend={[{ key: "create", label: t("Create", "إنشاء"), tone: "good" }, { key: "write", label: t("Write only", "تعديل فقط"), tone: "info" }, { key: "read", label: t("Read only", "قراءة فقط"), tone: "neutral" }, { key: "none", label: t("No access", "لا وصول"), tone: "bad" }]}
          rows={FSM_ROLES.map((r) => ({ key: r, label: <span data-no-i18n>{r}</span>, segs: (["create", "write", "read", "none"] as const).map((k) => ({ key: k, value: MAIN.filter((d) => lvl(r, d) === k).length })) }))} empty={t("No FSM role is defined.", "لا أدوار خدمة معرّفة.")} />
      </Insight>
      <Insight id="perm-users" title={["Users per FSM role", "المستخدمون لكل دور خدمة"]} q={["How many enabled users hold each FSM role?", "كم مستخدماً مفعلاً يحمل كل دور خدمة؟"]}
        meta={M(["User", "Has Role"], ["One enabled user × role assignment", "مستخدم مفعّل × إسناد دور"], ["Count of users holding the role", "عدد المستخدمين الحاملين للدور"], ["User list", "قائمة المستخدمين"], ["Shown only to users who may read User records", "يظهر فقط لمن يحق له قراءة سجلات المستخدمين"])}>
        {canReadType("User") ? <Bars items={FSM_ROLES.map((r) => ({ key: r, label: <span data-no-i18n>{r}</span>, value: users.filter((u) => rows(u, "roles").some((x) => s(x["role"]) === r)).length, ...LS("User", ["enabled", 1]) }))} empty={t("No user holds an FSM role.", "لا مستخدم يحمل دور خدمة.")} />
          : <p className="py-6 text-center text-sm text-muted-foreground">{t("You may not read user records.", "لا يحق لك قراءة سجلات المستخدمين.")}</p>}
      </Insight>
      <Insight id="perm-tech" title={["Technicians linked to a login", "الفنيون المرتبطون بحساب دخول"]} q={["Can every active technician sign in to record work?", "هل يستطيع كل فني نشط الدخول لتسجيل العمل؟"]}
        meta={M(["FSM Technician", "User"], ["One active technician", "فني نشط"], ["With a linked User vs without", "بمستخدم مرتبط مقابل دونه"], ["Technician register filtered accordingly", "سجل الفنيين مفلتراً وفقاً لذلك"])}>
        <Ring items={[{ key: "y", label: t("Linked to a user", "مرتبط بمستخدم"), tone: "good" as const, value: techs.filter((x) => s(x["user"])).length, ...LS("FSM Technician", ["user", ["is", "set"]], ["status", "Active"]) }, { key: "n", label: t("No login", "بلا حساب"), tone: "warn" as const, value: techs.filter((x) => !s(x["user"])).length, ...LS("FSM Technician", ["user", ["is", "not set"]], ["status", "Active"]) }]} total={t("technicians", "فني")} empty={t("No active technician.", "لا فنيون نشطون.")} />
      </Insight>
      <Insight id="perm-cert" title={["Skill certificates", "شهادات المهارات"]} q={["Which certificates block assignment because they expired?", "أي الشهادات تمنع الإسناد لانتهائها؟"]}
        meta={M(["FSM Technician", "FSM Technician Skill"], ["One skill row of an active technician", "صف مهارة لفني نشط"], ["Expired, expiring within 30 days, valid, no expiry recorded", "منتهية، تنتهي خلال 30 يوماً، سارية، بلا تاريخ"], ["Certifications queue", "طابور الشهادات"], ["A skill without a validity date is not treated as certified", "المهارة بلا تاريخ صلاحية لا تُعد معتمدة"])}>
        <Bars items={pts(countBy(skills, cert), { order: ["expired", "soon", "valid", "none"], label: (k) => ({ expired: t("Expired", "منتهية"), soon: t("Expiring ≤30 days", "تنتهي خلال 30 يوماً"), valid: t("Valid", "سارية"), none: t("No validity date", "بلا تاريخ صلاحية") } as Record<string, string>)[k], tone: (k) => (k === "expired" ? "bad" : k === "soon" ? "warn" : k === "valid" ? "good" : "neutral"), drill: () => ({ to: "queue/certifications" }) })} empty={t("No skill is recorded.", "لا مهارات مسجلة.")} />
      </Insight>
    </>,
    kpis: <><C c={c} label={["FSM roles", "أدوار الخدمة"]} value={FSM_ROLES.length} basis={["Roles shipped by the app", "الأدوار التي يوفرها التطبيق"]} /><C c={c} label={["FSM DocTypes", "أنواع مستندات الخدمة"]} value={MAIN.length} basis={["Non-child, non-single app DocTypes", "أنواع مستندات التطبيق غير الفرعية وغير المفردة"]} /><Q k="certifications" c={c} /><C c={c} label={["Technicians without login", "فنيون بلا حساب"]} value={techs.filter((x) => !s(x["user"])).length} basis={["Active technicians with no User", "فنيون نشطون بلا مستخدم"]} tone="warn" /></>,
  };
};

export const templates: OvFn = (c) => {
  const { t, ar, F } = c;
  const tpls = list("FSM Inspection Template");
  const runs = list("FSM Inspection Run").filter((r) => inWin(r["submitted_on"] || r["creation"], F));
  return {
    scope: ["from", "to"],
    charts: <>
      <Insight id="tpl-status" title={["Templates by status", "القوالب حسب الحالة"]} q={["Which templates may technicians use?", "أي القوالب يمكن للفنيين استخدامها؟"]}
        meta={M(["FSM Inspection Template"], ["One template version", "إصدار قالب واحد"], ["Count by status; only Active versions start new runs", "العدد حسب الحالة؛ الإصدارات النشطة فقط تبدأ جولات جديدة"], ["Template register filtered to the status", "سجل القوالب مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(tpls, "status"), { label: (k) => opt(k, ar), order: ["Active", "Draft", "Superseded"], tone: (k) => (k === "Active" ? "good" : k === "Draft" ? "warn" : "neutral"), drill: (k) => LS("FSM Inspection Template", ["status", k]) })} total={t("templates", "قالب")} empty={t("No inspection template.", "لا قوالب فحص.")} />
      </Insight>
      <Insight id="tpl-type" title={["Templates by system type", "القوالب حسب نوع النظام"]} q={["Is every trade covered by an active template?", "هل لكل تخصص قالب نشط؟"]}
        meta={M(["FSM Inspection Template"], ["One template version", "إصدار قالب"], ["Count per system type split Active / other", "العدد لكل نوع نظام: نشط / غيره"], ["Template register filtered to the type", "سجل القوالب مفلتراً بالنوع"])}>
        <Stack legend={[{ key: "a", label: opt("Active", ar), tone: "good" }, { key: "o", label: t("Draft / superseded", "مسودة / مستبدل"), tone: "neutral" }]} rows={[...new Set(tpls.map((x) => s(x["system_type"])))].map((k) => ({ key: k, label: opt(k, ar), segs: [{ key: "a", value: tpls.filter((x) => s(x["system_type"]) === k && s(x["status"]) === "Active").length, ...LS("FSM Inspection Template", ["system_type", k], ["status", "Active"]) }, { key: "o", value: tpls.filter((x) => s(x["system_type"]) === k && s(x["status"]) !== "Active").length, ...LS("FSM Inspection Template", ["system_type", k], ["status", ["!=", "Active"]]) }] }))} empty={t("No inspection template.", "لا قوالب فحص.")} />
      </Insight>
      <Insight id="tpl-checks" title={["Checks per template", "البنود لكل قالب"]} q={["How detailed is each template, and how many checks need photos?", "ما مدى تفصيل كل قالب، وكم بنداً يحتاج صورة؟"]}
        meta={M(["FSM Inspection Template", "FSM Template Check"], ["One template; check rows counted", "قالب واحد؛ صفوف البنود معدودة"], ["Checks requiring evidence vs other checks", "بنود تتطلب دليلاً مقابل غيرها"], ["The template record", "سجل القالب"])}>
        <Stack legend={[{ key: "e", label: t("Photo required", "صورة مطلوبة"), tone: "warn" }, { key: "o", label: t("Other checks", "بنود أخرى"), tone: "info" }]} rows={tpls.filter((x) => s(x["status"]) !== "Superseded").map((x) => { const ch = rows(x, "checks"); return { key: x.name, label: <span data-no-i18n>{titleOf("FSM Inspection Template", x.name)} · v{s(x["version"])}</span>, ...LS("FSM Inspection Template", ["name", x.name]), segs: [{ key: "e", value: ch.filter((k) => k["evidence_required"]).length, ...LS("FSM Inspection Template", ["name", x.name]) }, { key: "o", value: ch.filter((k) => !k["evidence_required"]).length, ...LS("FSM Inspection Template", ["name", x.name]) }] }; })} empty={t("No inspection template.", "لا قوالب فحص.")} />
      </Insight>
      <Insight id="tpl-use" title={["Runs per template", "الجولات لكل قالب"]} q={["Which templates are actually used in the field?", "أي القوالب تُستخدم فعلاً في الميدان؟"]}
        meta={M(["FSM Inspection Run", "FSM Inspection Template"], ["One inspection run → its template", "جولة فحص ← قالبها"], ["Count of runs per template (period by submission date)", "عدد الجولات لكل قالب (الفترة حسب تاريخ التقديم)"], ["Run register filtered to the template", "سجل الجولات مفلتراً بالقالب"])}>
        <Bars items={pts(countBy(runs, "template"), { label: (k) => <span data-no-i18n>{titleOf("FSM Inspection Template", k)}</span>, drill: (k) => LS("FSM Inspection Run", ["template", k]) })} empty={t("No run uses a template in scope.", "لا جولات تستخدم قالباً ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><Q k="templates" c={c} /><C c={c} label={["Active templates", "القوالب النشطة"]} value={tpls.filter((x) => s(x["status"]) === "Active").length} basis={["Status Active", "بحالة نشط"]} to="ws/templates?tab=documents" tone="good" /><C c={c} label={["Draft templates", "قوالب مسودة"]} value={tpls.filter((x) => s(x["status"]) === "Draft").length} basis={["Not yet usable by technicians", "غير قابلة للاستخدام بعد"]} tone="warn" /><C c={c} label={["Photo-required checks", "بنود تتطلب صورة"]} value={tpls.filter((x) => s(x["status"]) === "Active").reduce((a, x) => a + rows(x, "checks").filter((k) => k["evidence_required"]).length, 0)} basis={["Across active templates", "عبر القوالب النشطة"]} /></>,
  };
};

export const comms: OvFn = (c) => {
  const { t, ar, F } = c;
  const okC = canReadType("Communication");
  const cm = okC ? list("Communication").filter((x) => inWin(x["communication_date"] || x["creation"], F)) : [];
  const months = monthAxis(cm.map((x) => x["communication_date"] || x["creation"]), F);
  const contacts = list("FSM Service Site").flatMap((x) => rows(x, "contacts").map((k) => ({ ...k, site: x.name }) as Record<string, unknown>));
  return {
    scope: ["from", "to"],
    charts: <>
      <Insight id="com-medium" title={["Messages by medium", "الرسائل حسب الوسيلة"]} q={["How do we talk to customers?", "كيف نتواصل مع العملاء؟"]}
        meta={M(["Communication"], ["One native Communication you may read", "سجل تواصل أصلي يحق لك قراءته"], ["Count by communication_medium", "العدد حسب وسيلة التواصل"], ["Communication list filtered to the medium", "قائمة التواصل مفلترة بالوسيلة"])}>
        <Ring items={pts(countBy(cm, "communication_medium"), { label: (k) => opt(k, ar), drill: (k) => LS("Communication", ["communication_medium", k]) })} total={t("messages", "رسالة")} empty={okC ? t("No communication in scope.", "لا تواصل ضمن النطاق.") : t("You may not read communications.", "لا يحق لك قراءة سجلات التواصل.")} />
      </Insight>
      <Insight id="com-month" title={["Messages by month", "الرسائل حسب الشهر"]} q={["Is customer communication regular?", "هل التواصل مع العملاء منتظم؟"]}
        meta={M(["Communication"], ["One Communication", "سجل تواصل"], ["Count by communication date month", "العدد حسب شهر التواصل"], ["Communication list for the month", "قائمة التواصل للشهر"])}>
        <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "n", label: t("Messages", "الرسائل"), values: perMonth(cm, (x) => x["communication_date"] || x["creation"], months) }]} drill={(li) => LS("Communication", ["communication_date", ["between", [`${months[li]}-01`, `${monthEnd(months[li]!)} 23:59:59`]]])} empty={t("No communication in scope.", "لا تواصل ضمن النطاق.")} />
      </Insight>
      <Insight id="com-contacts" title={["Site contacts by role", "جهات اتصال المواقع حسب الدور"]} q={["Who is notified at each site, and are emergency contacts recorded?", "من يُبلّغ في كل موقع، وهل جهات الطوارئ مسجلة؟"]}
        meta={M(["FSM Service Site", "FSM Site Contact", "Contact"], ["One site contact row", "صف جهة اتصال لموقع"], ["Count per contact role split notified / not notified", "العدد لكل دور: يُبلّغ / لا يُبلّغ"], ["Site contacts queue", "طابور جهات اتصال المواقع"])}>
        <Stack legend={[{ key: "y", label: t("Notified", "يُبلّغ"), tone: "good" }, { key: "n", label: t("Not notified", "لا يُبلّغ"), tone: "neutral" }]} rows={["Emergency", "Facility Manager", "Site Access", "Billing"].map((r) => ({ key: r, label: opt(r, ar), segs: [{ key: "y", value: contacts.filter((k) => s(k["contact_role"]) === r && k["notify"]).length, to: "queue/site-contacts" }, { key: "n", value: contacts.filter((k) => s(k["contact_role"]) === r && !k["notify"]).length, to: "queue/site-contacts" }] }))} empty={t("No site contact recorded.", "لا جهات اتصال مسجلة.")} />
      </Insight>
      <Insight id="com-delivery" title={["Delivery outcome", "نتيجة التسليم"]} q={["Were notifications actually delivered?", "هل سُلّمت الإشعارات فعلاً؟"]}
        meta={M(["Communication", "Email Queue"], ["Would be one delivery event per message (RP20)", "سيكون حدث تسليم لكل رسالة (RP20)"], ["Not computed in the preview", "غير محسوب في المعاينة"], ["RP20", "RP20"], ["Provider delivery receipts arrive only on a live server; nothing is assumed delivered", "إيصالات التسليم تصل من الخادم فقط؛ لا يُفترض تسليم شيء"])}>
        <Unavailable need={["Delivery status comes from the email / SMS provider and is recorded by the server.", "حالة التسليم تأتي من مزود البريد/الرسائل ويسجلها الخادم."]} backlog={["Provider webhooks and Email Queue status on the DIGIT site (K30 / RP20)", "ربط المزود وحالة طابور البريد على الخادم (K30 / RP20)"]} />
      </Insight>
    </>,
    kpis: <><K id="K30" F={F} c={c} /><C c={c} label={["Messages", "الرسائل"]} value={okC ? cm.length : null} basis={["Communications you may read", "سجلات التواصل المسموح بقراءتها"]} /><C c={c} label={["Site contacts", "جهات اتصال المواقع"]} value={contacts.length} basis={["Contact rows on service sites", "صفوف جهات الاتصال في المواقع"]} to="queue/site-contacts" /><C c={c} label={["Sites without emergency contact", "مواقع بلا جهة طوارئ"]} value={list("FSM Service Site").filter((x) => !rows(x, "contacts").some((k) => s(k["contact_role"]) === "Emergency")).length} basis={["Service sites with no Emergency contact row", "مواقع بلا صف جهة طوارئ"]} to="sites" tone="warn" /></>,
  };
};
