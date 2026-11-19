/**
 * Owner notes C-05 «التأهيل والتحويل» (/digit-crm/qualification): the Enterprise kanban of the lead path (same StageBoard as
 * the deal pipeline) with coloured stage heads (count · value), cards (avatar, name, company, score pill, first-response
 * chip, next step in its date colour, owner avatar) moved by drag or the card's ⋯ menu, the funnel lead → qualified →
 * converted with %, and indicators incl. «سرعة الوصول» in hours. Rows and figures come only from leadDesk, so the board,
 * the lead list and the funnel count the same records; moves go through leadDesk.setLeadStatus.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLang } from "@/i18n";
import { StageBoard, type StageColumn } from "@/components/enterprise/kit/StageBoard";
import { KpiRow, type KpiItem } from "@/components/enterprise/kit/templates";
import { Funnel } from "@/components/enterprise/kit/charts";
import { CrmFrame } from "./CrmApp";
import { leadRules } from "./leadRules";
import { LEAD_STATUS_HUE, LEAD_STATUS_ORDER, leadRows, qualificationStats, setLeadStatus, type LeadRow } from "./leadDesk";
import { m, sar, stLabel, tx } from "./CrmRecordParts";
import { LEAD_HUE_VAR, leadCard } from "./leadCard";
export { LEAD_HUE_VAR, leadCard } from "./leadCard";
import { BulkDialog } from "./LeadList";

const s = (v: unknown) => String(v ?? "");

export function QualificationPage() {
  const ar = useLang() === "ar";
  return <CrmFrame title={tx(ar, "Qualification & Conversion", "التأهيل والتحويل")} subtitle={tx(ar, "Every lead on its path — drag a card or use its ⋯ menu to move it; converting opens the lead.", "كل عميل محتمل على مساره — اسحب البطاقة أو استخدم قائمة ⋯ لنقلها؛ التحويل يتم من سجل العميل.")}
    actions={<Link to="/digit-crm/leads" className="ek-context-btn" data-crm-classic-lead-kanban>{tx(ar, "Classic board", "اللوحة الكلاسيكية")}</Link>}>{(user) => <Body user={user} ar={ar} />}</CrmFrame>;
}

function Body({ user, ar }: { user: string; ar: boolean }) {
  const nav = useNavigate();
  const rows = leadRows(user).filter((r) => !Number(r.l["custom_archived"]));
  const [exit, setExit] = useState<string[] | null>(null);
  const st = qualificationStats(rows);
  const keys = rows.map((r) => r.name);
  const pctText = (v: number | null) => (v === null ? "—" : `${v}%`);
  const go = (search: Record<string, string>) => (n: React.ReactNode) => <Link to="/digit-crm/leads" search={search as never} className="contents">{n}</Link>;
  const kpis: KpiItem[] = [
    { id: "q:open", label: tx(ar, "Open leads", "عملاء محتملون مفتوحون"), value: String(st.open), sub: tx(ar, `${st.total} leads in total`, `من ${st.total} عميلًا`), wrap: go({}),
      delta: st.newPrev ? { pct: Math.round(((st.newRecent - st.newPrev) / st.newPrev) * 100), better: "up", label: tx(ar, "new vs previous 30 days", "الجدد مقابل الـ30 يومًا السابقة") } : undefined },
    { id: "q:qualified", label: tx(ar, "Qualified", "نسبة التأهيل"), value: pctText(st.qualifiedPct), sub: tx(ar, `${st.qualified} of ${st.total}`, `${st.qualified} من ${st.total}`), tone: "good", wrap: go({ strip: "Qualified" }) },
    { id: "q:converted", label: tx(ar, "Converted", "نسبة التحويل"), value: pctText(st.convertedPct), sub: tx(ar, `${st.converted} converted · ${pctText(st.qualToConvPct)} of qualified`, `${st.converted} محوّل · ${pctText(st.qualToConvPct)} من المؤهلين`), tone: "info", wrap: go({ strip: "Converted" }) },
    { id: "q:speed", label: tx(ar, "Speed to first response", "سرعة الوصول"), value: st.avgFirstHours === null ? "—" : tx(ar, `${st.avgFirstHours} hours`, `${st.avgFirstHours} ساعات`),
      sub: tx(ar, `mean over ${st.responded} answered leads · target ${leadRules().slaHours} hours`, `متوسط ${st.responded} عميلًا تم الرد عليهم · المستهدف ${leadRules().slaHours} ساعات`), tone: st.avgFirstHours !== null && st.avgFirstHours > leadRules().slaHours ? "attention" : "good" },
    { id: "q:breached", label: tx(ar, "First response missed", "تجاوز مهلة أول رد"), value: String(st.breached), sub: tx(ar, "open leads past the response target", "عملاء مفتوحون تجاوزوا مهلة الرد"), tone: st.breached ? "risk" : "good", wrap: go({ view: "all" }) },
  ];
  const funnel = [
    { key: "lead", label: tx(ar, "Leads", "عملاء محتملون"), value: st.total },
    { key: "qualified", label: tx(ar, "Qualified", "مؤهلون"), value: st.qualified },
    { key: "converted", label: tx(ar, "Converted", "محوّلون"), value: st.converted },
  ];
  const columns: StageColumn[] = LEAD_STATUS_ORDER.map((k) => { const xs = rows.filter((r) => r.stage === k); const tot = xs.reduce((a, r) => a + r.value, 0);
    return { key: k, label: stLabel(k, ar), hue: LEAD_HUE_VAR[LEAD_STATUS_HUE[k] ?? "grey"]!, tinted: true, count: xs.length, totalText: tot ? sar(tot) : "", auto: k === "Converted", autoHint: tx(ar, "Set by converting the lead", "تُضبط عند تحويل العميل"), cards: xs.map((r) => leadCard(r, ar, keys)) }; });
  return <>
    <KpiRow id="crm:qualification" ar={ar} items={kpis} />
    <section className="ek-card" data-crm-qual-funnel={`${st.total}/${st.qualified}/${st.converted}`}>
      <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{tx(ar, "Lead → qualified → converted", "عميل محتمل ← مؤهل ← محوّل")}</h3><p className="ek-card-sub">{tx(ar, "Share that moves on at each step (junk leads excluded).", "نسبة من ينتقل في كل خطوة (عدا غير الصالح).")}</p></div></header>
      <div className="ek-card-pad"><Funnel data={funnel} ar={ar} between="conversion" /></div>
    </section>
    <StageBoard columns={columns} ar={ar} title={tx(ar, "Leads by stage", "العملاء حسب المرحلة")} attrs={{ "data-crm-qual-board": String(rows.length) }}
      onDropCard={(key, _from, to) => {
        if (to === "Converted") { void nav({ to: "/digit-crm/leads/$leadId", params: { leadId: key }, search: { convert: "1" } as never }); return { moved: 0, refused: [], note: tx(ar, "Opening the conversion on the lead…", "فتح التحويل في سجل العميل…") }; }
        if (to === "Unqualified" || to === "Junk") { setExit([key]); return { moved: 0, refused: [], note: tx(ar, "Pick the reason to finish the move.", "اختر السبب لإكمال النقل.") }; }
        const r = setLeadStatus(key, to, user); return r.ok ? { moved: 1, refused: [] } : { moved: 0, refused: [`${key} — ${m(r.error, ar)}`] };
      }} />
    {exit && <BulkDialog kind="status" keys={exit} rows={new Map(rows.map((r) => [r.name, r]))} user={user} ar={ar} rules={leadRules()} onClose={() => setExit(null)} onDelete={() => setExit(null)} />}
  </>;
}
