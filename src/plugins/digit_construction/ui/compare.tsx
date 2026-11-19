/**
 * Comparison boards on the shared Enterprise ComparisonColumns (owner interface round 2026-11-16, idea 5):
 *  - RfqComparison: request for quotation ↔ supplier quotations (comparison page WS-07-02 and the RFQ form), with
 *    «رسّي» under each column (full award, or the remaining lines once a line is awarded) and a split award that puts
 *    each line on the quotation picked for it (services.ts awardQuotationLines, one draft purchase order per supplier);
 *  - BidLevelingBoard: bid package ↔ subcontract bids on the bid leveling form (WS-03-04); «رسّي» under a column sets the
 *    awarded subcontractor and runs the workflow Award transition, so the leveling rule (reason when not the lowest,
 *    no self-award) decides exactly as on the form.
 * Display and dispatch only — figures come from domain/quoteBoard.ts, writes from services.ts and the workflow engine.
 */
import { useState } from "react";
import { adapter } from "@/lib/adapter";
import { activeWorkflow, applyWorkflow, transitionsFor } from "@/lib/workflow";
import { ComparisonColumns, type CmpBadge, type CmpColumn } from "@/components/enterprise/kit/ComparisonColumns";
import { bidBoard, cellKey, rfqBoard, splitPlan, type MuteReason, type RfqBoard } from "../domain/quoteBoard";
import { list } from "../domain/data";
import * as S from "../domain/services";
import type { Result } from "../domain/services";
import { ActionButton, amount, BTN, dateTxt, DocRef, hasRole, useCx } from "./kit";
import { notifyError, notifySaved } from "./notify";

const MUTE: Record<MuteReason, [string, string]> = {
  draft: ["Draft — not comparable", "مسودة — غير قابل للمقارنة"], excluded: ["Excluded", "مستبعد"], expired: ["Expired", "انتهت الصلاحية"], hold: ["Supplier on hold", "المورد موقوف"],
  "no-offer": ["No offer", "لم يقدّم عرضًا"], "non-compliant": ["Not qualified — compliance expired", "غير مؤهل — امتثال منتهٍ"], "no-profile": ["No prequalification profile", "لا يوجد ملف تأهيل"],
};
const Legend = ({ t }: { t: (en: string, ar: string) => string }) => <>
  <span><b className="text-success-text">■</b> {t("Lowest price of the line among qualified offers", "أقل سعر للبند بين العروض المؤهلة")}</span>
  <span>▨ {t("Not priced — compared at the highest other price (plug)", "غير مسعّر — يُقارن بأعلى سعر آخر (تعويض)")}</span>
  <span>{t("Grey column: not comparable (draft, expired, excluded or not qualified)", "العمود الرمادي: غير قابل للمقارنة (مسودة أو منتهٍ أو مستبعد أو غير مؤهل)")}</span>
</>;

