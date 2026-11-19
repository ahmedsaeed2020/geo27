/**
 * DIGIT Enterprise shared fixed-asset controls screen (Part B): custody approval, physical verification, impairment,
 * category change + templates, work in progress and shift allocation. Logic lives in src/lib/coreShared/assetControls.ts
 * and src/lib/assets.ts; this screen only reads them and calls their actions, as the signed-in user.
 */
import { useState } from "react";
import { DateInput } from "@/components/form/DateInput";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType, useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import { submitDocument, cancelDocument } from "@/lib/documentApi";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import * as AC from "@/lib/coreShared/assetControls";
import { bookValue, scheduleOf, shiftFactors } from "@/lib/assets";
import { EntFrame } from "./Surfaces";
import { GoToAction, Bar, CompanySelect, Denied, DocLink, Field, Kpi, Table, money, pick, today, tr, useCompany, useT } from "./FinanceDesk";

type Tab = "custody" | "verification" | "value" | "wip" | "shifts";
const cur = (company: string) => String(adapter.get("Company", company)?.["default_currency"] ?? "SAR");
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const can = (dt: string, p: "create" | "write" | "submit" | "cancel", user: string, d?: Doc) => { const m = cachedMeta(dt); return !!m && hasPerm(m, p, d, user); };
const assetLabel = (a: Doc | undefined) => (a ? `${s(a["asset_name"]) || a.name}` : "");
const empLabel = (id: string) => s(adapter.get("Employee", id)?.["employee_name"]) || id;
const say = (ar: boolean, r: { ok: boolean; reason?: [string, string] }, okEn: string, okAr: string) => { if (r.ok) toast.success(ar ? okAr : okEn); else toast.error(pick(ar, r.reason!)); };
const STATUS_AR: Record<string, string> = { Requested: "بانتظار الاعتماد", Approved: "معتمدة", Rejected: "مرفوضة", Returned: "مُعادة", Verified: "تم التحقق", Damaged: "تالف", Missing: "مفقود", "Location differs": "في موقع آخر", "Not verified": "لم يُجرد" };
const tone = (st: string) => (["Approved", "Verified"].includes(st) ? "ok" : ["Rejected", "Missing", "Damaged", "Location differs"].includes(st) ? "bad" : "draft");
function Chip({ st }: { st: string }) { const { ar } = useT(); return <span className={`ent-qv-status ent-qv-tone-${tone(st)}`} data-asset-state={st}>{ar ? STATUS_AR[st] ?? st : st}</span>; }
function AssetSelect({ company, value, onChange, id }: { company: string; value: string; onChange: (v: string) => void; id: string }) {
  const { t } = useT();
  return <select className="field-input" value={value} onChange={(e) => onChange(e.target.value)} data-asset-pick={id}><option value="">{t("Choose an asset", "اختر أصلًا")}</option>
    {AC.companyAssets(company).map((a) => <option key={a.name} value={a.name} data-no-i18n>{assetLabel(a)} · {a.name}</option>)}</select>;
}
const locations = () => adapter.list("Location").map((l) => l.name).sort();

