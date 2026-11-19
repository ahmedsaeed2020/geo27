import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { DeptPanel } from "./Workspace";
import { useLang } from "@/i18n";
import { Button } from "@/components/ui/button";
import { DemoOperations } from "./DemoOperations";
import { demoEnabled } from "./demoAnalytics";
import type { ForecastSearch } from "./screenSearch";
import { useState } from "react";
import { toast } from "sonner";
import { adapter, type Doc } from "@/lib/adapter";
import { CrmFrame, TaskDialog } from "./CrmApp";
import { DeskLink, Empty, Kpi, MoneyNote, Num, RefLink, Section } from "./Wave2";
import { ownerChoices, userLabel, scopedLeads } from "./wf01";
import { dealProb } from "./wf02";
import { stageHistory, targets } from "./wf03";
import {
  dealFlags, dealsMoney, duplicatesOf, FORECAST_CATS, fmtMoney, forecastView, leadLastActivity, managerExceptions, ownerName,
  PIPE_RULES, qualification, SCORE_RULES, scoreLead, setLeadQualification, stageGuidance, targetGap, type Match,
} from "./wf05";
import { DateInput } from "@/components/form/DateInput";

const ago = (v: string) => { const t = Date.parse(v); return Number.isFinite(t) ? `${Math.max(0, Math.floor((Date.now() - t) / 864e5))}d` : "—"; };
const tone = { positive: "text-success", negative: "text-destructive", missing: "text-muted-foreground" } as const;

