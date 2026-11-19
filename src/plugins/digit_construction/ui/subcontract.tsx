/** QS review & certification of measurement books (SUB-04/05): accept/reject per entry with reasons, work-order remaining quantity, then Certify or Return through the workflow. */
import { useEffect, useState } from "react";
import { notifySaved } from "./notify";
import { localizeRuleMessage } from "../i18n/ruleMessages";
import { adapter, DocValidationError } from "@/lib/adapter";
import type { PluginPageProps } from "@/plugins/pages";
import { entryQuantity, num, r3, reviewProblem } from "../domain/calc";
import { list, rows } from "../domain/data";
import { projectTitle } from "../domain/data";
import { certifiedToDate } from "../domain/hooks";
import { constructionProjects } from "../domain/queues";
import * as S from "../domain/services";
import { ActionButton, DocRef, Empty, Field, Filters, hasRole, inputCls, Note, PageHeader, PolicyGate, Section, StateBadge, useCx, money, qty, BTN } from "./kit";
import { WorkflowActions } from "./workflowActions";
import { useRouterState, useNavigate } from "@tanstack/react-router";

type Entry = Record<string, unknown>;
export function QsReviewPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const [project, setProject] = useState("");
  const [state, setState] = useState("Submitted");
  const books = list("Digit Measurement Book", (b) => (!state || b["workflow_state"] === state) && (!project || b["project"] === project)).sort((a, b) => String(a["mb_date"]).localeCompare(String(b["mb_date"])));
  const sel = String(search["book"] ?? books[0]?.name ?? "");
  const choose = (b: string) => void nav({ to: "/plugins/$name/$", params: { name: "digit_construction", _splat: "sub/review" }, search: { book: b } as never, replace: true });
  return (
    <div className="w-full min-w-0" data-page="construction-qs-review">
      <PageHeader title={t("QS review & certification", "مراجعة الكميات والاعتماد")} crumbs={[{ label: t("Subcontracts", "مقاولو الباطن"), to: "dept/sub" }]}
        subtitle={t("Accepted + rejected must equal each measured quantity; rejections need a reason; certified totals cannot exceed the work-order quantity.", "يجب أن يساوي المقبول + المرفوض الكمية المقاسة؛ والرفض يتطلب سبباً؛ ولا يتجاوز المعتمد كمية أمر العمل.")} />
      <Filters>
        <Field label={t("Project", "المشروع")}><select className={inputCls} value={project} onChange={(e) => setProject(e.target.value)}><option value="">{t("All", "الكل")}</option>{constructionProjects().map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></Field>
        <Field label={t("Status", "الحالة")}><select className={inputCls} value={state} onChange={(e) => setState(e.target.value)}><option value="">{t("All", "الكل")}</option>{["Draft", "Submitted", "Returned", "Certified"].map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
      </Filters>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Section title={t("Measurement books", "دفاتر القياس")}>
          {!books.length ? <Empty>{t("No books in this status", "لا دفاتر بهذه الحالة")}</Empty> : (
            <ul className="space-y-1" role="listbox" aria-label={t("Measurement books", "دفاتر القياس")}>
              {books.map((b) => <li key={b.name}><button type="button" role="option" aria-selected={b.name === sel} onClick={() => choose(b.name)} className={`w-full rounded px-2 py-1.5 text-start text-sm hover:bg-muted ${b.name === sel ? "bg-muted font-medium" : ""}`}>
                <div className="flex items-center justify-between gap-2"><span data-no-i18n>{b.name}</span><StateBadge state={b["workflow_state"]} /></div>
                <div className="truncate text-xs text-muted-foreground" data-no-i18n>{String(b["work_order"])} · {String(b["mb_date"] ?? "")}</div>
              </button></li>)}
            </ul>
          )}
        </Section>
        {sel && adapter.get("Digit Measurement Book", sel) ? <BookReview key={sel} name={sel} /> : <Empty>{t("Select a measurement book", "اختر دفتر قياس")}</Empty>}
      </div>
    </div>
  );
}

function BookReview({ name }: { name: string }) {
  const { t, ar } = useCx();
  const book = adapter.get("Digit Measurement Book", name)!;
  const wo = adapter.get("Digit Subcontract Work Order", String(book["work_order"]));
  const [entries, setEntries] = useState<Entry[]>(() => rows(book, "entries").map((e) => ({ ...e })));
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => { setEntries(rows(adapter.get("Digit Measurement Book", name), "entries").map((e) => ({ ...e }))); }, [name, book["modified"]]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = book["workflow_state"] === "Submitted" && hasRole("Digit QS");
  const done = wo ? certifiedToDate(wo.name, book.name) : new Map<string, number>();
  const set = (i: number, k: string, v: unknown) => setEntries(entries.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const problems = entries.map((e) => { const q = entryQuantity(e); return e["accepted_qty"] === undefined || e["accepted_qty"] === "" || e["accepted_qty"] === null ? null : reviewProblem(q, num(e["accepted_qty"]), num(e["rejected_qty"]), e["reject_reason"]); });
  const save = () => {
    try { adapter.update("Digit Measurement Book", name, { entries, reviewed_by: adapter.get("Digit Measurement Book", name)?.["reviewed_by"] || "" }); setErrors([]); notifySaved(t("Review saved", "تم حفظ المراجعة")); }
    catch (e) { setErrors(e instanceof DocValidationError ? e.errors : [(e as Error).message]); }
  };
  const acceptAll = () => setEntries(entries.map((e) => ({ ...e, accepted_qty: Math.abs(entryQuantity(e)), rejected_qty: 0 })));
  const bill = list("Digit Subcontractor Bill", (b) => b["measurement_book"] === name && Number(b.docstatus) !== 2)[0];
  return (
    <div>
      <Section title={<span><DocRef doctype="Digit Measurement Book" name={name} /> · <DocRef doctype="Digit Subcontract Work Order" name={book["work_order"]} /></span>}
        actions={<><StateBadge state={book["workflow_state"]} />{editable && <><button type="button" className={BTN.secondary} onClick={acceptAll}>{t("Accept all as measured", "قبول الكل كما قيس")}</button><button type="button" className={BTN.secondary} onClick={save}>{t("Save review", "حفظ المراجعة")}</button></>}<WorkflowActions doctype="Digit Measurement Book" name={name} onDone={() => setErrors([])} /></>}>
        {book["return_reason"] && book["workflow_state"] === "Returned" ? <Note tone="warn">{t("Returned: ", "أُعيد: ")}<span data-no-i18n>{String(book["return_reason"])}</span></Note> : null}
        {errors.length > 0 && <Note tone="bad"><ul className="list-disc ps-5">{errors.map((e) => <li key={e} data-no-i18n>{localizeRuleMessage(e, ar)}</li>)}</ul></Note>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead><tr className="border-b border-border text-xs text-muted-foreground">
              {[t("Line", "البند"), t("Location", "الموقع"), t("Measured", "المقاس"), t("Accepted", "المقبول"), t("Rejected", "المرفوض"), t("Reject reason", "سبب الرفض"), t("WO qty", "كمية الأمر"), t("Certified before", "المعتمد سابقاً"), t("Remaining", "المتبقي")].map((h) => <th key={h} scope="col" className="px-2 py-1.5 text-start font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {entries.map((e, i) => {
                const l = rows(wo, "lines").find((x) => x["line_key"] === e["wo_line_key"]); const before = done.get(String(e["wo_line_key"])) ?? 0;
                const p = problems[i];
                return (
                  <tr key={i} className={`border-b border-border/60 ${p ? "bg-destructive/5" : ""}`}>
                    <td className="px-2 py-1.5"><div data-no-i18n>{String(l?.["scope"] ?? e["description"] ?? "")}</div><div className="text-xs text-muted-foreground" data-no-i18n>{String(e["wo_line_key"])}{e["is_deduction"] ? ` · ${t("deduction", "خصم")}` : ""}</div></td>
                    <td className="px-2 py-1.5" data-no-i18n>{String(e["location"] ?? "")}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums" data-no-i18n>{qty(entryQuantity(e))}</td>
                    <td className="px-2 py-1.5"><input aria-label={t("Accepted", "المقبول")} type="number" min={0} step="any" disabled={!editable} className={`${inputCls} w-24 text-end`} value={e["accepted_qty"] === undefined || e["accepted_qty"] === null ? "" : String(e["accepted_qty"])} onChange={(ev) => set(i, "accepted_qty", ev.target.value === "" ? "" : Number(ev.target.value))} /></td>
                    <td className="px-2 py-1.5"><input aria-label={t("Rejected", "المرفوض")} type="number" min={0} step="any" disabled={!editable} className={`${inputCls} w-24 text-end`} value={e["rejected_qty"] === undefined || e["rejected_qty"] === null ? "" : String(e["rejected_qty"])} onChange={(ev) => set(i, "rejected_qty", ev.target.value === "" ? 0 : Number(ev.target.value))} /></td>
                    <td className="px-2 py-1.5"><input aria-label={t("Reject reason", "سبب الرفض")} disabled={!editable} className={`${inputCls} w-56`} value={String(e["reject_reason"] ?? "")} onChange={(ev) => set(i, "reject_reason", ev.target.value)} />{p && <div className="text-xs text-destructive">{p === "reconcile" ? t("accepted + rejected ≠ measured", "المقبول + المرفوض ≠ المقاس") : p === "reason" ? t("reason required", "السبب مطلوب") : t("negative quantity", "كمية سالبة")}</div>}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums" data-no-i18n>{qty(l?.["qty"])}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums" data-no-i18n>{qty(before)}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums" data-no-i18n>{qty(r3(num(l?.["qty"]) - before))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("Accepted value", "القيمة المقبولة")}: <span data-no-i18n>{money(book["accepted_value"])}</span> · {t("Certify submits the book; certified quantities then feed the next subcontractor bill.", "الاعتماد يرسل الدفتر؛ وتغذي الكميات المعتمدة المستخلص التالي.")}</p>
      </Section>
      {book["workflow_state"] === "Certified" && wo && (
        <Section title={t("Billing", "الفوترة")}>
          <PolicyGate keys={["P5"]} />
          {bill ? <p className="text-sm">{t("Bill", "المستخلص")}: <DocRef doctype="Digit Subcontractor Bill" name={bill.name} /> <StateBadge state={bill["workflow_state"]} /></p>
            : hasRole("Digit QS", "Digit Project Manager") ? <ActionButton primary label={t("Create subcontractor bill", "إنشاء مستخلص مقاول")} run={() => S.createBill(wo.name, name)} /> : <p className="text-sm text-muted-foreground">{t("Not billed yet", "لم يُفوتر بعد")}</p>}
        </Section>
      )}
    </div>
  );
}