/* ------------------------------------------------------------------ custody ------------------------------------------------------------------ */
function CustodyTab({ company }: { company: string }) {
  const { ar, t } = useT(); const user = useSessionUser();
  const [asset, setAsset] = useState(""); const [emp, setEmp] = useState(""); const [from, setFrom] = useState(today()); const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(""); const [reason, setReason] = useState("");
  const emps = adapter.list("Employee").filter((e) => (!e["company"] || s(e["company"]) === company) && (!e["status"] || e["status"] === "Active")).sort((a, b) => empLabel(a.name).localeCompare(empLabel(b.name)));
  const list = AC.custodyOf(company).slice(0, 60); const pol = n(adapter.get(CORE_DT.controlPolicy, company)?.["custody_approval_required"]);
  const request = () => { const r = AC.requestCustody(asset, emp, from, user, note); say(ar, r, "Custody requested; it waits for approval.", "طُلبت العهدة وهي بانتظار الاعتماد."); if (r.ok) { setAsset(""); setEmp(""); setNote(""); } };
  return <div className="space-y-3">
    <EntFrame id="custody-new" title={t("Hand an asset to an employee", "تسليم أصل لموظف")} note={pol ? t("Custody approval is on for this company: the asset moves to the employee only after someone other than the requester approves.", "اعتماد العهدة مفعّل لهذه الشركة: لا ينتقل الأصل إلى الموظف إلا بعد اعتماد شخص غير مقدّم الطلب.") : t("Custody approval is off in the company control policy; requests are still recorded and approved here.", "اعتماد العهدة غير مفعّل في سياسة الرقابة؛ تُسجل الطلبات وتُعتمد هنا مع ذلك.")}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("Asset", "الأصل")}><AssetSelect company={company} value={asset} onChange={setAsset} id="custody" /></Field>
        <Field label={t("Employee", "الموظف")}><select className="field-input" value={emp} onChange={(e) => setEmp(e.target.value)} data-custody-employee><option value="">{t("Choose an employee", "اختر موظفًا")}</option>{emps.map((e) => <option key={e.name} value={e.name} data-no-i18n>{empLabel(e.name)}</option>)}</select></Field>
        <Field label={t("From", "من تاريخ")}><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t("Remarks", "ملاحظات")}><input className="field-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <button type="button" className="btn-primary" data-custody-request disabled={!asset || !emp} onClick={request}>{t("Request custody", "طلب عهدة")}</button>
      </div>
    </EntFrame>
    <EntFrame id="custody-list" title={t("Custody requests and holders", "طلبات العهدة والحائزون")}>
      {list.length ? <div className="max-h-[26rem] overflow-auto"><Table id="custody-rows" head={[t("Asset", "الأصل"), t("Employee", "الموظف"), t("From", "من"), t("To", "إلى"), t("Status", "الحالة"), t("Approver", "المعتمد"), t("Movement", "الحركة"), ""]}>
        {list.map((d) => { const st = s(d["status"]); const m = st === "Requested" ? AC.mayApproveCustody(d, user) : { ok: false as const };
          return <tr key={d.name} className={tr} data-custody-row={d.name} data-status={st}>
            <td className="p-2"><DocLink dt="Asset" name={s(d["asset"])}>{assetLabel(adapter.get("Asset", s(d["asset"])))}</DocLink></td><td className="p-2" data-no-i18n>{empLabel(s(d["custodian"]))}</td>
            <td className="p-2 tabular-nums" data-no-i18n>{s(d["from_date"])}</td><td className="p-2 tabular-nums" data-no-i18n>{s(d["to_date"]) || "—"}</td><td className="p-2"><Chip st={st} /></td>
            <td className="p-2 text-xs" data-no-i18n>{s(d["approver"]) || "—"}</td><td className="p-2 text-xs">{d["asset_movement"] ? <DocLink dt="Asset Movement" name={s(d["asset_movement"])} /> : "—"}</td>
            <td className="p-2"><div className="flex flex-wrap gap-1">
              {m.ok && rejecting !== d.name && <><button type="button" className="btn-primary" data-custody-approve={d.name} onClick={() => { const r = AC.decideCustody(d.name, "Approved", user); say(ar, r, "Approved; the asset is now in the employee's custody.", "اعتُمدت؛ الأصل الآن في عهدة الموظف."); }}>{t("Approve", "اعتماد")}</button>
                <button type="button" className="btn-ghost" data-custody-reject={d.name} onClick={() => { setRejecting(d.name); setReason(""); }}>{t("Reject", "رفض")}</button></>}
              {rejecting === d.name && <><input className="field-input" placeholder={t("Reason", "السبب")} value={reason} onChange={(e) => setReason(e.target.value)} data-custody-reason />
                <button type="button" className="btn-ghost" onClick={() => { const r = AC.decideCustody(d.name, "Rejected", user, reason); say(ar, r, "Request rejected.", "رُفض الطلب."); if (r.ok) setRejecting(""); }}>{t("Confirm", "تأكيد")}</button></>}
              {st === "Approved" && !d["to_date"] && can("Asset Movement", "submit", user) && <button type="button" className="btn-ghost" data-custody-return={d.name} onClick={() => { const r = AC.returnCustody(d.name, today(), user); say(ar, r, "Asset returned to its location.", "أعيد الأصل إلى موقعه."); }}>{t("Return", "إرجاع")}</button>}
            </div></td>
          </tr>; })}
      </Table></div> : <p className="text-sm text-muted-foreground">{t("No custody requests yet.", "لا توجد طلبات عهدة بعد.")}</p>}
    </EntFrame>
  </div>;
}

