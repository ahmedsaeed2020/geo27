/** Department 07 — HR Administration, Settings & Integrations (setup & policies, privacy & audit, templates & notifications, integrations). */
import { adapter, type Doc } from "@/lib/adapter";
import { userRoles } from "@/lib/session";
import { addDays, age, bars, countKpi, d10, denied, groupCount, L, lastDays, names, pct, rows, rowsData, s, where, flip, type Ctx, type DecisionItem, type Insight, type SectionSpec } from "./kit";
import { setupChecks } from "../../setupChecks";
import { DHPS, POLICY_KEYS, policyRecord } from "../settings";
import { unmappedRoutes } from "../../r10/features/closing";

const fullScope = (u: string) => u === "Administrator" || userRoles(u).some((r) => r === "HR Manager" || r === "System Manager");
const checks = (c: Ctx) => setupChecks({ rows: (dt) => rows(dt, c) as Record<string, unknown>[] | null, today: c.on, fullScope: fullScope(c.user), exists: (dt, nm) => !!adapter.get(dt, nm) });
const HR_DTS = new Set(["Employee", "Salary Structure Assignment", "Salary Slip", "Payroll Entry", "Leave Application", "Leave Allocation", "Attendance", "Expense Claim", "Employee Advance", "Appraisal", "Job Offer", "Job Applicant", "Additional Salary", "Shift Assignment"]);
const isHrDt = (dt: string) => HR_DTS.has(dt) || dt.startsWith("DIGIT ");

