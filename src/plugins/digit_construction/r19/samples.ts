/**
 * R19 sample records for the DocTypes the R19 import added (virtual preview only; never exported as Frappe fixtures).
 * Ported from the supplied source's opt-in demo seeders — setup/seed_dept03_demo.py (risks, RFIs, submittals,
 * inspections, defects, punch items, handover, baselines, lookaheads, scenarios) and setup/seed_demo.py (change
 * events, EOT, commercial claim, back charge, bid package and bids, subcontract final account, cost codes) — and
 * re-pointed at the existing fictional DCC demo company and projects. Values the source left to the server (dates
 * relative to "today", ball-in-court users) are fixed demo dates around the existing October 2026 demo period.
 * Added beyond the source seeders (all fictional, labelled demo): RFI sent / answer dates, the second (open) commercial
 * claim, bid package prices, the back charge amount, the finishing final account value (= its work order value) and the
 * English cost-code descriptions.
 * Explicit names, insert-if-missing through seed.ts put/putComputed, so user edits are never overwritten.
 * No record here feeds an existing read model (cost, commercial, cash), so existing figures do not change.
 */
type Rec = [string, string, Record<string, unknown>];

export function r19Samples(C: string, P: Record<"A" | "B" | "C", { name: string; cc: string }>): Rec[] {
  const r: Rec[] = [];
  const K = ["A", "B", "C"] as const;
  const owner = { owner: "qs@dcc.test" };
  // ---- 01-02 risks (seed_dept03_demo RISKS_TEMPLATE: title, category, impact, probability, potential cost, probability %, days, response, mitigation)
  const RISKS: [string, string, number, number, number, number, number, string, string][] = [
    ["تأخر توريد حديد التسليح", "Supply", 4, 4, 180000, 40, 21, "Mitigate", "تأمين مصدر بديل للمورد؛ الطلب المبكر بـ8 أسابيع"],
    ["تعديلات تصميمية متأخرة من الاستشاري", "Technical", 5, 3, 350000, 30, 45, "Avoid", "تجميد التصميم قبل بدء الأعمال الهيكلية؛ جلسات مراجعة أسبوعية مع الاستشاري"],
    ["ارتفاع أسعار الخرسانة الجاهزة", "Commercial", 3, 4, 95000, 50, 0, "Accept", "تحديد سعر بعقد إطاري مع المورد لمدة 6 أشهر"],
    ["غياب الموارد البشرية المتخصصة", "Schedule", 4, 3, 120000, 35, 30, "Transfer", "التعاقد مع شركة توريد عمالة؛ إدراج غرامة عدم التوريد في العقد"],
    ["حوادث سلامة محتملة في منطقة الحفر", "HSE", 5, 2, 500000, 20, 0, "Mitigate", "تطبيق خطة سلامة الحفر؛ تعيين مشرف سلامة مخصص"],
  ];
  K.forEach((k, pi) => RISKS.forEach(([title, category, imp, prob, cost, pct, days, response, mitigation], i) =>
    r.push(["Digit Risk", `RISK-2026-${String(pi * 5 + i + 1).padStart(4, "0")}`, { title, project: P[k].name, company: C, category, impact_score: String(imp), probability_score: String(prob), risk_score: imp * prob,
      potential_cost: cost, probability_pct: pct, cost_exposure: Math.round(cost * pct) / 100, time_days: days, response, mitigation, workflow_state: "Active", owner_user: "pm@dcc.test", due_date: "2026-11-20", owner: "pm@dcc.test" }])));
  // ---- 01-01 portfolio scenarios (company level, submittable; drafts as in the source)
  r.push(["Digit Portfolio Scenario", "SCEN-2026-0001", { title: "سيناريو الأساس 2026 — الخطة الفعلية", plan_year: 2026, company: C, workflow_state: "Draft", docstatus: 0, total_revenue: 85000000, total_cost: 68000000, total_margin_pct: 20, peak_negative_cash: -12000000, decision_note: "الخطة الأساسية بناءً على المشاريع المتعاقد عليها حالياً دون توسع.", owner: "director@dcc.test" }]);
  r.push(["Digit Portfolio Scenario", "SCEN-2026-0002", { title: "سيناريو النمو 2026 — إضافة مشروعين جديدين", plan_year: 2026, company: C, workflow_state: "Draft", docstatus: 0, total_revenue: 130000000, total_cost: 100000000, total_margin_pct: 23, peak_negative_cash: -25000000, decision_note: "يتضمن مشروعين جديدين محتملين في مرحلة التسعير. يتطلب تمويلاً إضافياً لسد الفجوة النقدية.", owner: "director@dcc.test" }]);
  // ---- 02-01 baselines and two lookahead weeks per project
  K.forEach((k, i) => {
    r.push(["Digit Schedule Baseline", `BSL-2026-000${i + 1}`, { project: P[k].name, company: C, baseline_name: `خط الأساس الأصلي — ${P[k].name}`, baseline_type: "Project", status: "Active", captured_on: "2026-03-01", owner: "pm@dcc.test" }]);
    r.push(["Digit Lookahead", `LAH-2026-000${i * 2 + 1}`, { project: P[k].name, company: C, week_start: "2026-10-19", week_end: "2026-10-25", status: "Submitted", ppc: 82.5, owner: "site@dcc.test" }]);
    r.push(["Digit Lookahead", `LAH-2026-000${i * 2 + 2}`, { project: P[k].name, company: C, week_start: "2026-10-26", week_end: "2026-11-01", status: "Draft", ppc: 0, owner: "site@dcc.test" }]);
  });
  // ---- 02-03 RFIs (3 per project) and submittals (2 per project)
  const RFIS: [string, string, string][] = [
    ["تفاصيل حديد تسليح السلم الرئيسي", "تطلب تفسيراً لتفاصيل قضبان السلم في مخططات الهيكل الإنشائي. تعارض ظاهر مع المواصفات النموذجية.", "Open"],
    ["طبقة العزل الحراري للسقف المستوي", "المواصفة تذكر XPS 60mm بينما الرسم يوضح EPS 80mm. أيهما يُطبّق؟", "Answered"],
    ["تنسيق مسارات الكابلات الكهربائية مع المنظومة الميكانيكية", "يوجد تعارض أفقي بين مسار الكوابل الكهربائية والقنوات الهوائية في الطابق الثالث.", "Open"],
  ];
  const rfi = (pi: number, i: number) => `RFI-2026-${String(pi * 3 + i + 1).padStart(4, "0")}`;
  K.forEach((k, pi) => RFIS.forEach(([subject, question, state], i) => r.push(["Digit RFI", rfi(pi, i), { project: P[k].name, company: C, subject, question, workflow_state: state, sent_on: `2026-10-0${1 + i * 3}`,
    due_date: `2026-10-${String(8 + i * 3).padStart(2, "0")}`, ball_in_court: "pm@dcc.test", cost_impact: i === 1 ? "Yes" : "TBD",
    ...(state === "Answered" ? { answered_on: "2026-10-09", answered_by: "pm@dcc.test", official_response: "يُعتمد XPS بسماكة 60 مم حسب المواصفة؛ يُحدَّث الرسم في الإصدار القادم." } : {}), owner: "site@dcc.test" }])));
  const SUBS: [string, string][] = [["مواصفة مواد العزل الحراري للسقف", "Material"], ["عينة بلاط الأرضيات — الطابق الأرضي", "Sample"]];
  K.forEach((k, pi) => SUBS.forEach(([title, submittal_type], i) => r.push(["Digit Submittal", `SUB-2026-${String(pi * 2 + i + 1).padStart(4, "0")}`, { project: P[k].name, company: C, title, submittal_type, workflow_state: "Draft", revision: 0, owner: "site@dcc.test" }])));
  // ---- 02-04 inspections, defects / NCR, punch items, handover packages
  K.forEach((k, pi) => {
    [["Pass", "Submitted", "2026-10-17"], ["Fail", "Draft", "2026-10-18"]].forEach(([outcome, state, date], i) =>
      r.push(["Digit Inspection", `INS-2026-${String(pi * 2 + i + 1).padStart(4, "0")}`, { project: P[k].name, company: C, inspector: "site@dcc.test", inspection_date: date, workflow_state: state, outcome, owner: "site@dcc.test" }]));
    [["تشققات في لياسة الجدران الداخلية — الطابق الثاني", "Major", "Defect"], ["انحراف طبقة البايبس عن المحاور المحددة في التصميم", "Minor", "NCR"]].forEach(([description, severity, category], i) =>
      r.push(["Digit Defect", `DEF-2026-${String(pi * 2 + i + 1).padStart(4, "0")}`, { project: P[k].name, company: C, description, severity, category, status: "Open", due_date: "2026-10-31", assigned_to: "site@dcc.test", owner: "site@dcc.test" }]));
    [["مدخل المبنى الرئيسي", "دهانات الجدار الخارجي غير مكتملة في الركن الشمالي"], ["السلم الخدمي — الطابق 3-4", "حديد درابزين السلم غير مثبّت حسب الرسم"], ["مصطبة المداخل الجانبية", "بلاط الأرصفة يحتاج تقويماً في المستوى"]].forEach(([location, description], i) =>
      r.push(["Digit Punch Item", `PUN-2026-${String(pi * 3 + i + 1).padStart(4, "0")}`, { project: P[k].name, company: C, location, description, assigned_to: "site@dcc.test", status: "Open", owner: "site@dcc.test" }]));
    r.push(["Digit Handover Package", `HNP-2026-000${pi + 1}`, { project: P[k].name, company: C, package_name: `حزمة التسليم — ${P[k].name}`, status: "Draft", owner: "pm@dcc.test" }]);
  });
  // ---- 04-03 change events on the flagship contract (seed_demo CHANGE_EVENTS: title, RFI, cost, days, reached state)
  const CES: [string, number, number, number, string][] = [
    ["تعديل تسليح السلم الرئيسي حسب رد الاستشاري", 0, 85000, 6, "Approved"],
    ["إضافة عزل حراري للسقف المستوي", 1, 142000, 10, "Pricing Requested"],
    ["إعادة توجيه مسارات الكابلات مع المنظومة الميكانيكية", 2, 38000, 0, "Under Review"],
  ];
  CES.forEach(([title, ri, cost, days, state], i) => r.push(["Digit Change Event", `CE-2026-0000${i + 1}`, { title, project: P.A.name, company: C, contract: P.A.cc, ce_date: "2026-09-15", source_type: "RFI", source_rfi: rfi(0, ri),
    workflow_state: state, scope: "Out of Scope", cost_impact: cost, time_impact_days: days, raised_by: "qs@dcc.test", ...(state === "Approved" ? { decided_by: "pm@dcc.test", decided_on: "2026-09-25" } : {}), ...(state === "Pricing Requested" ? { pricing_sent_on: "2026-09-28", pricing_due_on: "2026-10-12" } : {}),
    lines: [{ idx: 1, line_key: "L1", description: title.slice(0, 120), cost_code: "CC-02.02", direction: "Addition", amount: cost }], ...owner }]));
  // ---- 04-04 extension of time and commercial claim (partially granted / partially agreed in the source)
  r.push(["Digit EOT", "EOT-2026-00001", { title: "تمديد مدة بسبب تأخر اعتماد تسليح السلم", contract: P.A.cc, project: P.A.name, company: C, eot_date: "2026-09-20", workflow_state: "Partially Granted", requested_days: 30, granted_days: 20,
    partial_grant_note: "منحت 20 يومًا؛ 10 أيام متزامنة مع تأخر المقاول", decision_note: "منح جزئي: 20 من 30 يومًا", decided_by: "pm@dcc.test", decided_on: "2026-10-05", raised_by: "qs@dcc.test",
    basis: `تأخر رد الاستشاري على ${rfi(0, 0)} وما ترتب عليه من إعادة تنفيذ`, delay_events: [{ idx: 1, event_ref: "DE-01", description: "انتظار رد الاستشاري على تسليح السلم", delay_category: "Employer Risk", start_date: "2026-08-10", end_date: "2026-09-08", days_affected: 30 }], ...owner }]);
  r.push(["Digit Commercial Claim", "CCL-2026-00001", { title: "مطالبة تكاليف التأخير — تسليح السلم", contract: P.A.cc, project: P.A.name, company: C, claim_category: "Delay and Disruption", workflow_state: "Partially Agreed", event_date: "2026-08-10", notice_date: "2026-08-20",
    claimed_amount: 120000, assessed_amount: 90000, agreed_amount: 75000, time_claimed_days: 30, source_change_event: "CE-2026-00001", basis: "تكاليف إطالة مدة الموقع والمعدات خلال فترة انتظار الرد",
    decision_note: "قُبلت تكاليف المعدات؛ رُفضت تكاليف الإدارة العامة", decided_by: "pm@dcc.test", decided_on: "2026-10-08", ...owner }]);
  // one open claim on the delayed project (added beyond the source seed so the open-claim views have a row)
  r.push(["Digit Commercial Claim", "CCL-2026-00002", { title: "مطالبة تأخر صرف المستخلص الثاني", contract: P.B.cc, project: P.B.name, company: C, claim_category: "Payment Delay", workflow_state: "Under Assessment", event_date: "2026-09-01", notice_date: "2026-09-10",
    claimed_amount: 46000, time_claimed_days: 0, basis: "تأخر العميل في صرف المستخلص الثاني 45 يومًا عن موعد الاستحقاق التعاقدي", ...owner }]);
  // ---- 03-04 one finishing bid package with three invitees and their bids
  const items: [string, string, string, number, number][] = [["FIN-01", "لياسة داخلية", "m²", 5200, 28], ["FIN-02", "دهان داخلي", "m²", 5200, 18], ["FIN-03", "بلاط أرضيات بورسلين", "m²", 1800, 95]];
  const bidders: [string, number][] = [["DCC-SUB-FIN", 1], ["DCC-SUB-BLOCK", 1.08], ["DCC-SUB-MEP", 0.97]];
  r.push(["Digit Bid Package", "BPK-2026-0001", { company: C, project: P.B.name, trade: "Finishing", due_date: "2026-11-05", status: "Open", owner: "procurement@dcc.test",
    items: items.map(([item_key, description, uom, qty], i) => ({ idx: i + 1, item_key, description, uom, qty })),
    invitees: bidders.map(([supplier], i) => ({ idx: i + 1, supplier, invited_on: "2026-10-06", response: i < 2 ? "Submitted" : "Will Bid" })) }]);
  bidders.slice(0, 2).forEach(([supplier, f], i) => {
    const lines = items.map(([item_key, , , qty, rate], n) => ({ idx: n + 1, item_key, qty, unit_rate: Math.round(rate * f * 100) / 100, amount: Math.round(qty * rate * f * 100) / 100, included: 1 }));
    r.push(["Digit Subcontract Bid", `SBD-2026-000${i + 1}`, { bid_package: "BPK-2026-0001", supplier, submitted_on: "2026-10-20", validity_days: 90, total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, lines, owner: "procurement@dcc.test" }]);
  });
  // ---- 05-04 back charge on the blockwork work order and the completed finishing work order's final account
  r.push(["Digit Back Charge", "BC-2026-00001", { project: P.A.name, company: C, work_order: "SWO-2026-0001", subcontractor: "DCC-SUB-BLOCK", charge_type: "Defect Rectification", workflow_state: "Approved", defect: "DEF-2026-0001",
    description: "إصلاح تشققات لياسة الطابق الثاني على حساب مقاول البلوك", amount: 8500, deduction_date: "2026-10-15", cost_code: "CC-03.01", raised_by: "qs@dcc.test", approved_by: "pm@dcc.test", approved_on: "2026-10-16", ...owner }]);
  r.push(["Digit Subcontract Final Account", "SFA-2026-00001", { work_order: "SWO-2026-0004", project: P.C.name, subcontractor: "DCC-SUB-FIN", company: C, workflow_state: "Under Review", total_wo_value: 536800, final_amount: 536800,
    settlement_note: "الحساب الختامي لأعمال التشطيبات الداخلية — قيد المراجعة", ...owner }]);
  // ---- 06-02 cost code master for the codes the demo budgets already use
  ([["CC-01.01", "Excavation and backfill", "الحفر والردم", "Subcontract"], ["CC-02.01", "Foundation concrete", "خرسانة الأساسات", "Materials"], ["CC-02.02", "Structural concrete", "خرسانة الهيكل", "Materials"],
    ["CC-03.01", "Blockwork", "البلوك", "Subcontract"], ["CC-04.01", "Mechanical and electrical", "الكهروميكانيك", "Subcontract"], ["CC-05.01", "Plaster and paint", "اللياسة والدهان", "Subcontract"],
    ["CC-06.01", "Finishes", "التشطيبات", "Subcontract"], ["CC-07.01", "External works", "الأعمال الخارجية", "Subcontract"], ["CC-90", "Site overheads", "مصاريف الموقع العامة", "Preliminary"]] as const)
    .forEach(([code, description, description_ar, category]) => r.push(["Digit Cost Code", code, { code, description, description_ar, category, is_active: "Yes", is_group: 0, owner: "Administrator" }]));
  return r;
}