/* ------------------------------------------------------------------ verification ------------------------------------------------------------------ */
function VerificationTab({ company }: { company: string }) {
  const { ar, t } = useT(); const user = useSessionUser();
  const [loc, setLoc] = useState(""); const [open, setOpen] = useState(""); const [result, setResult] = useState<AC.VerifyResult>("Found"); const [found, setFound] = useState(""); const [notes, setNotes] = useState("");
  const round = AC.verificationRound(company, today(), loc); const count = (st: AC.VerifyState) => round.filter((r) => r.state === st).length;
  const mayRecord = can(CORE_DT.assetVerification, "create", user);
  const save = (asset: string) => { const r = AC.recordVerification(asset, result, { location: found, notes }, user);
    if (r.ok) { toast.success(r.follow ? t(`Recorded; ${r.follow.name} prepared for follow-up.`, `سُجل؛ وجُهز ${r.follow.name} للمتابعة.`) : t("Recorded.", "سُجل.")); setOpen(""); setNotes(""); setFound(""); } else toast.error(pick(ar, r.reason)); };
  const RESULTS: [AC.VerifyResult, string][] = [["Found", "موجود"], ["Found - Damaged", "موجود وتالف"], ["Missing", "مفقود"], ["Location differs", "في موقع آخر"]];
  return <div className="space-y-3">
    <Bar><Field label={t("Location", "الموقع")}><select className="field-input" value={loc} onChange={(e) => setLoc(e.target.value)} data-verify-location><option value="">{t("All locations", "كل المواقع")}</option>{locations().map((l) => <option key={l} value={l} data-no-i18n>{l}</option>)}</select></Field>
      <div className="flex flex-wrap gap-2 text-xs">{(["Verified", "Damaged", "Missing", "Location differs", "Not verified"] as AC.VerifyState[]).map((st) => <span key={st} className="ek-chip" data-verify-count={st}><Chip st={st} /> <bdi className="tabular-nums" data-no-i18n>{count(st)}</bdi></span>)}</div></Bar>
    <EntFrame id="verify-round" title={t("Physical verification round", "جولة الجرد الفعلي")} note={t("Each asset in use with its latest count inside the company's verification window. A different location prepares a transfer; damaged or missing opens a correction task.", "كل أصل قيد الاستخدام مع آخر جرد له ضمن فترة الجرد في الشركة. الموقع المختلف يجهز حركة نقل؛ والتالف أو المفقود يفتح مهمة تصحيح.")}>
      {round.length ? <div className="max-h-[30rem] overflow-auto"><Table id="verify-rows" head={[t("Asset", "الأصل"), t("Location", "الموقع"), t("Custodian", "صاحب العهدة"), t("Last count", "آخر جرد"), t("Result", "النتيجة"), ""]}>
        {round.map(({ asset, last, state }) => <tr key={asset.name} className={tr} data-verify-row={asset.name} data-state={state}>
          <td className="p-2"><DocLink dt="Asset" name={asset.name}>{assetLabel(asset)}</DocLink></td><td className="p-2 text-xs" data-no-i18n>{s(asset["location"]) || "—"}</td>
          <td className="p-2 text-xs" data-no-i18n>{asset["custodian"] ? empLabel(s(asset["custodian"])) : "—"}</td><td className="p-2 tabular-nums text-xs" data-no-i18n>{s(last?.["verified_on"]) || "—"}</td><td className="p-2"><Chip st={state} /></td>
          <td className="p-2">{mayRecord && (open === asset.name ? <div className="flex flex-wrap items-center gap-1">
            <select className="field-input" value={result} onChange={(e) => setResult(e.target.value as AC.VerifyResult)} data-verify-result>{RESULTS.map(([v, a]) => <option key={v} value={v}>{ar ? a : v}</option>)}</select>
            {result === "Location differs" && <select className="field-input" value={found} onChange={(e) => setFound(e.target.value)} data-verify-found><option value="">{t("Found at…", "وُجد في…")}</option>{locations().filter((l) => l !== s(asset["location"])).map((l) => <option key={l} value={l} data-no-i18n>{l}</option>)}</select>}
            {result !== "Found" && <input className="field-input" placeholder={t("What was found", "ما الذي وُجد")} value={notes} onChange={(e) => setNotes(e.target.value)} data-verify-notes />}
            <button type="button" className="btn-primary" data-verify-save={asset.name} onClick={() => save(asset.name)}>{t("Save", "حفظ")}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen("")}>{t("Close", "إغلاق")}</button>
          </div> : <button type="button" className="btn-ghost" data-verify-open={asset.name} onClick={() => { setOpen(asset.name); setResult("Found"); setFound(""); setNotes(""); }}>{t("Record count", "تسجيل الجرد")}</button>)}</td>
        </tr>)}
      </Table></div> : <p className="text-sm text-muted-foreground">{t("No assets in use here.", "لا توجد أصول قيد الاستخدام هنا.")}</p>}
    </EntFrame>
  </div>;
}