export function RfqComparison({ rfq, compact }: { rfq: string; compact?: boolean }) {
  const { t, ar } = useCx();
  const [split, setSplit] = useState(false);
  const [picks, setPicks] = useState<{ rfq: string; at: Record<string, string> }>({ rfq, at: {} });
  const at = picks.rfq === rfq ? picks.at : {};
  const b: RfqBoard = rfqBoard(rfq);
  const canAward = !compact && hasRole("Digit Procurement Officer");
  const open = b.lines.filter((l) => !l.awarded);
  const splitOk = canAward && open.length > 0 && b.cols.some((c) => c.submitted);
  const plan = split ? splitPlan(b, at) : [];
  const best = b.cols.find((c) => c.cheapest);
  const remaining = (q: string) => open.filter((l) => b.cells.get(cellKey(l.item_code, q))?.rate !== null).map((l) => l.item_code);
  const columns: CmpColumn[] = b.cols.map((c) => {
    const badges: CmpBadge[] = [];
    if (c.submitted && !c.complete) badges.push({ hue: "amber", label: t(`${c.plugs} line(s) not priced`, `ناقص ${c.plugs}`) });
    if (c.excluded && c.exclusion_reason) badges.push({ hue: "quiet", label: c.exclusion_reason });
    const rest = remaining(c.quotation);
    const footer = <div className="flex flex-col items-center gap-1">
      {c.pos.map((p) => <span key={p} className="text-xs"><span className="text-success-text">✓ {t("Awarded", "مُرسى")}</span> <DocRef doctype="Purchase Order" name={p} /></span>)}
      {canAward && c.submitted && rest.length > 0
        ? <ActionButton primary={c.cheapest && !split} label={c.pos.length || b.anyAwarded ? t(`Award ${rest.length} remaining line(s)`, `رسّي ${rest.length} بند متبقٍ`) : t("Award", "رسّي")}
          run={() => (b.anyAwarded ? S.awardQuotationLines(c.quotation, rest) : S.createPurchaseOrderFromQuotation(c.quotation))} />
        : !c.submitted ? <span className="text-xs text-muted-foreground">{t("submit the quotation first", "اعتمد العرض أولاً")}</span>
        : !c.pos.length && canAward && !rest.length ? <span className="text-xs text-muted-foreground">{t("every line is awarded", "كل البنود مرساة")}</span> : null}
    </div>;
    return { key: c.quotation, title: <span data-no-i18n>{c.supplier_name}</span>,
      sub: <span className="flex flex-col"><DocRef doctype="Supplier Quotation" name={c.quotation} />{c.valid_till && <span data-no-i18n>{t("Valid till", "صالح حتى")} {dateTxt(c.valid_till)}</span>}</span>,
      total: <span data-no-i18n>{amount(c.quoted)}</span>,
      totalNote: !c.submitted ? undefined : !c.complete ? <span className="text-warning-text" data-no-i18n>{t("incomplete", "غير مكتمل")} · {t("with plugs", "مع التعويض")} {amount(c.leveled)}</span> : undefined,
      rank: c.rank, best: c.cheapest, muted: c.mute ? t(...MUTE[c.mute]) : undefined, badges, footer };
  });
  return (
    <div className="grid gap-2" data-rfq-board={rfq}>
      {splitOk && <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={split ? BTN.primary : BTN.secondary} aria-pressed={split} onClick={() => setSplit(!split)} data-split-toggle>
          {split ? t("Split award: on", "الترسية المجزأة: مفعّلة") : t("Split award by line", "ترسية مجزأة حسب البند")}</button>
        {split && <span className="text-xs text-muted-foreground">{t("Pick one offer per line; each supplier gets one draft purchase order with its lines.", "اختر عرضًا لكل بند؛ يحصل كل مورد على مسودة أمر شراء واحدة ببنوده.")}</span>}
      </div>}
      <ComparisonColumns ar={ar} rowHead={t("Item", "الصنف")} qtyHead={t("Qty", "الكمية")} totalLabel={t("Total (before tax)", "الإجمالي (قبل الضريبة)")} actionLabel={canAward ? t("Award", "الترسية") : undefined}
        rows={b.lines.map((l) => ({ key: l.item_code, label: <span data-no-i18n>{l.item_name || l.item_code}</span>, sub: <DocRef doctype="Item" name={l.item_code} />, qty: amount(l.qty), awarded: !!l.awarded }))}
        columns={columns}
        cell={(row, col) => {
          const x = b.cells.get(cellKey(row, col)); const l = b.lines.find((y) => y.item_code === row)!; const c = b.cols.find((y) => y.quotation === col)!;
          if (!x) return { display: "—" };
          const chosen = (at[row] ?? l.pick) === col;
          return { display: x.rate !== null ? <span data-no-i18n>{amount(x.rate)}</span> : t("not quoted", "لم يُسعّر"), best: x.best, plugged: x.plugged, missing: x.rate === null,
            awarded: x.awardedHere ? <>✓ <DocRef doctype="Purchase Order" name={l.awarded?.po} /></> : undefined,
            ...(split && !l.awarded && x.rate !== null && c.submitted ? { picked: chosen, onPick: () => setPicks({ rfq, at: { ...at, [row]: col } }), pickLabel: t("Award this line to this offer", "رسّي هذا البند على هذا العرض") } : {}) };
        }}
        legend={<Legend t={t} />} attrs={{ "data-cmp-kind": "rfq" }} />
      {split && <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm" data-split-plan={plan.map((p) => `${p.quotation}:${p.items.length}`).join(",")}>
        <span className="font-semibold">{t("Split award", "الترسية المجزأة")}</span>
        {plan.length ? plan.map((p) => { const c = b.cols.find((x) => x.quotation === p.quotation)!; return <span key={p.quotation} className="rounded-full bg-muted px-2 py-0.5" data-no-i18n>{c.supplier_name} · {t(`${p.items.length} line(s)`, `${p.items.length} بند`)} · {amount(p.amount)}</span>; })
          : <span className="text-muted-foreground">{t("No line picked", "لم يُختر أي بند")}</span>}
        <span className="ms-auto">
          <ActionButton primary open={false} label={t("Award the picked lines", "رسّي البنود المختارة")} disabled={!plan.length} reason={t("Pick a line first", "اختر بندًا أولاً")}
            run={(): Result => { const rs = plan.map((p) => S.awardQuotationLines(p.quotation, p.items)); const bad = rs.filter((r) => !r.ok);
              return bad.length ? { ok: false, errors: bad.flatMap((r) => r.errors) } : { ok: true, doctype: "Purchase Order", name: rs.map((r) => r.name).join("، "), errors: [] }; }}
            onDone={() => { setSplit(false); setPicks({ rfq, at: {} }); }} />
        </span>
      </div>}
      {best && <p className="text-xs text-muted-foreground">{t("Cheapest qualified quotation", "أرخص عرض مؤهل")}: <bdi data-no-i18n>{best.supplier_name} · {best.quotation} ({amount(best.leveled)})</bdi>. {t("Awarding a higher quotation is allowed; record the justification on the Purchase Order.", "يمكن ترسية عرض أعلى مع تسجيل المبرر على أمر الشراء.")}</p>}
    </div>
  );
}

