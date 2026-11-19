/**
 * Visual round R3 §4 — seven HR charts added to their section overviews (additive blocks of the same Dashboard Designer):
 * joiners vs leavers (diverging), Saudization gauge with Nitaqat zones, document expiry 30/60/90 by type, attendance
 * heatmap (day × department), labour cost vs labour budget per project, leave liability trend and payroll cost per head.
 * Every value is computed from permission-scoped records and their own dates; nothing is estimated or stored.
 */
import type { Doc } from "@/lib/adapter";
import type { WidgetData } from "@/lib/dashboards/registry";
import { leaveBalances } from "../../leaveFacts";
import { fmtCurrency } from "@/lib/format";
import { policyValue } from "../settings";
import { labourAllocation, saudization, wageOf } from "../payroll";
import { addDays, d10, daysBetween, denied, L, monthEnd, monthsBack, n, names, rows, s, sum, unitLabel, where, type ChartSpec, type Ctx } from "./kit";

const r2 = (x: number) => Math.round(x * 100) / 100;
const months12 = (c: Ctx) => monthsBack(c.on, 12);
const companiesOf = (c: Ctx, r: Doc[]) => (c.company ? [c.company] : [...new Set(r.map((d) => s(d["company"])))].filter(Boolean).sort());

/** 06.1 — joiners (up, positive) and leavers (down, negative) per month, 12 months. */
export const joinersLeavers: ChartSpec = { id: "joiners-leavers", title: ["Joiners and leavers by month", "المنضمون والمغادرون شهريًا"], meaning: ["Employees whose date of joining (up) or relieving date (down) falls in each of the last 12 months.", "الموظفون الذين يقع تاريخ التحاقهم (أعلى) أو تاريخ مغادرتهم (أسفل) في كل شهر من آخر 12 شهرًا."], sources: ["Employee"], shape: "multi-series", view: "stacked-bar", size: { w: 8 },
  data: (c) => { const e = rows("Employee", c); if (!e) return denied("matrix"); const ms = months12(c);
    const j = ms.map((m) => e.filter((x) => d10(x["date_of_joining"]).slice(0, 7) === m)), l = ms.map((m) => e.filter((x) => d10(x["relieving_date"]).slice(0, 7) === m));
    const tj = j.reduce((a, x) => a + x.length, 0), tl = l.reduce((a, x) => a + x.length, 0);
    return { kind: "matrix", status: tj + tl ? "ok" : "empty", rowKeys: ms, colKeys: [L(c, ["Joiners", "المنضمون"]), L(c, ["Leavers", "المغادرون"])], values: ms.map((_, i) => [j[i]!.length, -l[i]!.length]), legend: "sum",
      insight: L(c, [`Net ${tj - tl >= 0 ? "+" : "−"}${Math.abs(tj - tl)} over 12 months: ${tj} joined, ${tl} left.`, `الصافي ${tj - tl >= 0 ? "+" : "−"}${Math.abs(tj - tl)} خلال 12 شهرًا: انضم ${tj} وغادر ${tl}.`]), drill: names("Employee", [...j.flat(), ...l.flat()]) } as WidgetData; } };