/* ------------------------------------------------------------------ value: impairment, category change, templates ------------------------------------------------------------------ */
function ValueTab({ company }: { company: string }) {
  const { ar, t } = useT(); const user = useSessionUser(); const c = cur(company);
  const [ia, setIa] = useState(""); const [rec, setRec] = useState(""); const [ca, setCa] = useState(""); const [cat, setCat] = useState(""); const [why, setWhy] = useState("");
  const imps = adapter.list(CORE_DT.assetImpairment).filter((d) => s(d["company"]) === company && n(d.docstatus) !== 2).sort((a, b) => s(b["impairment_date"]).localeCompare(s(a["impairment_date"]))).slice(0, 20);
  const bv = ia ? bookValue(ia) : 0; const loss = ia && rec !== "" ? Math.max(bv - n(rec), 0) : 0;
  const plan = ca && cat ? AC.categoryChangePlan(ca, cat) : null; const cats = adapter.list("Asset Category").map((x) => x.name).sort();
  const tpls = adapter.list(CORE_DT.assetCategoryTemplate).sort((a, b) => a.name.localeCompare(b.name));
  const draftImp = () => {
    if (!can(CORE_DT.assetImpairment, "create", user)) { toast.error(t("You may not record impairments.", "لا يحق لك تسجيل انخفاض القيمة.")); return; }
    const d = adapter.insertDoc(CORE_DT.assetImpairment, { asset: ia, company, impairment_date: today(), recoverable_amount: n(rec), docstatus: 0, owner: user });
    toast.success(t(`Impairment ${d.name} prepared; submit it to book the loss.`, `جُهز انخفاض القيمة ${d.name}؛ اعتمده لترحيل الخسارة.`)); setIa(""); setRec("");
  };
  const meta = cachedMeta(CORE_DT.assetImpairment);
  return <div className="space-y-3">
    <div className="grid gap-3 lg:grid-cols-2">
      <EntFrame id="impairment-test" title={t("Impairment test", "اختبار انخفاض القيمة")} note={t("When the recoverable amount is below the book value, the difference is booked as an impairment loss through an asset value adjustment.", "إذا كان المبلغ القابل للاسترداد أقل من القيمة الدفترية تُرحَّل الفروقات خسارة انخفاض قيمة عبر تعديل قيمة الأصل.")}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("Asset", "الأصل")}><AssetSelect company={company} value={ia} onChange={setIa} id="impairment" /></Field>
          <Field label={t("Recoverable amount", "المبلغ القابل للاسترداد")}><input type="number" min={0} className="field-input" value={rec} onChange={(e) => setRec(e.target.value)} data-impairment-recoverable /></Field>
          <button type="button" className="btn-primary" data-impairment-draft disabled={!ia || rec === "" || !(loss > 0)} onClick={draftImp}>{t("Prepare impairment", "تجهيز انخفاض القيمة")}</button>
        </div>
        {ia && <dl className="mt-3 grid grid-cols-2 gap-2 text-sm" data-impairment-preview><dt className="text-muted-foreground">{t("Book value", "القيمة الدفترية")}</dt><dd className="tabular-nums" data-no-i18n>{money(bv, c)}</dd>
          <dt className="text-muted-foreground">{t("Impairment loss", "خسارة انخفاض القيمة")}</dt><dd className="tabular-nums font-semibold" data-no-i18n>{money(loss, c)}</dd></dl>}
        {imps.length > 0 && <div className="mt-3 max-h-60 overflow-auto"><Table id="impairment-rows" head={[t("Asset", "الأصل"), t("Date", "التاريخ"), t("Loss", "الخسارة"), t("Status", "الحالة"), ""]}>
          {imps.map((d) => <tr key={d.name} className={tr} data-impairment-row={d.name}><td className="p-2"><DocLink dt={CORE_DT.assetImpairment} name={d.name}>{assetLabel(adapter.get("Asset", s(d["asset"])))}</DocLink></td>
            <td className="p-2 tabular-nums" data-no-i18n>{s(d["impairment_date"])}</td><td className="p-2 tabular-nums" data-no-i18n>{money(n(d["impairment_loss"]), c)}</td>
            <td className="p-2"><span className={`ent-qv-status ent-qv-tone-${n(d.docstatus) === 1 ? "ok" : "draft"}`}>{n(d.docstatus) === 1 ? t("Booked", "مرحّل") : t("Draft", "مسودة")}</span></td>
            <td className="p-2">{meta && n(d.docstatus) === 0 && hasPerm(meta, "submit", d, user) && <button type="button" className="btn-ghost" data-impairment-submit={d.name} onClick={() => { const e = submitDocument(meta, d.name, user); if (e.length) toast.error(e.join("\n")); else toast.success(t("Impairment booked.", "رُحّل انخفاض القيمة.")); }}>{t("Book", "ترحيل")}</button>}
              {meta && n(d.docstatus) === 1 && hasPerm(meta, "cancel", d, user) && <button type="button" className="btn-ghost" data-impairment-cancel={d.name} onClick={() => { const e = cancelDocument(meta, d.name, user); if (e.length) toast.error(e.join("\n")); else toast.success(t("Impairment reversed.", "أُلغي انخفاض القيمة.")); }}>{t("Reverse", "إلغاء")}</button>}</td></tr>)}
        </Table></div>}
      </EntFrame>
      <EntFrame id="category-change" title={t("Change an asset's category", "تغيير فئة أصل")} note={t("One action: a journal entry moves the cost and accumulated depreciation to the new category's accounts, then the category is set.", "إجراء واحد: قيد يومية ينقل التكلفة ومجمع الإهلاك إلى حسابات الفئة الجديدة ثم تُعيَّن الفئة.")}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("Asset", "الأصل")}><AssetSelect company={company} value={ca} onChange={setCa} id="category" /></Field>
          <Field label={t("New category", "الفئة الجديدة")}><select className="field-input" value={cat} onChange={(e) => setCat(e.target.value)} data-category-new><option value="">{t("Choose a category", "اختر فئة")}</option>{cats.map((x) => <option key={x} value={x} data-no-i18n>{x}</option>)}</select></Field>
          <Field label={t("Reason", "السبب")}><input className="field-input" value={why} onChange={(e) => setWhy(e.target.value)} data-category-reason /></Field>
          <button type="button" className="btn-primary" data-category-apply disabled={!plan || plan.errors.length > 0} onClick={() => { const r = AC.changeCategory(ca, cat, today(), why, user); say(ar, r, "Category changed.", "غُيّرت الفئة."); if (r.ok) { setCa(""); setCat(""); setWhy(""); } }}>{t("Change category", "تغيير الفئة")}</button>
        </div>
        {plan && (plan.errors.length ? <p className="mt-2 text-xs text-destructive" data-category-error>{pick(ar, plan.errors[0]!)}</p> : <div className="mt-3" data-category-plan={plan.lines.length}>
          {plan.lines.length ? <Table id="category-lines" head={[t("Account", "الحساب"), t("Debit", "مدين"), t("Credit", "دائن")]}>{plan.lines.map((l, i) => <tr key={i} className={tr}><td className="p-2 text-xs" data-no-i18n>{l.account}</td><td className="p-2 tabular-nums" data-no-i18n>{l.debit ? money(l.debit, c) : ""}</td><td className="p-2 tabular-nums" data-no-i18n>{l.credit ? money(l.credit, c) : ""}</td></tr>)}</Table>
            : <p className="text-xs text-muted-foreground">{t("Both categories use the same accounts: only the category changes.", "الفئتان تستخدمان الحسابات نفسها: تتغير الفئة فقط.")}</p>}
        </div>)}
      </EntFrame>
    </div>
    <EntFrame id="category-templates" title={t("Category templates", "قوالب الفئات")} note={t("A template stamps standard depreciation and accounts onto its category for this company, filling only what the category lacks. New assets then take the category's depreciation rows.", "يضبط القالب الإهلاك والحسابات القياسية لفئته في هذه الشركة، ويملأ ما ينقص الفئة فقط. تأخذ الأصول الجديدة بعدها صفوف إهلاك الفئة.")}>
      {tpls.length ? <Table id="template-rows" head={[t("Template", "القالب"), t("Category", "الفئة"), t("Method", "الطريقة"), t("Depreciations", "عدد الأقساط"), t("Every (months)", "كل (شهر)"), ""]}>
        {tpls.map((x) => <tr key={x.name} className={tr} data-template-row={x.name}><td className="p-2"><DocLink dt={CORE_DT.assetCategoryTemplate} name={x.name} /></td><td className="p-2 text-xs" data-no-i18n>{s(x["asset_category"])}</td>
          <td className="p-2 text-xs">{s(x["depreciation_method"]) || "Straight Line"}</td><td className="p-2 tabular-nums" data-no-i18n>{n(x["total_number_of_depreciations"])}</td><td className="p-2 tabular-nums" data-no-i18n>{n(x["frequency_of_depreciation"]) || 1}</td>
          <td className="p-2"><button type="button" className="btn-ghost" data-template-apply={x.name} onClick={() => { const r = AC.applyTemplate(x.name, company, user); say(ar, r, "Template applied to the category.", "طُبق القالب على الفئة."); }}>{t("Apply to category", "تطبيق على الفئة")}</button></td></tr>)}
      </Table> : <p className="text-sm text-muted-foreground">{t("No category templates yet.", "لا توجد قوالب فئات بعد.")}</p>}
    </EntFrame>
  </div>;
}