/* 07.1 Setup & policies */
const S071: SectionSpec = { id: "07.1",
  kpis: [
    { id: "setup", title: ["Setup checks passed", "فحوص الإعداد الناجحة"], meaning: ["HR setup checks that pass (calendar, leave, approval, payroll, identity, organization, shifts).", "فحوص إعداد الموارد البشرية الناجحة (التقويم، الإجازات، الاعتماد، الرواتب، الهوية، التنظيم، الورديات)."], sources: ["Holiday List", "Leave Type", "Salary Structure", "Employee", "Shift Type"], unit: "pct", better: "up",
      value: (c) => { const k = checks(c); const ev = k.filter((x) => x.status !== "NOT_EVALUATED"); const ok = ev.filter((x) => x.status === "PASS" || x.status === "INFO"); return { value: pct(ok.length, ev.length), sub: [`${ok.length} of ${ev.length} · ${k.length - ev.length} not evaluated`, `${ok.length} من ${ev.length} · ${k.length - ev.length} غير مقيّم`] }; } },
    countKpi("policies", ["Policy settings in force", "إعدادات السياسات السارية"], ["Approved HR policy setting records (company or company-wide) that override a Saudi default.", "سجلات إعدادات السياسات المعتمدة (للشركة أو عامة) التي تتجاوز القيمة الافتراضية السعودية."], DHPS, [["setting_status", "=", "Approved"]]),
    countKpi("rules", ["Saudi rule sets approved", "قواعد سعودية معتمدة"], ["Approved Saudi rule sets (GOSI, WPS, end of service, Saudization).", "القواعد السعودية المعتمدة (التأمينات، حماية الأجور، نهاية الخدمة، السعودة)."], "DIGIT Saudi Rule Set", [["rule_status", "=", "Approved"]], { better: "up" }),
    countKpi("drafts", ["Settings awaiting approval", "إعدادات بانتظار الاعتماد"], ["Policy setting and rule set drafts.", "مسودات الإعدادات والقواعد."], DHPS, [["setting_status", "=", "Draft"]], { better: "down" }),
    { id: "unmapped", title: ["Unmapped routes", "مسارات غير مربوطة"], meaning: ["HR documents and section tools with no reachable HR page (navigation registry: document placements and tool sections).", "مستندات وأدوات الموارد البشرية التي لا تصل إليها صفحة في التطبيق (سجل التنقل: مواضع المستندات وأقسام الأدوات)."], sources: ["DIGIT HR navigation"], unit: "count", better: "down",
      value: () => { const u = unmappedRoutes(); return { value: u.length, sub: [u.length ? u.slice(0, 3).map((x) => x.id).join(", ") : "Every route is mapped", u.length ? u.slice(0, 3).map((x) => x.id).join("، ") : "كل المسارات مربوطة"] }; } },
  ],
  primary: { id: "setup-steps", title: ["Setup steps", "خطوات الإعداد"], meaning: ["Each HR setup check with its rule and the records it found; NOT EVALUATED when your view of the sources is limited.", "كل فحص إعداد مع قاعدته والسجلات التي وجدها؛ غير مقيّم عندما تكون رؤيتك للمصادر محدودة."], sources: ["Holiday List", "Leave Type", "Salary Structure", "Employee", "Shift Type"], shape: "rows", view: "table", size: { w: 8 },
    data: (c) => { const k = checks(c);
      return rowsData([{ key: "check", label: ["Check", "الفحص"] }, { key: "area", label: ["Area", "المجال"] }, { key: "state", label: ["State", "الحالة"] }, { key: "count", label: ["Records", "السجلات"], numeric: true, data: true }],
        k.map((x) => ({ id: x.id, cells: { check: c.ar ? x.ar : x.en, area: x.area, state: x.status === "PASS" ? L(c, ["Pass", "ناجح"]) : x.status === "FINDING" ? L(c, ["Finding", "ملاحظة"]) : x.status === "INFO" ? L(c, ["Info", "معلومة"]) : L(c, ["Not evaluated", "غير مقيّم"]), count: x.evidence.names.length }, tone: x.status === "PASS" ? "ok" as const : x.status === "FINDING" ? "bad" as const : "info" as const, drill: x.evidence.names.length ? { kind: "list" as const, doctype: x.evidence.doctype, filters: [["name", "in", x.evidence.names.join(",")]] } : undefined }))); } },
  secondary: { id: "policy-values", title: ["Saudi policy values in force", "قيم السياسات السعودية السارية"], meaning: ["Every HR policy value used by the engines today: the approved setting record when one exists, else the Saudi default.", "كل قيمة سياسة تستخدمها المحركات اليوم: سجل الإعداد المعتمد إن وُجد، وإلا القيمة السعودية الافتراضية."], sources: [DHPS], shape: "rows", view: "table", size: { w: 4 },
    data: (c) => rowsData([{ key: "key", label: ["Setting", "الإعداد"] }, { key: "value", label: ["Value", "القيمة"], numeric: true }, { key: "from", label: ["Source", "المصدر"] }],
      POLICY_KEYS.map((k) => { const rec = policyRecord(k.key, c.on, c.company); const v = rec ? Number(rec["value"]) : k.default; return { id: k.key, cells: { key: c.ar ? k.ar : k.en, value: v ?? "—", from: rec ? L(c, ["Setting record", "سجل إعداد"]) : v === null ? L(c, ["Not set", "غير محدد"]) : L(c, ["Saudi default", "افتراضي سعودي"]) }, tone: v === null ? "warn" as const : rec ? "info" as const : "ok" as const, drill: rec ? { kind: "doc" as const, doctype: DHPS, name: rec.name } : { kind: "list" as const, doctype: DHPS, filters: [["setting", "=", k.key]] } }; })) },
  insights: (c) => { const out: Insight[] = []; const k = checks(c).filter((x) => x.status === "FINDING"); for (const x of k.slice(0, 3)) out.push({ key: x.id, tone: "risk", text: [`${x.en}: ${x.evidence.names.length} records.`, `${x.ar}: ${x.evidence.names.length} سجلات.`], drill: x.evidence.names.length ? { kind: "list", doctype: x.evidence.doctype, filters: [["name", "in", x.evidence.names.join(",")]] } : undefined });
    const unset = POLICY_KEYS.filter((p) => p.default === null && !policyRecord(p.key, c.on, c.company)); if (unset.length) out.push({ key: "unset", tone: "info", text: [`${unset.length} settings have no Saudi default and are not set yet (${unset.map((p) => p.en).join(", ")}).`, `${unset.length} إعدادات بلا قيمة افتراضية ولم تُحدد بعد (${unset.map((p) => p.ar).join("، ")}).`], drill: { kind: "list", doctype: DHPS, filters: [] } });
    return out.length ? out : [{ key: "ok", tone: "good", text: ["Setup is complete.", "الإعداد مكتمل."] }]; },
  decisions: (c) => (where(rows(DHPS, c), [["setting_status", "=", "Draft"]]) ?? []).slice(0, 10).map((d): DecisionItem => ({ key: d.name, doctype: DHPS, name: d.name, title: POLICY_KEYS.find((k) => k.key === d["setting"])?.[c.ar ? "ar" : "en"] ?? s(d["setting"]), sub: [`Value ${s(d["value"])} from ${d10(d["effective_from"])}`, `القيمة ${s(d["value"])} من ${d10(d["effective_from"])}`], age: age(c, d10(d["creation"])), kind: "approve" })) };