/** 04.3 — Saudization % per company on a gauge with the Nitaqat zones from the effective-dated settings. */
export const saudizationGauge: ChartSpec = { id: "saudization-gauge", title: ["Saudization against the Nitaqat zones", "التوطين مقابل نطاقات نطاقات"], meaning: ["Saudi share of active employees per company against the red, yellow, green (low / mid / high, three equal steps between the green and platinum thresholds) and platinum zones of the policy settings.", "حصة السعوديين من الموظفين النشطين لكل شركة مقابل النطاقات الأحمر والأصفر والأخضر (منخفض / متوسط / مرتفع بثلاث خطوات متساوية بين حدي الأخضر والبلاتيني) والبلاتيني في إعدادات السياسة."], sources: ["Employee", "DIGIT Document Renewal", "DIGIT HR Policy Setting"], shape: "target", view: "bullet", size: { w: 6 },
  data: (c) => { const e = rows("Employee", c); if (!e) return denied(); const cos = companiesOf(c, e.filter((x) => s(x["status"]) === "Active"));
    const red = policyValue("saudization_red_pct", c.on, c.company) ?? 10, green = policyValue("saudization_target_pct", c.on, c.company) ?? 30, plat = policyValue("saudization_platinum_pct", c.on, c.company) ?? 40;
    const step = (plat - green) / 3;
    const zones = [{ to: red, tone: "error", label: ["Red", "أحمر"] }, { to: green, tone: "warning", label: ["Yellow", "أصفر"] }, { to: r2(green + step), tone: "g1", label: ["Low green", "أخضر منخفض"] }, { to: r2(green + 2 * step), tone: "g2", label: ["Mid green", "أخضر متوسط"] }, { to: plat, tone: "g3", label: ["High green", "أخضر مرتفع"] }, { to: 100, tone: "platinum", label: ["Platinum", "بلاتيني"] }];
    const pts = cos.map((co) => { const z = saudization(co, c.on, e); return { key: co, label: co, value: r2(z.pct), target: green, data: true, count: z.active, drill: { kind: "list" as const, doctype: "Employee", filters: [["name", "in", z.saudiIds.join(",") || "__none__"]] } }; });
    return { kind: "series", status: pts.length ? "ok" : "empty", unit: "%", valueLabel: ["Saudization", "التوطين"], targetLabel: ["Green threshold", "حد الأخضر"], points: pts, zones } as WidgetData; } };

/** 01.6 — documents expiring in 0–30 / 31–60 / 61–90 days, stacked by document type. */
export const expiryBuckets: ChartSpec = { id: "expiry-buckets", title: ["Documents expiring in 30 / 60 / 90 days", "الوثائق المنتهية خلال 30 / 60 / 90 يومًا"], meaning: ["Employee documents whose expiry date falls in the next 30, 31–60 and 61–90 days, by document type.", "وثائق الموظفين التي يقع تاريخ انتهائها خلال 30 يومًا و31–60 و61–90 يومًا، حسب نوع الوثيقة."], sources: ["DIGIT Document Renewal"], shape: "multi-series", view: "stacked-bar", size: { w: 8 },
  data: (c) => { const r = rows("DIGIT Document Renewal", c); if (!r) return denied("matrix");
    const due = r.filter((d) => { const x = d10(d["expiry_date"]); return x && x > c.on && x <= addDays(c.on, 90) && !/renewed|cancel/i.test(s(d["status"])); });
    const B = [[1, 30, "0–30"], [31, 60, "31–60"], [61, 90, "61–90"]] as const;
    const types = [...new Set(due.map((d) => s(d["document_type"]) || L(c, ["Other", "أخرى"])))].sort();
    const inB = (d: Doc, lo: number, hi: number) => { const k = daysBetween(c.on, d10(d["expiry_date"])); return k >= lo && k <= hi; };
    return { kind: "matrix", status: due.length ? "ok" : "empty", rowKeys: B.map((b) => b[2]), colKeys: types, values: B.map(([lo, hi]) => types.map((t) => due.filter((d) => (s(d["document_type"]) || L(c, ["Other", "أخرى"])) === t && inB(d, lo, hi)).length)), legend: "sum",
      range: L(c, [`Next 90 days from ${c.on.split("-").reverse().join("/")}`, `90 يومًا من ${c.on.split("-").reverse().join("/")}`]), drill: names("DIGIT Document Renewal", due) } as WidgetData; } };