/* ------------------------------------------------------------------ work in progress ------------------------------------------------------------------ */
function WipTab({ company }: { company: string }) {
  const { ar, t } = useT(); const user = useSessionUser(); const c = cur(company); const q = AC.cwipQueue(company); const am = cachedMeta("Asset");
  const capitalise = (name: string) => { if (!am) return; const e = submitDocument(am, name, user); if (e.length) toast.error(e.join("\n")); else toast.success(t("Capitalised from work in progress.", "رُسمل من الأعمال تحت التنفيذ.")); };
  return <div className="space-y-3">
    <EntFrame id="cwip-lines" title={t("Capital work in progress", "أعمال رأسمالية تحت التنفيذ")} note={t("Invoice lines for asset items in work-in-progress categories book to the work-in-progress account; submitting the asset moves the amount to the fixed asset account.", "تُرحَّل سطور فواتير بنود الأصول في فئات الأعمال تحت التنفيذ إلى حسابها؛ واعتماد الأصل ينقل المبلغ إلى حساب الأصل الثابت.")}
      actions={<span className="text-sm" data-cwip-balance={q.balance}>{t("Balance", "الرصيد")}: <bdi className="tabular-nums font-semibold" data-no-i18n>{money(q.balance, c)}</bdi></span>}>
      {q.lines.length ? <div className="max-h-[26rem] overflow-auto"><Table id="cwip-rows" head={[t("Invoice", "الفاتورة"), t("Date", "التاريخ"), t("Item", "الصنف"), t("Amount", "المبلغ"), t("Asset", "الأصل"), ""]}>
        {q.lines.map((l) => <tr key={`${l.invoice}-${l.idx}`} className={tr} data-cwip-line={`${l.invoice}:${l.idx}`}>
          <td className="p-2"><DocLink dt="Purchase Invoice" name={l.invoice} /></td><td className="p-2 tabular-nums" data-no-i18n>{l.date}</td><td className="p-2 text-xs" data-no-i18n>{l.itemName}</td><td className="p-2 tabular-nums" data-no-i18n>{money(l.amount, c)}</td>
          <td className="p-2 text-xs">{l.asset ? <><DocLink dt="Asset" name={l.asset.name} /> <span className={`ent-qv-status ent-qv-tone-${n(l.asset["booked_fixed_asset"]) ? "ok" : "draft"}`}>{n(l.asset["booked_fixed_asset"]) ? t("Capitalised", "مُرسمل") : t("Draft", "مسودة")}</span></> : "—"}</td>
          <td className="p-2">{!l.asset && can("Asset", "create", user) && <button type="button" className="btn-ghost" data-cwip-create={`${l.invoice}:${l.idx}`} onClick={() => { const r = AC.assetFromCwip(l.invoice, l.idx, user); say(ar, r, "Draft asset prepared.", "جُهز أصل مسودة."); }}>{t("Create asset", "إنشاء أصل")}</button>}
            {l.asset && n(l.asset.docstatus) === 0 && am && hasPerm(am, "submit", l.asset, user) && <button type="button" className="btn-primary" data-cwip-capitalise={l.asset.name} onClick={() => capitalise(l.asset!.name)}>{t("Capitalise", "رسملة")}</button>}</td>
        </tr>)}
      </Table></div> : <p className="text-sm text-muted-foreground" data-cwip-empty>{t("No invoice lines are waiting on work in progress.", "لا توجد سطور فواتير على الأعمال تحت التنفيذ.")}</p>}
    </EntFrame>
  </div>;
}