export function BidLevelingBoard({ name, dirty }: { name: string; dirty?: boolean }) {
  const { t, ar } = useCx();
  const lev = adapter.get("Digit Bid Leveling", name);
  if (!lev || !lev["bid_package"]) return null;
  const b = bidBoard(lev);
  if (!b.cols.length) return null;
  const w = activeWorkflow("Digit Bid Leveling");
  const award = !dirty && w ? transitionsFor(w, lev).find((x) => x.next_state === "Awarded") : undefined;
  const state = String(lev["workflow_state"] ?? "Draft");
  const low = b.cols.find((c) => c.cheapest);
  const wo = state === "Awarded" ? adapter.get("Digit Subcontract Work Order", `SWO-${name}`) ?? list("Digit Subcontract Work Order", (d) => d["source_event"] === name && Number(d.docstatus) !== 2)[0] : undefined;
  const run = (supplier: string) => {
    const lowest = b.cols.filter((c) => c.leveled !== null).sort((x, y) => (x.leveled as number) - (y.leveled as number))[0]?.supplier;
    let reason = String(lev["award_reason"] ?? "");
    if (supplier !== lowest && !reason.trim()) {
      const r = window.prompt(t("Award reason (this bidder is not the lowest leveled total)", "سبب الترسية (هذا العرض ليس الأقل بعد المقارنة)"), "");
      if (r === null) return; if (!r.trim()) { notifyError(t("A reason is required", "السبب مطلوب")); return; } reason = r.trim();
    }
    const prev = { awarded_supplier: lev["awarded_supplier"] ?? "", award_reason: lev["award_reason"] ?? "" };
    try { adapter.update("Digit Bid Leveling", name, { awarded_supplier: supplier, award_reason: reason }); } catch (e) { notifyError((e as Error).message); return; }
    const errs = applyWorkflow("Digit Bid Leveling", name, award!.action);
    if (errs.length) { try { adapter.update("Digit Bid Leveling", name, prev); } catch { /* keep the refusal visible */ } notifyError(t("Action not completed", "لم يكتمل الإجراء"), { description: errs.join("\n") }); return; }
    notifySaved(t("Awarded — a draft subcontract work order was opened", "تمت الترسية — فُتحت مسودة أمر عمل مقاول باطن"));
  };
  const columns: CmpColumn[] = b.cols.map((c) => ({
    key: c.supplier, title: <span data-no-i18n>{String(adapter.get("Supplier", c.supplier)?.["supplier_name"] ?? c.supplier)}</span>,
    sub: <span className="flex flex-col"><DocRef doctype="Supplier" name={c.supplier} />{c.bid ? <DocRef doctype="Digit Subcontract Bid" name={c.bid} /> : null}{c.valid_until && <span data-no-i18n>{t("Valid till", "صالح حتى")} {dateTxt(c.valid_until)}</span>}</span>,
    total: c.leveled === null ? "—" : <span data-no-i18n>{amount(c.leveled)}</span>,
    totalNote: c.leveled !== null && c.plugs ? <span className="text-warning-text" data-no-i18n>{t("submitted", "المقدّم")} {amount(c.submitted_total)} · {t(`${c.plugs} plug(s)`, `${c.plugs} تعويض`)}</span> : undefined,
    rank: c.rank, best: c.cheapest, muted: c.mute ? t(...MUTE[c.mute]) : undefined,
    badges: c.compliance === "Expiring" ? [{ hue: "amber", label: t("Compliance expiring", "امتثال ينتهي قريبًا") }] : c.compliance === "Compliant" ? [{ hue: "emerald", label: t("Qualified", "مؤهل") }] : [],
    footer: c.awarded ? <span className="text-xs"><span className="text-success-text">✓ {t("Awarded", "مُرسى")}</span>{wo && <> · <DocRef doctype="Digit Subcontract Work Order" name={wo.name} /></>}</span>
      : award && c.leveled !== null ? <button type="button" className={c.cheapest ? BTN.primary : BTN.secondary} onClick={() => run(c.supplier)} data-award={c.supplier}>{t("Award", "رسّي")}</button>
      : state === "Draft" && c.leveled !== null ? <span className="text-xs text-muted-foreground">{t("recommend the leveling first", "أرسل المقارنة للتوصية أولاً")}</span> : null,
  }));
  return (
    <section className="grid gap-2" data-bid-board={name}>
      <ComparisonColumns ar={ar} title={t("Bid comparison by line", "مقارنة العروض حسب البند")} rowHead={t("Package item", "بند الحزمة")} qtyHead={t("Qty", "الكمية")} totalLabel={t("Leveled total", "الإجمالي بعد المقارنة")} actionLabel={t("Award", "الترسية")}
        rows={b.lines.map((l) => ({ key: l.item_key, label: <span data-no-i18n>{l.description || l.item_key}</span>, sub: <span data-no-i18n>{l.item_key}{l.uom ? ` · ${l.uom}` : ""}</span>, qty: amount(l.qty) }))}
        columns={columns}
        cell={(row, col) => { const x = b.cells.get(cellKey(row, col)); if (!x || x.missing) return { display: "—", missing: true };
          return { display: <span data-no-i18n>{amount(x.amount)}</span>, best: x.best, plugged: x.plugged }; }}
        legend={<Legend t={t} />} attrs={{ "data-cmp-kind": "bid" }} />
      {low && <p className="text-xs text-muted-foreground">{t("Lowest qualified leveled total", "أقل إجمالي مؤهل بعد المقارنة")}: <span data-no-i18n>{amount(low.leveled)}</span> — {t("awarding another bidder needs an award reason; the Director awards, never the person who recommended.", "ترسية عرض آخر تتطلب سبب الترسية؛ يرسّي المدير، ولا يرسّي من أوصى.")}</p>}
    </section>
  );
}
