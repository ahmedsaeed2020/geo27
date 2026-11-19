/**
 * Approval-request page (owner 2026-11-16 idea 6) on the change event, the client change order and the client certificate
 * forms: the Enterprise DecisionLayout with the decision timeline (domain/changePage.ts decisionEvents) and, beside it,
 * the three impact cards (decisionImpact) where a figure still awaiting approval is hatched. Display only, plus the
 * timeline comment box (a Comment on the document, as the shared form timeline writes it).
 */
import { useState } from "react";
import { adapter } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { DecisionLayout, DecisionTimeline, ImpactCards, initialsOf, type DecisionEvent, type ImpactHue, type ImpactItem } from "@/components/enterprise/kit/DecisionPage";
import { hoursText, userName } from "@/components/enterprise/ApprovalPath";
import { decisionEvents, decisionImpact, type DecisionDoctype, type DecisionEvt, type ImpactFig, type NotePart } from "../domain/changePage";
import { isFrappeHost } from "../domain/host";
import { DocRef, StateBadge, amount, useCx } from "./kit";

const HUE: Record<ImpactFig["key"], ImpactHue> = { revenue: "emerald", cost: "coral", time: "blue", claimed: "blue", certified: "emerald", held: "amber" };
/** «7 أيام» / «يومان» / «15 يومًا» — the Arabic count form; English "7 days". */
export const daysText = (n: number, ar: boolean) => (ar ? (n === 1 ? "يوم واحد" : n === 2 ? "يومان" : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يومًا`) : `${n} day${n === 1 ? "" : "s"}`);
const whoName = (e: DecisionEvt, ar: boolean) => (e.whoKind === "supplier" ? String(adapter.get("Supplier", e.who)?.["supplier_name"] ?? e.who) : e.who === "Administrator" ? (ar ? "المسؤول" : "Administrator") : userName(e.who) || e.who);

function noteText(parts: NotePart[] | undefined, ar: boolean) {
  if (!parts?.length) return undefined;
  return <span data-impact-note>{parts.map((p, i) => <span key={i}>{i ? " · " : ""}{ar ? p.ar : p.en}{p.amount !== undefined && <> <bdi data-no-i18n>{amount(p.amount)}</bdi></>}</span>)}</span>;
}

export function DecisionPanel({ doctype, name }: { doctype: DecisionDoctype; name: string }) {
  const { ar, t } = useCx(); const [note, setNote] = useState("");
  const doc = adapter.get(doctype, name); if (!doc) return null;
  const evts = decisionEvents(doctype, doc);
  const items: ImpactItem[] = decisionImpact(doctype, doc).map((f) => ({
    key: f.key, hue: HUE[f.key], pending: f.pending, empty: f.value === null, label: ar ? f.ar : f.en,
    value: f.value === null ? t("Not determined yet", "لم يُحدَّد بعد") : f.unit === "days" ? daysText(f.value, ar) : <bdi>{amount(f.value)}</bdi>,
    sub: noteText(f.note, ar),
  }));
  const events: DecisionEvent[] = evts.map((e) => {
    const who = whoName(e, ar);
    const verb = e.kind === "pending"
      ? <>{t("is to decide", "بانتظار قراره")} — <StateBadge state={e.state} /> · {t("waiting", "منذ")} {hoursText(e.waitingH ?? 0, ar)}{(e.overdueH ?? 0) > 0 && <span className="ek-dtl-late" data-dtl-late> · {t("late", "متأخر")} {hoursText(e.overdueH ?? 0, ar)}</span>}</>
      : <>{ar ? e.ar : e.en}{e.state && e.kind !== "open" && <> <StateBadge state={e.state} /></>}</>;
    const detail = e.kind === "price" && e.amount !== undefined
      ? <><bdi data-no-i18n>{amount(e.amount)}</bdi>{e.detail && <> · {daysText(Number(e.detail), ar)}</>}</>
      : e.amount !== undefined ? <bdi data-no-i18n>{amount(e.amount)}</bdi> : e.detail ? <span data-no-i18n>{e.detail}</span> : undefined;
    return { key: e.key, at: e.at, kind: e.kind, initials: initialsOf(who), who: <span data-no-i18n>{who}</span>, verb, detail,
      extra: e.ref ? <p className="ek-dtl-at"><DocRef doctype={e.ref.doctype} name={e.ref.name} /></p> : undefined };
  });
  const canComment = !isFrappeHost();
  const add = () => {
    const c = note.trim(); if (!c) return;
    adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: doctype, reference_name: name, content: c, comment_email: currentUser(), owner: currentUser() });
    setNote("");
  };
  const footer = canComment ? (
    <div className="flex flex-wrap items-end gap-2" data-decision-comment>
      <textarea className="min-h-[38px] min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Add a comment to the decision trail…", "أضف تعليقًا على مسار القرار…")} aria-label={t("Comment", "تعليق")} />
      <button type="button" className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={!note.trim()} onClick={add}>{t("Comment", "علّق")}</button>
    </div>
  ) : undefined;
  return (
    <DecisionLayout attrs={{ "data-decision-doctype": doctype }}
      title={doctype === "Digit Client Certificate" ? t("Certificate decision and impact", "قرار الشهادة وأثرها") : t("Decision trail and impact", "مسار القرار وأثر التغيير")}
      side={<ImpactCards ar={ar} items={items} title={doctype === "Digit Client Certificate" ? t("Certificate impact", "أثر الشهادة") : t("Change impact", "أثر التغيير")} />}
      main={<DecisionTimeline ar={ar} events={events} footer={footer} />} />
  );
}
