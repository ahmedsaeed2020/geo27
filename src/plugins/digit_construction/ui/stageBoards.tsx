/**
 * Phase 4 C4-06 on the tenders and change events workspaces: the Enterprise stage columns (kit/StageBoard) over
 * domain/stages.ts — colour dot, count and total per stage, first 10 cards + «+N أخرى», age and time in stage on each
 * card, ⚡ on system-set stages, ⋯ moves through the document's own path, and the stage-tabs view.
 */
import { useState } from "react";
import { StageBoard, type StageColumn } from "@/components/enterprise/kit/StageBoard";
import { useSessionUser } from "@/lib/session";
import { changeBoard, moveStage, tenderBoard, type BoardScope, type StageBoardData } from "../domain/stages";
import { customerName } from "../domain/data";
import { DocRef, STATE_AR, compact, useCx } from "./kit";
import { notifyError, notifySaved } from "./notify";

const HUES = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)"];
const dayTxt = (n: number, ar: boolean) => (ar ? (n === 0 ? "اليوم" : n === 1 ? "يوم واحد" : n === 2 ? "يومان" : n <= 10 ? `${n} أيام` : `${n} يومًا`) : n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"}`);

function Board({ data, ar, title, footer, attrs }: { data: StageBoardData; ar: boolean; title: string; footer: string; attrs: Record<string, string> }) {
  const user = useSessionUser(); const [, bump] = useState(0);
  const cols: StageColumn[] = data.stages.map((st, i) => {
    const items = data.items.filter((x) => x.stage === st.key);
    const known = items.filter((x) => x.amount !== null);
    const total = known.reduce((a, x) => a + (x.amount ?? 0), 0);
    const label = ar ? (st.label[1] !== st.label[0] ? st.label[1] : STATE_AR[st.key] ?? st.key) : st.label[0];
    return { key: st.key, label, hue: HUES[i % HUES.length]!, auto: st.auto, autoHint: st.autoHint ? (ar ? st.autoHint[1] : st.autoHint[0]) : undefined, count: items.length,
      totalText: known.length ? compact(total, ar) : "—",
      cards: items.map((x) => ({ key: x.doc.name, title: <DocRef doctype={data.doctype} name={x.doc.name}>{String(x.doc["title"] || x.doc.name)}</DocRef>,
        sub: <span data-no-i18n>{x.doc.name}{x.doc["customer"] ? ` · ${customerName(x.doc["customer"], !ar) || String(x.doc["customer"])}` : ""}</span>,
        amountText: x.amount === null ? undefined : compact(x.amount, ar), late: x.late,
        age: ar ? `عمره ${dayTxt(x.ageDays, ar)}` : `age ${dayTxt(x.ageDays, ar)}`, inStage: ar ? `في المرحلة ${dayTxt(x.inStageDays, ar)}` : `in stage ${dayTxt(x.inStageDays, ar)}` })) };
  });
  const onMove = (keys: string[], from: string, to: string) => {
    const r = moveStage(data.doctype, keys, from, to, user); bump((n) => n + 1);
    if (r.moved.length) notifySaved(ar ? `نُقل ${r.moved.length}` : `${r.moved.length} moved`); if (r.refused.length && !r.moved.length) notifyError(ar ? "لم يُنقل شيء" : "Nothing moved", { description: r.refused.map((x) => `${x.name}: ${x.reason}`).join("\n") });
    return { moved: r.moved.length, refused: r.refused.map((x) => `${x.name}: ${x.reason}`) };
  };
  return <StageBoard columns={cols} ar={ar} onMove={onMove} title={title} footer={footer} attrs={attrs} />;
}

export function TenderStageBoard({ scope, on }: { scope: BoardScope; on: string }) {
  const { ar } = useCx();
  return <Board data={tenderBoard(scope, on)} ar={ar} title={ar ? "المناقصات حسب المرحلة" : "Tenders by stage"} attrs={{ "data-tender-board": "" }}
    footer={ar ? "الإجمالي = سعر البيع التقديري للمناقصات المسعّرة؛ «—» = لم تُسعّر بعد. ⚡ = مرحلة تضبطها المنظومة من قرار الترسية." : "Total = estimated selling price of the priced tenders; «—» = not priced yet. ⚡ = a stage set by the award decision."} />;
}
export function ChangeStageBoard({ scope, on }: { scope: BoardScope; on: string }) {
  const { ar } = useCx();
  return <Board data={changeBoard(scope, on)} ar={ar} title={ar ? "أحداث التغيير حسب المرحلة" : "Change events by stage"} attrs={{ "data-change-board": "" }}
    footer={ar ? "الإجمالي = الأثر على التكلفة؛ النقل يمر بإجراء سير العمل لدورك (الإرجاع والإغلاق يحتاجان سببًا من نموذج المستند). ⚡ = مرحلة لا يؤدي إليها إجراء يدوي." : "Total = cost impact; a move runs your role's workflow action (return and close need a reason from the document form). ⚡ = no manual action leads to the stage."} />;
}