/** 03.2 — share of marked attendance that is present, per department and day (last 14 days). */
export const attendanceHeatmap: ChartSpec = { id: "attendance-heatmap", title: ["Attendance by department and day (% present)", "الحضور حسب القسم واليوم (% حاضر)"], meaning: ["Submitted attendance of the last 14 days: present and work-from-home count fully, half day counts half, over all marked records of the department that day.", "الحضور المعتمد لآخر 14 يومًا: الحاضر والعمل عن بُعد يُحسبان كاملين ونصف اليوم بنصف، من كل السجلات المؤشرة للقسم في ذلك اليوم."], sources: ["Attendance", "Employee"], shape: "grid", view: "heatmap", size: { w: 12 },
  data: (c) => { const a = where(rows("Attendance", c), [["docstatus", "=", 1]]); const e = rows("Employee", c); if (!a || !e) return denied("matrix");
    const days = Array.from({ length: 14 }, (_, i) => addDays(c.on, i - 13)); const dep = new Map(e.map((x) => [x.name, unitLabel(s(x["department"])) || L(c, ["No department", "بدون قسم"])]));
    const sel = a.filter((x) => days.includes(d10(x["attendance_date"])));
    const deps = [...new Set(sel.map((x) => unitLabel(s(x["department"])) || dep.get(s(x["employee"])) || L(c, ["No department", "بدون قسم"])))];
    const of = (x: Doc) => unitLabel(s(x["department"])) || dep.get(s(x["employee"])) || L(c, ["No department", "بدون قسم"]);
    const score = (x: Doc) => (/^(Present|Work From Home)$/.test(s(x["status"])) ? 1 : s(x["status"]) === "Half Day" ? 0.5 : 0);
    const top = deps.map((d) => ({ d, k: sel.filter((x) => of(x) === d).length })).sort((p, q) => q.k - p.k).slice(0, 10).map((x) => x.d);
    const values = top.map((d) => days.map((day) => { const m = sel.filter((x) => of(x) === d && d10(x["attendance_date"]) === day); return m.length ? Math.round((m.reduce((t, x) => t + score(x), 0) / m.length) * 100) : 0; }));
    const all = sel.length ? Math.round((sel.reduce((t, x) => t + score(x), 0) / sel.length) * 1000) / 10 : 0;
    return { kind: "matrix", status: sel.length ? "ok" : "empty", rowKeys: top, colKeys: days.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`), values,
      insight: L(c, [`${all}% present over the 14 days (${sel.length} marked records).`, `${all}% حضور خلال 14 يومًا (${sel.length} سجلًا مؤشرًا).`]), range: `${days[0]!.split("-").reverse().join("/")} – ${days[13]!.split("-").reverse().join("/")}`, drill: names("Attendance", sel) } as WidgetData; } };

/** 06.2 — labour cost of the last 3 paid months against each project's approved labour budget lines. */
export const labourBudget: ChartSpec = { id: "labour-budget", title: ["Labour cost against the project labour budget", "تكلفة العمالة مقابل موازنة العمالة للمشروع"], meaning: ["Gross pay of the last 3 paid months split to projects (timesheet hours, else crew membership) against the Labour lines of the project's submitted cost budget.", "إجمالي رواتب آخر 3 أشهر مدفوعة موزعًا على المشاريع (ساعات سجلات الوقت، وإلا عضوية الطاقم) مقابل بنود العمالة في موازنة تكلفة المشروع المعتمدة."], sources: ["Salary Slip", "Timesheet", "Digit Crew", "Digit Project Cost Budget"], shape: "target", view: "bullet", size: { w: 6 },
  data: (c) => { const sl = where(rows("Salary Slip", c), [["docstatus", "=", 1]]); const bud = where(rows("Digit Project Cost Budget", c), [["docstatus", "=", 1]]); if (!sl || !bud) return denied();
    const cos = companiesOf(c, sl); const ms = [...new Set(sl.map((d) => d10(d["start_date"]).slice(0, 7)))].filter((m) => `${m}-01` <= c.on).sort().slice(-3);
    const cost = new Map<string, number>(); for (const co of cos) for (const m of ms) for (const a of labourAllocation(co, m)) cost.set(a.project, (cost.get(a.project) ?? 0) + n(a.amount));
    const budget = new Map<string, number>(); for (const b of bud) { const lab = ((b["lines"] as Doc[] | undefined) ?? []).filter((l) => s(l["category"]) === "Labour"); if (lab.length) budget.set(s(b["project"]), (budget.get(s(b["project"])) ?? 0) + sum(lab, "original_amount")); }
    const pjName = new Map<string, string>(); for (const p of rows("Project", c) ?? []) pjName.set(p.name, s(p["project_name"]) || p.name);
    const keys = [...new Set([...cost.keys()].filter((k) => budget.has(k)))].sort((a, b) => (cost.get(b) ?? 0) - (cost.get(a) ?? 0)).slice(0, 8);
    const pts = keys.map((k) => ({ key: k, label: pjName.get(k) ?? k, value: Math.round(cost.get(k) ?? 0), target: Math.round(budget.get(k) ?? 0), data: true, tone: (cost.get(k) ?? 0) > (budget.get(k) ?? 0) ? "bad" as const : undefined, drill: { kind: "list" as const, doctype: "Digit Project Cost Budget", filters: [["project", "=", k], ["docstatus", "=", 1]] } }));
    return { kind: "series", status: pts.length ? "ok" : "empty", valueLabel: ["Labour cost (3 months)", "تكلفة العمالة (3 أشهر)"], targetLabel: ["Labour budget", "موازنة العمالة"], points: pts, ...(pts.length ? {} : { reason: ["No project has both labour cost and a submitted labour budget line.", "لا يوجد مشروع له تكلفة عمالة وبند موازنة عمالة معتمد معًا."] }) } as WidgetData; } };

/** 04.1 — leave liability at each month-end: remaining leave days × daily wage (basic + housing ÷ 30). */
export const leaveLiability: ChartSpec = { id: "leave-liability", title: ["Leave liability by month-end", "التزام الإجازات في نهاية كل شهر"], meaning: ["At each of the last 6 month-ends: the remaining balance of every in-force allocation (leaves approved by then deducted) × the employee's daily wage (basic + housing ÷ 30) from the latest submitted slip.", "في نهاية كل شهر من آخر 6 أشهر: الرصيد المتبقي لكل تخصيص ساري (بعد خصم الإجازات المعتمدة حتى حينه) × الأجر اليومي للموظف (الأساسي + السكن ÷ 30) من آخر قسيمة معتمدة."], sources: ["Leave Allocation", "Leave Application", "Salary Slip", "Employee"], shape: "time-series", view: "area", size: { w: 6 },
  data: (c) => { const al = rows("Leave Allocation", c), ap = rows("Leave Application", c), e = rows("Employee", c); if (!al || !ap || !e) return denied();
    const ms = monthsBack(c.on, 6); const act = new Set(e.filter((x) => s(x["status"]) === "Active").map((x) => x.name));
    const pts = ms.map((m) => { const me = m === c.on.slice(0, 7) ? c.on : monthEnd(m); const bal = leaveBalances(al as never, (ap as Doc[]).filter((l) => d10(l["from_date"]) <= me) as never, me).filter((b) => act.has(b.employee) && b.balance > 0);
      const w = new Map<string, number>(); let v = 0; for (const b of bal) { if (!w.has(b.employee)) w.set(b.employee, wageOf(b.employee, me).wage / 30); v += b.balance * (w.get(b.employee) ?? 0); }
      return { key: m, label: m, value: Math.round(v), count: w.size, drill: { kind: "list" as const, doctype: "Leave Allocation", filters: [["employee", "in", [...w.keys()].join(",") || "__none__"], ["docstatus", "=", 1]] } }; });
    return { kind: "series", status: pts.some((p) => p.value) ? "ok" : "empty", valueLabel: ["Leave liability", "التزام الإجازات"], points: pts } as WidgetData; } };

/** 04.1 — gross pay per paid employee, per paid month (6 months). */
export const costPerHead: ChartSpec = { id: "cost-per-head", title: ["Payroll cost per head", "تكلفة الرواتب لكل موظف"], meaning: ["Gross pay of the submitted slips of each month divided by the distinct employees paid that month (6 months).", "إجمالي رواتب القسائم المعتمدة لكل شهر مقسومًا على عدد الموظفين المختلفين المدفوع لهم ذلك الشهر (6 أشهر)."], sources: ["Salary Slip"], shape: "time-series", view: "line", size: { w: 6 },
  data: (c) => { const sl = where(rows("Salary Slip", c), [["docstatus", "=", 1]]); if (!sl) return denied(); const ms = monthsBack(c.on, 6);
    const pts = ms.map((m) => { const r = sl.filter((d) => d10(d["start_date"]).slice(0, 7) === m); const heads = new Set(r.map((d) => s(d["employee"]))).size; return { key: m, label: m, value: heads ? Math.round(sum(r, "gross_pay") / heads) : 0, count: heads, drill: names("Salary Slip", r) }; }).filter((p) => p.count);
    return { kind: "series", status: pts.length ? "ok" : "empty", valueLabel: ["Gross pay per head", "الإجمالي لكل موظف"], points: pts } as WidgetData; } };

/** 04.1 — Enterprise Visual Round 1 §8 split card: gross and deductions of the latest payroll month, submitted slips solid and
 *  draft slips hatched, gross change against the month before and «N للمراجعة» opening the draft slips. */
export const payrollSplit: ChartSpec = { id: "payroll-split", title: ["Gross pay and deductions", "الإجمالي والاستقطاعات"], meaning: ["Salary slips of the latest payroll month up to the as-of date: submitted slips solid, draft slips hatched; the change compares submitted gross with the month before.", "قسائم رواتب آخر شهر رواتب حتى تاريخ العرض: القسائم المعتمدة مصمتة والمسودات مخططة؛ والتغير يقارن الإجمالي المعتمد بالشهر السابق."], sources: ["Salary Slip"], shape: "split", view: "split", size: { w: 6 },
  data: (c) => { const all = rows("Salary Slip", c); if (!all) return denied(); const live = all.filter((d) => Number(d["docstatus"] ?? 0) !== 2 && d10(d["start_date"]) <= c.on);
    const month = live.map((d) => d10(d["start_date"]).slice(0, 7)).sort().pop(); if (!month) return { kind: "series", status: "empty", points: [] } as WidgetData;
    const inM = (m: string) => live.filter((d) => d10(d["start_date"]).slice(0, 7) === m);
    const cur = inM(month), sub = cur.filter((d) => Number(d["docstatus"]) === 1), draft = cur.filter((d) => Number(d["docstatus"] ?? 0) === 0);
    const prevM = monthsBack(`${month}-01`, 2)[0]!, prev = inM(prevM); // the delta compares the same figure as the big value: submitted + draft gross
    const g = sum(sub, "gross_pay"), gd = sum(draft, "gross_pay"), dd = sum(sub, "total_deduction"), ddd = sum(draft, "total_deduction"), gp = sum(prev, "gross_pay");
    const money = (v: number) => fmtCurrency(v, "SAR");
    return { kind: "series", status: g + gd ? "ok" : "empty", valueLabel: ["Amount", "المبلغ"], unitLabel: ["SAR", "ريال سعودي"],
      points: [{ key: "gross", label: L(c, ["Gross pay", "الإجمالي"]), value: g, pending: gd, display: money(g), pendingDisplay: money(gd), count: sub.length, drill: names("Salary Slip", cur) },
        { key: "deductions", label: L(c, ["Deductions", "الاستقطاعات"]), value: dd, pending: ddd, display: money(dd), pendingDisplay: money(ddd), count: sub.length, drill: names("Salary Slip", cur) }],
      split: { display: money(g + gd), ...(g + gd ? { pct: { value: ((dd + ddd) / (g + gd)) * 100, label: ["of gross deducted", "من الإجمالي استقطاعات"] } } : {}),
        ...(gp ? { delta: { pct: Math.round(((g + gd - gp) / gp) * 1000) / 10, vs: prevM.split("-").reverse().join("/"), better: "up" } } : {}),
        ...(draft.length ? { review: { count: draft.length, drill: names("Salary Slip", draft) } } : {}) },
      insight: L(c, [`${month.split("-").reverse().join("/")}: ${sub.length} submitted slips, ${draft.length} drafts.`, `${month.split("-").reverse().join("/")}: ${sub.length} قسيمة معتمدة و${draft.length} مسودة.`]) } as WidgetData; } };

/** Section id → the R3 charts added after its own charts. */
export const R3_EXTRA: Record<string, ChartSpec[]> = {
  "06.1": [joinersLeavers], "04.3": [saudizationGauge], "01.6": [expiryBuckets], "03.2": [attendanceHeatmap], "06.2": [labourBudget], "04.1": [payrollSplit, leaveLiability, costPerHead],
};