/* ---------- Pipeline cards: compact exception badges ---------- */
export function DealBadges({ d }: { d: Doc }) {
  const lang = useLang();
  const f = dealFlags(d), b: [string, string][] = [];
  if (f.stageAge !== null) b.push([lang === "ar" ? `${f.stageAge} يوم في المرحلة` : `${f.stageAge}d in stage`, "bg-muted text-muted-foreground"]);
  if (f.overdueClose) b.push(["Close date passed", "bg-destructive/15 text-destructive"]);
  if (f.noNext) b.push(["No next activity", "bg-warning/20 text-warning-foreground"]);
  if (f.stale) b.push(["Stale", "bg-destructive/15 text-destructive"]);
  if (!b.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1" data-crm-deal-flags>{b.map(([t, c]) => <span key={t} className={`rounded px-1.5 py-0.5 text-[10px] ${c}`}>{t}</span>)}</div>;
}

/* ---------- Opportunity discipline: age, next action, evidence, guidance ---------- */
export function DealDiscipline({ d, user }: { d: Doc; user: string }) {
  const lang = useLang();
  const [task, setTask] = useState(false);
  const f = dealFlags(d), g = stageGuidance(d), h = stageHistory(d).slice(-3).reverse();
  return <Section title="Pipeline discipline" right={<button className="btn-ghost" onClick={() => setTask(true)} data-crm-action="schedule-deal">Schedule activity</button>}>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-crm-discipline>
      <Kpi label="Days in stage" value={f.stageAge ?? "—"} />
      <Kpi label="Next activity" value={f.next ? String(f.next["due_date"] ?? "").slice(0, 10) || (lang === "ar" ? "بلا تاريخ" : "Undated") : lang === "ar" ? "لا يوجد" : "None"} hint={f.next ? String(f.next["title"] ?? "") : lang === "ar" ? "جدولة نشاط" : "Schedule one"} />
      <Kpi label="Last activity" value={f.last ? lang === "ar" ? `${ago(f.last).replace(/d$/, "")} يوم` : ago(f.last) : "—"} hint={f.stale ? lang === "ar" ? `راكد (أكثر من ${PIPE_RULES.staleDays} يومًا)` : `Stale (> ${PIPE_RULES.staleDays} days)` : ""} />
      <Kpi label="Expected close" value={String(d["expected_closure_date"] || "—")} hint={f.overdueClose ? "Date has passed" : ""} />
    </div>
    {g.length > 0 && <div className="mt-3" data-crm-guidance><p className="text-xs font-medium">Stage guidance (warnings only — moves are not blocked)</p><ul className="mt-1 list-disc ps-5 text-xs text-muted-foreground">{g.map((x) => <li key={x}>{x}</li>)}</ul></div>}
    {h.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Recent stage moves: <span data-no-i18n>{h.map((r) => `${r.from || "∅"} → ${r.to || "…"}`).join(" · ")}</span></p>}
    {task && d["lead"] ? <TaskDialog user={user} lead={String(d["lead"])} onClose={() => setTask(false)} /> : task && <div className="mt-2 text-xs text-muted-foreground">This opportunity has no source lead; add the activity from the <Link to="/digit-crm/deals/$dealId" params={{ dealId: d.name }} className="text-primary">full form</Link>. <button className="btn-ghost" onClick={() => setTask(false)}>Close</button></div>}
  </Section>;
}

/* ---------- Lead workspace: qualification, score, duplicates ---------- */
export function LeadWorkspace({ leadId }: { leadId: string }) {
  const [task, setTask] = useState(false), [, bump] = useState(0);
  return <CrmFrame title="Lead qualification" subtitle={leadId} actions={<Link to="/digit-crm/leads/$leadId" params={{ leadId }} className="btn-ghost">Open full lead (convert)</Link>}>{(user) => {
    const l = scopedLeads(user).find((x) => x.name === leadId);
    if (!l) return <div className="panel p-6" data-dc-state="denied">Lead not found or not permitted.</div>;
    const q = qualification(l), s = scoreLead(l), dups = duplicatesOf({ name: l.name, email: l["email"], mobile_no: l["mobile_no"], phone: l["phone"] });
    const converted = !!Number(l["converted"]);
    const act = (to: "Qualified" | "Unqualified") => { const r = setLeadQualification(l.name, to, user); if (r.ok) { toast.success(`Lead ${to.toLowerCase()}`); bump((n) => n + 1); } else toast.error(r.error); };
    return <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Status" value={String(l["status"] || "—")} /><Kpi label="Score" value={s.score} hint={s.band} />
        <Kpi label="Lead age" value={ago(String(l["creation"] ?? ""))} /><Kpi label="Last activity" value={ago(leadLastActivity(l.name))} />
      </div>
      <div className="flex flex-wrap gap-2" data-crm-lead-actions>
        <button className="btn-primary" disabled={converted || l["status"] === "Qualified"} onClick={() => act("Qualified")} data-crm-action="qualify">Qualify</button>
        <button className="btn-ghost" disabled={converted || l["status"] === "Unqualified"} onClick={() => act("Unqualified")} data-crm-action="disqualify">Disqualify</button>
        <button className="btn-ghost" onClick={() => setTask(true)} data-crm-action="schedule">Schedule follow-up</button>
        <Link to="/digit-crm/leads/$leadId" params={{ leadId }} className={`btn-ghost ${converted || l["status"] !== "Qualified" ? "pointer-events-none opacity-50" : ""}`} aria-disabled={converted || l["status"] !== "Qualified"}>Convert to deal</Link>
        {converted && <span className="self-center text-xs text-muted-foreground">Already converted — duplicate conversion is prevented.</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Qualification checklist" right={<Num v={`${q.completeness}%`} />}>
          <ul className="space-y-1 text-sm" data-crm-qual>{q.checks.map((c) => <li key={c.id} className="flex gap-2"><span aria-hidden className={c.ok ? "text-success" : c.blocking ? "text-destructive" : "text-muted-foreground"}>{c.ok ? "✓" : "○"}</span><span>{c.label}</span>{!c.ok && c.blocking && <span className="ms-auto text-xs text-destructive">Required to qualify</span>}</li>)}</ul>
          {q.next && <p className="mt-2 text-xs">Next action: <DeskLink app="crm" dt="CRM Task" name={q.next.name} /> <Num v={String(q.next["due_date"] ?? "").slice(0, 10)} /></p>}
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm"><dt className="text-muted-foreground">Owner</dt><dd data-no-i18n>{ownerName(l["lead_owner"])}</dd><dt className="text-muted-foreground">Source</dt><dd>{String(l["source"] || "—")}</dd><dt className="text-muted-foreground">Email</dt><dd data-no-i18n>{String(l["email"] || "—")}</dd><dt className="text-muted-foreground">Mobile</dt><dd data-no-i18n dir="ltr">{String(l["mobile_no"] || "—")}</dd><dt className="text-muted-foreground">Company</dt><dd data-no-i18n>{String(l["organization"] || "—")}</dd></dl>
        </Section>
        <Section title="Why this score" right={<Num v={s.score} />}>
          <table className="dp-table w-full text-sm" data-crm-score><tbody>{s.factors.map((f) => <tr key={f.id}><td>{f.id === "activity" ? (f.kind === "missing" ? f.label : <>{f.kind === "negative" ? "Stale activity" : "Recent activity"} <Num v={f.label.replace(/\D+/g, " ").trim() + "d"} /></>) : f.label}{f.evidence && <> · <DeskLink app="crm" dt={f.evidence.dt} name={f.evidence.name} /></>}</td><td className={`text-end ${tone[f.kind]}`}>{f.kind === "missing" ? "Missing data" : <Num v={f.points > 0 ? `+${f.points}` : f.points} />}</td></tr>)}</tbody></table>
          <p className="mt-2 text-xs text-muted-foreground">Rule-based, recalculated from current records on every view. Missing data scores 0 and is not penalised. Rule points:</p><p className="text-xs text-muted-foreground"><span data-no-i18n dir="ltr">{Object.entries(SCORE_RULES).map(([k, v]) => `${k} ${v}`).join(", ")}</span>.</p>
        </Section>
      </div>
      <DuplicatePanel matches={dups} />
      {task && <TaskDialog user={user} lead={l.name} onClose={() => { setTask(false); bump((n) => n + 1); }} />}
    </>;
  }}</CrmFrame>;
}

export function DuplicatePanel({ matches }: { matches: Match[] }) {
  if (!matches.length) return <Section title="Possible duplicates"><Empty>No records share this email or phone.</Empty></Section>;
  return <Section title={`Possible duplicates (${matches.length})`}>
    <p className="mb-2 text-xs text-muted-foreground" role="status">Warning only — nothing is merged or deleted. Open a match to continue with the existing record.</p>
    <table className="dp-table w-full text-sm" data-crm-duplicates><tbody>{matches.map((m) => <tr key={m.dt + m.name}><td>{m.dt}</td><td>{m.dt === "CRM Lead" ? <Link to="/digit-crm/leads/$leadId" params={{ leadId: m.name }} className="text-primary hover:underline" data-no-i18n>{m.name}</Link> : <DeskLink app={m.dt === "Contact" ? "crm" : "erpnext"} dt={m.dt} name={m.name} />}</td><td data-no-i18n>{m.title}</td><td className="text-xs text-muted-foreground">{m.on}</td></tr>)}</tbody></table>
  </Section>;
}

/* ---------- Manager exceptions (every number drills to the records) ---------- */
export function ManagerExceptions({ user }: { user: string }) {
  const lang = useLang();
  const [open, setOpen] = useState<string | null>(null);
  const x = managerExceptions(user);
  const cards: { id: string; label: string; rows: Doc[]; dt: "CRM Lead" | "CRM Deal" | "CRM Task" }[] = [
    { id: "unassigned", label: "Unassigned leads", rows: x.unassigned, dt: "CRM Lead" },
    { id: "overdue", label: "Overdue follow-ups", rows: x.overdue, dt: "CRM Task" },
    { id: "hvnf", label: "High-value deals without next action", rows: x.highNoFollow, dt: "CRM Deal" },
    { id: "stale", label: "Stale deals", rows: x.stale, dt: "CRM Deal" },
    { id: "pastclose", label: "Past expected close", rows: x.pastClose, dt: "CRM Deal" },
    { id: "qual", label: "Qualification blocked", rows: x.qualBlocked, dt: "CRM Lead" },
    { id: "stalelead", label: "Stale leads", rows: x.staleLeads, dt: "CRM Lead" },
  ];
  const sel = cards.find((c) => c.id === open);
  return <Section title="Exceptions" right={<Link to="/digit-crm/reports" search={{ cat: "pipeline" }} className="text-xs text-primary">Reports</Link>}>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-crm-exceptions>{cards.map((c) => <button key={c.id} data-exc={c.id} aria-pressed={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)} className={`panel p-3 text-start hover:bg-muted ${open === c.id ? "ring-1 ring-primary" : ""}`}><div className="text-xs text-muted-foreground">{c.label}</div><div className={`text-xl font-semibold ${c.rows.length ? "text-destructive" : ""}`}><Num v={c.rows.length} /></div></button>)}</div>
    {sel && <div className="mt-3 overflow-x-auto">{!sel.rows.length ? <Empty>Nothing to review.</Empty> : <table className="dp-table w-full text-sm" data-crm-exc-rows><tbody>{sel.rows.map((r) => <tr key={r.name}>
      <td>{sel.dt === "CRM Task" ? <DeskLink app="crm" dt="CRM Task" name={r.name} /> : sel.dt === "CRM Lead" ? <Link to="/digit-crm/leads/$leadId" params={{ leadId: r.name }} className="text-primary hover:underline" data-no-i18n>{r.name}</Link> : <RefLink dt="CRM Deal" name={r.name} />}</td>
      <td data-no-i18n>{String(r["organization"] || r["lead_name"] || r["title"] || "")}</td><td data-no-i18n>{ownerName(r["deal_owner"] ?? r["lead_owner"] ?? r["assigned_to"])}</td><td>{String(r["status"] ?? "")}</td>
      {sel.dt === "CRM Deal" && <td className="text-end"><Num v={fmtMoney(dealsMoney([r]))} /></td>}</tr>)}</tbody></table>}</div>}
    <p className="mt-2 text-xs text-muted-foreground">{lang === "ar" ? <>الحدود: ركود بعد أكثر من {PIPE_RULES.staleDays} يومًا دون نشاط؛ قيمة مرتفعة ≥ <Num v={PIPE_RULES.highValueBase.toLocaleString("en-US")} /> بالعملة الأساسية. العرض حسب صلاحياتك: المدير يرى الفريق، ومندوب المبيعات يرى سجلاته فقط.</> : <>Thresholds: stale &gt; {PIPE_RULES.staleDays} days without activity; high value ≥ <Num v={PIPE_RULES.highValueBase.toLocaleString("en-US")} /> base currency. Visibility follows your CRM role (managers see the team; salespeople only their own records).</>}</p>
  </Section>;
}

/* ---------- Forecast (categories, target gap, risks) ---------- */
export function Forecast({ search }: { search: ForecastSearch }) {
  const nav = useNavigate(); const lang = useLang();
  const set = (patch: Partial<ForecastSearch>) => void nav({ to: "/digit-crm/forecast", search: { ...search, ...patch } });
  const f = search, cat = search.cat;
  const setF = (patch: Partial<ForecastSearch>) => set({ ...patch, cat: undefined });
  const fys = adapter.list("Fiscal Year").map((y) => y.name).sort().reverse();
  const fy = search.fy && fys.includes(search.fy) ? search.fy : fys[0] ?? "";
  return <CrmFrame title="Forecast" subtitle="Open opportunities by forecast category, weighted by stage probability.">{(user) => {
    const v = forecastView(user, f), gap = fy ? targetGap(user, fy, f) : null;
    const shown = cat ? v.cats.find((c) => c.id === cat)?.deals ?? [] : null;
    return <>
      <DeptPanel dept="forecast" />
      <div className="flex flex-wrap items-end gap-3 text-sm" data-crm-forecast-filters>
        <label className="grid gap-1"><span className="text-xs text-muted-foreground">Close from</span><DateInput className="field-input" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} /></label>
        <label className="grid gap-1"><span className="text-xs text-muted-foreground">Close to</span><DateInput className="field-input" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} /></label>
        <label className="grid gap-1"><span className="text-xs text-muted-foreground">Owner</span><select className="field-input" value={f.owner ?? ""} onChange={(e) => setF({ ...f, owner: e.target.value || undefined })}><option value="">All</option>{ownerChoices(user).map((u) => <option key={u.name} value={u.name} data-no-i18n>{userLabel(u.name)}</option>)}</select></label>
        {(f.from || f.to || f.owner) && <Button variant="ghost" size="sm" onClick={() => set({ from: undefined, to: undefined, owner: undefined, cat: undefined })}>Clear filters</Button>}
        <p className="ms-auto text-xs text-muted-foreground">Date basis: expected close date · Probability: deal, else stage default</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&_*]:break-words">
        <Kpi label="Open pipeline" value={<Num v={fmtMoney(v.value)} />} hint={String(v.deals.length)} />
        <Kpi label="Weighted" value={<Num v={fmtMoney(v.weighted)} />} />
        <Kpi label="Slipped close dates" value={v.slipped.length} /><Kpi label="At risk" value={v.atRisk.length} hint="Slipped, stale or no next activity" />
      </div>
      <MoneyNote s={[v.value, v.weighted]} />
      <Section title="Forecast categories">
        <div className="overflow-x-auto"><EntTable id="crm-forecast-categories" wrap><table className="dp-table w-full text-sm" data-crm-forecast-cats><thead><tr><th className="text-start">Category</th><th className="text-start">Definition</th><th className="text-end">Deals</th><th className="text-end">Value</th><th className="text-end">Weighted</th></tr></thead>
          <tbody>{v.cats.map((c) => <tr key={c.id} aria-selected={cat === c.id}><td><Button variant="link" size="sm" className="h-auto px-0" aria-pressed={cat === c.id} onClick={() => set({ cat: cat === c.id ? undefined : c.id })} data-cat={c.id}>{c.label}</Button></td><td className="text-xs text-muted-foreground" dir="ltr">{c.rule}</td><td className="text-end"><Num v={c.deals.length} /></td><td className="text-end whitespace-nowrap"><Num v={fmtMoney(c.value)} /></td><td className="text-end whitespace-nowrap"><Num v={fmtMoney(c.weighted)} /></td></tr>)}</tbody></table></EntTable></div>
        <p className="mt-2 text-xs text-muted-foreground" data-n={FORECAST_CATS.length}>Categories are DIGIT working definitions</p>{!demoEnabled() && <p className="text-xs text-muted-foreground">Not an approved forecasting policy; snapshots are not stored.</p>}
      </Section>
      <DemoOperations kind="forecast" user={user} />
      {shown && <Section title="Contributing opportunities" right={<Button variant="ghost" size="sm" onClick={() => set({ cat: undefined })}>Close</Button>}><DealRows rows={shown} /></Section>}
      <Section title="Target vs forecast" right={<select aria-label="Fiscal Year" className="field-input !w-auto" value={fy} onChange={(e) => set({ fy: e.target.value })}>{fys.map((y) => <option key={y} value={y} data-no-i18n>{y}</option>)}</select>}>
        {!gap || !gap.targets ? <Empty>No Sales Person targets for this fiscal year.<br /><Link to="/digit-crm/targets" className="text-primary">Set targets</Link></Empty> :
          <div className="grid grid-cols-3 gap-3"><Kpi label="Target" value={<Num v={gap.target.toLocaleString("en-US")} />} hint={<span><Num v={gap.targets} /> {lang === "ar" ? "صفوف أهداف" : "target rows"} · <span data-no-i18n dir="ltr">{gap.period}</span></span>} /><Kpi label="Weighted forecast" value={<Num v={fmtMoney(gap.weighted)} />} /><Kpi label="Gap" value={gap.gap === null ? "Unavailable" : <Num v={gap.gap.toLocaleString("en-US")} />} hint={gap.gap === null ? gap.weighted.reason ?? "" : "Target − weighted"} /></div>}
        <p className="mt-2 text-xs text-muted-foreground">Recorded target rows: <Num v={targets(user).length} /></p>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Slipped close dates">{v.slipped.length ? <DealRows rows={v.slipped} /> : <Empty>No open opportunity is past its expected close date.</Empty>}</Section>
        <Section title="Without expected close date">{v.undated.length ? <DealRows rows={v.undated} /> : <Empty>All open opportunities have a close date.</Empty>}</Section>
      </div>
    </>;
  }}</CrmFrame>;
}

function DealRows({ rows }: { rows: Doc[] }) {
  const lang = useLang();
  return <div className="overflow-x-auto"><table className="dp-table w-full text-sm"><tbody>{rows.map((d) => <tr key={d.name}><td><RefLink dt="CRM Deal" name={d.name} /></td><td data-no-i18n>{String(d["organization"] ?? "")}</td><td>{String(d["status"] ?? "")}</td><td data-no-i18n>{d["expected_closure_date"] && Number.isFinite(Date.parse(String(d["expected_closure_date"]))) ? new Date(String(d["expected_closure_date"])).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—"}</td><td className="text-end"><Num v={`${dealProb(d)}%`} /></td><td className="text-end whitespace-nowrap"><Num v={fmtMoney(dealsMoney([d]))} /></td></tr>)}</tbody></table></div>;
}