/* 07.2 Privacy & audit */
const versions = (c: Ctx, days: number) => where(rows("Version", c), [lastDays("creation", days)(c)])?.filter((v) => isHrDt(s(v["ref_doctype"]))) ?? null;
const exceptions = (c: Ctx) => { const out: { id: string; kind: [string, string]; who: string; what: string; tone: "bad" | "warn" | "info"; drill: { kind: "doc"; doctype: string; name: string } }[] = [];
  const users = rows("User", c) ?? []; const linked = new Set((rows("Employee", c) ?? []).map((e) => s(e["user_id"])).filter(Boolean));
  for (const u of users) { const roles = ((u["roles"] as Doc[] | undefined) ?? []).map((r) => s(r["role"])); if (roles.some((r) => r === "HR Manager" || r === "HR User") && !linked.has(u.name) && Number(u["enabled"] ?? 1)) out.push({ id: `u-${u.name}`, kind: ["HR role without an employee record", "دور موارد بشرية بلا سجل موظف"], who: u.name, what: roles.filter((r) => r.startsWith("HR")).join(", "), tone: "warn", drill: { kind: "doc", doctype: "User", name: u.name } }); }
  for (const d of rows("DocShare", c) ?? []) if (isHrDt(s(d["share_doctype"]))) out.push({ id: `s-${d.name}`, kind: ["Record shared directly", "سجل مشارك مباشرة"], who: s(d["user"]), what: `${s(d["share_doctype"])} ${s(d["share_name"])}`, tone: "info", drill: { kind: "doc", doctype: "DocShare", name: d.name } });
  for (const d of rows("User Permission", c) ?? []) if (s(d["allow"]) === "Employee" || s(d["allow"]) === "Company") out.push({ id: `p-${d.name}`, kind: ["Record-level restriction", "تقييد على مستوى السجل"], who: s(d["user"]), what: `${s(d["allow"])} = ${s(d["for_value"])}`, tone: "info", drill: { kind: "doc", doctype: "User Permission", name: d.name } });
  return out; };
const S072: SectionSpec = { id: "07.2",
  kpis: [
    { id: "changes", title: ["HR record changes (30 days)", "تغييرات سجلات الموارد البشرية (30 يومًا)"], meaning: ["Version history entries on HR documents in the last 30 days.", "سجلات تاريخ التعديل على مستندات الموارد البشرية خلال آخر 30 يومًا."], sources: ["Version"], unit: "count", better: "none",
      value: (c) => { const v = versions(c, 30); if (!v) return { value: null, status: "denied" }; return { value: v.length, drill: names("Version", v) }; } },
    { id: "salary", title: ["Salary and bank changes (30 days)", "تغييرات الرواتب والبنوك (30 يومًا)"], meaning: ["Changes to salary assignments, employee IBAN and bank change requests in the last 30 days.", "التغييرات على إسنادات الرواتب وآيبان الموظف وطلبات تغيير البنك خلال آخر 30 يومًا."], sources: ["Version"], unit: "count", better: "none",
      value: (c) => { const v = versions(c, 30); if (!v) return { value: null, status: "denied" }; const sel = v.filter((x) => ["Salary Structure Assignment", "DIGIT Bank Change Request", "DIGIT Compensation Review"].includes(s(x["ref_doctype"])) || (s(x["ref_doctype"]) === "Employee" && /iban|bank/i.test(s(x["data"])))); return { value: sel.length, drill: names("Version", sel) }; } },
    { id: "exceptions", title: ["Permission exceptions", "استثناءات الصلاحيات"], meaning: ["HR roles without an employee record, direct shares of HR records and record-level restrictions.", "أدوار موارد بشرية بلا سجل موظف، ومشاركات مباشرة لسجلات الموارد البشرية، وتقييدات على مستوى السجل."], sources: ["User", "DocShare", "User Permission"], unit: "count", better: "down",
      value: (c) => ({ value: exceptions(c).length, sub: [`${exceptions(c).filter((x) => x.tone === "warn").length} to review`, `${exceptions(c).filter((x) => x.tone === "warn").length} للمراجعة`] }) },
    countKpi("errors", ["Errors (7 days)", "الأخطاء (7 أيام)"], ["Error Log entries of the last 7 days.", "سجلات الأخطاء خلال آخر 7 أيام."], "Error Log", (c) => [lastDays("creation", 7)(c)], { better: "down" }),
  ],
  primary: { id: "exceptions", title: ["Permission exceptions", "استثناءات الصلاحيات"], meaning: ["Who can reach HR data outside the normal role rules, one line each.", "من يصل إلى بيانات الموارد البشرية خارج قواعد الأدوار المعتادة، سطر لكل حالة."], sources: ["User", "DocShare", "User Permission", "Employee"], shape: "rows", view: "table", size: { w: 8 },
    data: (c) => rowsData([{ key: "kind", label: ["Exception", "الاستثناء"] }, { key: "who", label: ["User", "المستخدم"] }, { key: "what", label: ["Scope", "النطاق"] }], exceptions(c).slice(0, 80).map((x) => ({ id: x.id, cells: { kind: L(c, x.kind), who: x.who, what: x.what }, tone: x.tone, drill: x.drill }))) },
  secondary: { id: "changes-dt", title: ["Changes by document type (30 days)", "التغييرات حسب نوع المستند (30 يومًا)"], meaning: ["Version entries on HR documents in the last 30 days per document type.", "سجلات التعديل على مستندات الموارد البشرية خلال آخر 30 يومًا لكل نوع مستند."], sources: ["Version"], shape: "category", view: "bar", size: { w: 4 },
    data: (c) => bars(c, "Version", versions(c, 30), (d) => s(d["ref_doctype"]), { label: (k) => k }) },
  insights: (c) => { const out: Insight[] = []; const ex = exceptions(c).filter((x) => x.tone === "warn"); if (ex.length) out.push({ key: "roles", tone: "risk", text: [`${ex.length} users hold HR roles without an employee record — confirm they still need them.`, `${ex.length} مستخدمين يحملون أدوار موارد بشرية بلا سجل موظف — تأكد من حاجتهم إليها.`] });
    const v = versions(c, 7) ?? []; const by = [...groupCount(v, (d) => s(d["owner"]))].sort((a, b) => b[1].length - a[1].length)[0]; if (by && by[1].length >= 20) out.push({ key: "bulk", tone: "info", text: [`${by[0]} made ${by[1].length} HR changes in 7 days.`, `أجرى ${by[0]} عدد ${by[1].length} تغييرات خلال 7 أيام.`], drill: names("Version", by[1]) });
    return out.length ? out : [{ key: "ok", tone: "good", text: ["No permission exception to review.", "لا توجد استثناءات صلاحيات للمراجعة."] }]; },
  decisions: () => [] };