/* ------------------------------------------------------------------ shifts ------------------------------------------------------------------ */
function ShiftsTab({ company }: { company: string }) {
  const { t } = useT(); const user = useSessionUser(); const f = shiftFactors();
  const shiftAssets = AC.companyAssets(company).map((a) => ({ a, sch: adapter.list("Asset Depreciation Schedule").find((x) => s(x["asset"]) === a.name && n(x.docstatus) !== 2 && n(x["shift_based"])) })).filter((x) => x.sch);
  const allocate = (asset: string) => { if (!can("Asset Shift Allocation", "create", user)) { toast.error(t("You may not allocate shifts.", "لا يحق لك توزيع الورديات.")); return; }
    const sch = scheduleOf(asset, ""); const d = adapter.insertDoc("Asset Shift Allocation", { asset, company, finance_book: s(sch?.["finance_book"]), docstatus: 0, owner: user });
    toast.success(t(`${d.name} prepared with the current rows: change the shifts of open rows and submit it.`, `جُهز ${d.name} بالصفوف الحالية: غيّر ورديات الصفوف المفتوحة ثم اعتمده.`)); };
  return <div className="grid gap-3 lg:grid-cols-2">
    <EntFrame id="shift-assets" title={t("Shift based depreciation", "الإهلاك حسب الورديات")} note={t("Each open row books its share of the depreciable amount by its shift factor; booked rows never change.", "يرحّل كل صف مفتوح حصته من المبلغ القابل للإهلاك حسب معامل ورديته؛ ولا تتغير الصفوف المرحّلة.")}>
      {shiftAssets.length ? <Table id="shift-rows" head={[t("Asset", "الأصل"), t("Rows", "الصفوف"), t("Next open shift", "وردية الصف المفتوح التالي"), ""]}>
        {shiftAssets.map(({ a, sch }) => { const rows = (sch!["depreciation_schedule"] as Doc[] | undefined) ?? []; const next = rows.find((r) => !r["journal_entry"]);
          return <tr key={a.name} className={tr} data-shift-asset={a.name}><td className="p-2"><DocLink dt="Asset" name={a.name}>{assetLabel(a)}</DocLink></td><td className="p-2 tabular-nums" data-no-i18n>{rows.length}</td>
            <td className="p-2 text-xs">{s(next?.["shift"]) || "—"}</td><td className="p-2"><button type="button" className="btn-ghost" data-shift-allocate={a.name} onClick={() => allocate(a.name)}>{t("Allocate shifts", "توزيع الورديات")}</button></td></tr>; })}
      </Table> : <p className="text-sm text-muted-foreground">{t("No asset uses shift based depreciation yet. Tick Shift Based on the asset's finance book row.", "لا يوجد أصل يستخدم الإهلاك حسب الورديات بعد. فعّل «حسب الورديات» في صف دفتر التمويل للأصل.")}</p>}
    </EntFrame>
    <EntFrame id="shift-factors" title={t("Shift factors", "معاملات الورديات")}>
      {f.size ? <Table id="shift-factor-rows" head={[t("Shift", "الوردية"), t("Factor", "المعامل"), t("Default", "الافتراضي")]}>
        {[...f].map(([k, v]) => <tr key={k} className={tr} data-shift-factor={k}><td className="p-2"><DocLink dt="Asset Shift Factor" name={k}>{k}</DocLink></td><td className="p-2 tabular-nums" data-no-i18n>{v}</td><td className="p-2">{n(adapter.get("Asset Shift Factor", k)?.["default"]) ? "✓" : ""}</td></tr>)}
      </Table> : <p className="text-sm text-muted-foreground">{t("No shift factors yet.", "لا توجد معاملات ورديات بعد.")}</p>}
    </EntFrame>
  </div>;
}

export function AssetControlsPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany();
  useScopeMetas(["Asset", "Asset Movement", "Asset Category", "Asset Value Adjustment", "Asset Depreciation Schedule", "Asset Shift Allocation", "Asset Shift Factor", "Employee", "Location", "Journal Entry", "Purchase Invoice",
    CORE_DT.assetCustody, CORE_DT.assetVerification, CORE_DT.assetImpairment, CORE_DT.assetCategoryTemplate, CORE_DT.correctionTask, CORE_DT.controlPolicy]);
  const [tab, setTab] = useState<Tab>("custody");
  if (!canReadType("Asset")) return <Denied />;
  const round = AC.verificationRound(c.company, today()); const waiting = AC.custodyOf(c.company).filter((d) => d["status"] === "Requested").length;
  const findings = round.filter((r) => r.state !== "Verified" && r.state !== "Not verified").length; const q = AC.cwipQueue(c.company);
  const booked = adapter.list(CORE_DT.assetImpairment).filter((d) => s(d["company"]) === c.company && n(d.docstatus) === 1);
  const TABS: [Tab, string, string][] = [["custody", "Custody", "العهدة"], ["verification", "Physical verification", "الجرد الفعلي"], ["value", "Value & category", "القيمة والفئة"], ["wip", "Work in progress", "تحت التنفيذ"], ["shifts", "Shifts", "الورديات"]];
  return <div className="space-y-3" data-asset-controls>
    <div role="tablist" className="ek-tabs" aria-label={t("Asset controls", "ضوابط الأصول")}>{TABS.map(([id, en, a]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className="ek-tab" data-asset-tab={id} onClick={() => setTab(id)}>{ar ? a : en}</button>)}</div>
    <Bar><CompanySelect c={c} /><GoToAction to='[data-ent-frame="custody-new"]' data-asset-custody-go>{t("Hand an asset to an employee", "تسليم أصل لموظف")}</GoToAction></Bar>
    <div className="flex flex-wrap gap-2">
      <Kpi id="asset-custody-waiting" label={t("Custody requests waiting", "طلبات عهدة بانتظار الاعتماد")} value={String(waiting)} />
      <Kpi id="asset-not-verified" label={t("Assets not verified", "أصول لم تُجرد")} value={String(round.filter((r) => r.state === "Not verified").length)} sub={t(`of ${round.length} in use`, `من ${round.length} قيد الاستخدام`)} />
      <Kpi id="asset-findings" label={t("Count findings", "ملاحظات الجرد")} value={String(findings)} {...(findings ? { tone: "bad" } : {})} />
      <Kpi id="asset-impairment" label={t("Impairment booked", "انخفاض قيمة مرحّل")} value={money(booked.reduce((a, d) => a + n(d["impairment_loss"]), 0), cur(c.company))} sub={t(`${booked.length} test(s)`, `${booked.length} اختبار`)} />
      <Kpi id="asset-cwip" label={t("Work in progress", "أعمال تحت التنفيذ")} value={money(q.balance, cur(c.company))} sub={t(`${q.lines.filter((l) => !l.asset || !n(l.asset["booked_fixed_asset"])).length} line(s) to capitalise`, `${q.lines.filter((l) => !l.asset || !n(l.asset["booked_fixed_asset"])).length} سطر للرسملة`)} />
    </div>
    <div role="tabpanel" data-asset-panel={tab}>
      {tab === "custody" && <CustodyTab company={c.company} />}
      {tab === "verification" && <VerificationTab company={c.company} />}
      {tab === "value" && <ValueTab company={c.company} />}
      {tab === "wip" && <WipTab company={c.company} />}
      {tab === "shifts" && <ShiftsTab company={c.company} />}
    </div>
  </div>;
}