/* 07.3 Templates & notifications */
const notes = (c: Ctx, days: number) => where(rows("Notification Log", c), [lastDays("creation", days)(c)]);
const failedMail = (c: Ctx) => where(rows("Email Queue", c), [["status", "=", "Error"]]);
const S073: SectionSpec = { id: "07.3",
  kpis: [
    { id: "sent", title: ["Notifications (30 days)", "الإشعارات (30 يومًا)"], meaning: ["Notification Log entries of the last 30 days.", "سجلات الإشعارات خلال آخر 30 يومًا."], sources: ["Notification Log"], unit: "count", better: "none",
      value: (c) => { const r = notes(c, 30); if (!r) return { value: null, status: "denied" }; return { value: r.length, drill: names("Notification Log", r) }; } },
    { id: "unread", title: ["Unread over 3 days", "غير مقروءة منذ أكثر من 3 أيام"], meaning: ["Notifications not read 3 days after they were sent.", "إشعارات لم تُقرأ بعد 3 أيام من إرسالها."], sources: ["Notification Log"], unit: "count", better: "down",
      value: (c) => { const r = rows("Notification Log", c); if (!r) return { value: null, status: "denied" }; const sel = r.filter((d) => !Number(d["read"]) && d10(d["creation"]) < addDays(c.on, -3)); return { value: sel.length, drill: names("Notification Log", sel) }; } },
    { id: "failed", title: ["Failed emails", "رسائل بريد فاشلة"], meaning: ["Email Queue entries with status Error.", "رسائل البريد في قائمة الإرسال بحالة خطأ."], sources: ["Email Queue"], unit: "count", better: "down",
      value: (c) => { const r = failedMail(c); if (!r) return { value: null, status: "denied" }; return { value: r.length, drill: names("Email Queue", r) }; } },
    countKpi("templates", ["Email templates", "قوالب البريد"], ["Email templates available for HR letters and notifications.", "قوالب البريد المتاحة لخطابات وإشعارات الموارد البشرية."], "Email Template", [], { better: "up" }),
  ],
  primary: { id: "failed-list", title: ["Failed notifications", "الإشعارات الفاشلة"], meaning: ["Emails that failed and notifications left unread for more than 3 days.", "رسائل البريد الفاشلة والإشعارات غير المقروءة منذ أكثر من 3 أيام."], sources: ["Email Queue", "Notification Log"], shape: "rows", view: "queue", size: { w: 8 },
    data: (c) => { const m = failedMail(c) ?? [], u = (rows("Notification Log", c) ?? []).filter((d) => !Number(d["read"]) && d10(d["creation"]) < addDays(c.on, -3));
      return rowsData([{ key: "kind", label: ["Type", "النوع"] }, { key: "to", label: ["To", "إلى"] }, { key: "subject", label: ["Subject", "الموضوع"] }, { key: "date", label: ["Date", "التاريخ"] }],
        [...m.map((d) => ({ id: `m-${d.name}`, date: d10(d["creation"]), cells: { kind: L(c, ["Email failed", "بريد فشل"]), to: s(d["recipients"] ?? d["sender"]), subject: s(d["subject"] ?? d["message"]).slice(0, 80), date: d10(d["creation"]) }, tone: "bad" as const, drill: { kind: "doc" as const, doctype: "Email Queue", name: d.name } })),
         ...u.slice(0, 60).map((d) => ({ id: `n-${d.name}`, date: d10(d["creation"]), cells: { kind: L(c, ["Unread", "غير مقروء"]), to: s(d["for_user"]), subject: (c.ar ? s(d["subject_ar"]) : "") || s(d["subject"]), date: d10(d["creation"]) }, tone: "warn" as const, drill: { kind: "doc" as const, doctype: "Notification Log", name: d.name } }))]); } },
  secondary: { id: "by-doc", title: ["Notifications by document type", "الإشعارات حسب نوع المستند"], meaning: ["Notifications of the last 30 days per document type.", "إشعارات آخر 30 يومًا لكل نوع مستند."], sources: ["Notification Log"], shape: "category", view: "donut", size: { w: 4 },
    data: (c) => bars(c, "Notification Log", notes(c, 30), (d) => s(d["document_type"]), { label: (k) => k }) },
  insights: (c) => { const out: Insight[] = []; const m = failedMail(c) ?? []; if (m.length) out.push({ key: "mail", tone: "risk", text: [`${m.length} emails failed — check the email account in Administration.`, `فشلت ${m.length} رسائل بريد — راجع حساب البريد في الإدارة.`], drill: names("Email Queue", m) });
    const r = notes(c, 30) ?? []; const rd = r.filter((d) => Number(d["read"])); if (r.length) out.push({ key: "read", tone: pct(rd.length, r.length) >= 70 ? "good" : "info", text: [`${pct(rd.length, r.length)}% of the last 30 days' notifications were read.`, `قُرئ ${pct(rd.length, r.length)}% من إشعارات آخر 30 يومًا.`], drill: names("Notification Log", r) });
    return out.length ? out : [{ key: "ok", tone: "good", text: ["Every notification was delivered.", "وصلت كل الإشعارات."] }]; },
  decisions: () => [] };

/* 07.4 Integrations */
const LOG = "DIGIT HR Integration Log";
const logs = (c: Ctx, days: number) => where(rows(LOG, c), [lastDays("logged_at", days)(c)]);
const S074: SectionSpec = { id: "07.4",
  kpis: [
    { id: "calls", title: ["Integration calls (30 days)", "عمليات التكامل (30 يومًا)"], meaning: ["Integration log entries of the last 30 days (GOSI, WPS / Mudad, Qiwa, Muqeem, bank, accounting).", "سجلات التكامل خلال آخر 30 يومًا (التأمينات، حماية الأجور / مدد، قوى، مقيم، البنك، المحاسبة)."], sources: [LOG], unit: "count", better: "none",
      value: (c) => { const r = logs(c, 30); if (!r) return { value: null, status: "denied" }; return { value: r.length, drill: names(LOG, r) }; } },
    { id: "rate", title: ["Success rate (30 days)", "نسبة النجاح (30 يومًا)"], meaning: ["Successful entries over finished (success + failed) entries of the last 30 days.", "السجلات الناجحة إلى المنتهية (ناجحة + فاشلة) خلال آخر 30 يومًا."], sources: [LOG], unit: "pct", better: "up",
      value: (c) => { const r = logs(c, 30); if (!r) return { value: null, status: "denied" }; const ok = r.filter((d) => s(d["log_status"]) === "Success"), fin = r.filter((d) => s(d["log_status"]) !== "Queued"); return { value: pct(ok.length, fin.length), sub: [`${ok.length} of ${fin.length}`, `${ok.length} من ${fin.length}`], drill: names(LOG, ok) }; } },
    countKpi("failed", ["Failed (30 days)", "الفاشلة (30 يومًا)"], ["Failed integration entries of the last 30 days.", "سجلات التكامل الفاشلة خلال آخر 30 يومًا."], LOG, (c) => [["log_status", "=", "Failed"], lastDays("logged_at", 30)(c)], { better: "down" }),
    countKpi("queued", ["Queued", "في الانتظار"], ["Integration entries still queued.", "سجلات تكامل ما زالت في الانتظار."], LOG, [["log_status", "=", "Queued"]], { better: "down" }),
  ],
  primary: { id: "status-matrix", title: ["Integration health", "صحة التكاملات"], meaning: ["Entries of the last 30 days per integration and status.", "سجلات آخر 30 يومًا لكل تكامل وحالة."], sources: [LOG], shape: "multi-series", view: "stacked-bar", size: { w: 8 },
    data: (c) => { const r = logs(c, 30); if (!r) return { kind: "matrix", status: "denied", rowKeys: [], colKeys: [], values: [] }; const ints = [...new Set(r.map((d) => s(d["integration"])))].sort(); const st = ["Success", "Failed", "Queued"];
      return { kind: "matrix", status: r.length ? "ok" : "empty", ...flip(st.map((x) => L(c, x === "Success" ? ["Success", "ناجح"] : x === "Failed" ? ["Failed", "فاشل"] : ["Queued", "بالانتظار"])), ints, st.map((x) => ints.map((i) => r.filter((d) => s(d["integration"]) === i && s(d["log_status"]) === x).length))), legend: "sum", drill: names(LOG, r) }; } },
  secondary: { id: "fail-day", title: ["Failures by day", "الإخفاقات يوميًا"], meaning: ["Failed entries per day, last 14 days.", "السجلات الفاشلة لكل يوم خلال آخر 14 يومًا."], sources: [LOG], shape: "time-series", view: "bar", size: { w: 4 },
    data: (c) => { const r = where(rows(LOG, c), [["log_status", "=", "Failed"]]); if (!r) return denied(); const days = Array.from({ length: 14 }, (_, i) => addDays(c.on, i - 13));
      return { kind: "series", status: "ok", valueLabel: ["Failed", "فاشلة"], points: days.map((d) => { const sel = r.filter((x) => d10(x["logged_at"]) === d); return { key: d, label: d.slice(5), value: sel.length, tone: sel.length ? "bad" as const : "ok" as const, drill: names(LOG, sel) }; }) }; } },
  insights: (c) => { const out: Insight[] = []; const r = logs(c, 30) ?? []; const by = [...groupCount(r.filter((d) => s(d["log_status"]) === "Failed"), (d) => s(d["integration"]))].sort((a, b) => b[1].length - a[1].length)[0];
    if (by) out.push({ key: "worst", tone: "risk", text: [`${by[0]} failed ${by[1].length} times in 30 days — last message: ${s(by[1][0]!["message"]).slice(0, 80)}`, `فشل ${by[0]} ${by[1].length} مرات خلال 30 يومًا — آخر رسالة: ${s(by[1][0]!["message"]).slice(0, 80)}`], drill: names(LOG, by[1]) });
    const q = (rows(LOG, c) ?? []).filter((d) => s(d["log_status"]) === "Queued" && d10(d["logged_at"]) < addDays(c.on, -1)); if (q.length) out.push({ key: "stuck", tone: "risk", text: [`${q.length} entries have been queued for more than a day.`, `${q.length} سجلات في الانتظار منذ أكثر من يوم.`], drill: names(LOG, q) });
    return out.length ? out : [{ key: "ok", tone: "good", text: ["Every integration is healthy.", "كل التكاملات سليمة."] }]; },
  decisions: (c) => (where(rows(LOG, c), [["log_status", "=", "Failed"], lastDays("logged_at", 30)(c)]) ?? []).slice(0, 15).map((d): DecisionItem => ({ key: d.name, doctype: LOG, name: d.name, title: s(d["integration"]), sub: [s(d["message"]).slice(0, 90), s(d["message"]).slice(0, 90)], age: age(c, d10(d["logged_at"])), kind: "fix" })) };

export const D07: SectionSpec[] = [S071, S072, S073, S074];
