import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { Native, s, useSources, Chip, DateRange, type R } from "@/components/digithr/workspaces/shared";
import { Attachments, BackTo, ChangeLog, D, EmployeeRef, Fact, Facts, Findings, PositionRef, ProfileGate, ProfileHeader, RelatedTable, optLabel, todayIso, docState, type Finding } from "@/components/digithr/Record360Kit";
import { Button } from "@/components/ui/button";
import { useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { contractAmendmentDraft } from "@/plugins/digit_hr/contracts";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { contractFindings, contractTerm, daysUntil, employeeContracts, probationEnd } from "@/plugins/digit_hr/record360Facts";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/contracts/$name")({
  head: ({ params }) => ({ meta: [
    { title: `Contract 360 — ${params.name} — DIGIT HR` },
    { name: "description", content: "Contract 360: employee, term, probation, notice, amendment reviews and the employee's contract history from scoped HR records." },
    { property: "og:title", content: `Contract 360 — ${params.name} — DIGIT HR` },
    { property: "og:description", content: "One employment contract's term, reviews and history." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Contract360,
});

const SRC = ["DIGIT Employment Contract", "DIGIT Contract Amendment", "DIGIT Position", "Employee"];

function Contract360() {
  const { name } = Route.useParams();
  const { tx } = useTx();
  const navigate = useNavigate();
  useStoreVersion(); useSessionUser(); useScopeMetas(SRC);
  const src = useSources(tx);
  const [err, setErr] = useState("");
  const title = tx("ملف العقد 360", "Contract 360");
  const crumbs = [{ label: tx("الهيكل التنظيمي", "Organization") }, { label: tx("العقود", "Contracts") }, { label: name }];
  const back = <BackTo section="01.6" label={tx("سجل العقود", "Contracts register")} attr="contract" />;
  const contracts = src.rows("DIGIT Employment Contract");
  const c = contracts.find((x: R) => s(x.name) === name);
  return (
    <ProfileGate title={title} crumbs={crumbs} back={back} read={src.read("DIGIT Employment Contract")} found={!!c} missingAttr="contract">
      {() => {
        const today = todayIso();
        const term = contractTerm(c, today);
        const amendments = src.rows("DIGIT Contract Amendment").filter((a: R) => s(a.contract) === name).sort((a: R, b: R) => s(b.effective_date).localeCompare(s(a.effective_date)) || s(a.name).localeCompare(s(b.name)));
        const history = employeeContracts(contracts, s(c.employee)).filter((x: R) => s(x.name) !== name);
        const raw = contractFindings(c, amendments, contracts, today);
        const findings: Finding[] = raw.map((f) => ({
          key: f.code, tone: f.code === "active_past_end" || f.code === "overlapping_contract" ? "danger" : "warn",
          text: f.code === "active_past_end" ? tx(`حالة العقد «ساري» رغم انتهاء تاريخه في ${f.detail ?? ""}.`, `The contract is still marked Active although it ended on ${f.detail ?? ""}.`)
            : f.code === "extension_not_on_contract" ? tx(`مراجعة تمديد مقدّمة تقترح نهاية ${f.detail ?? ""}، والعقد ما زال يحمل تاريخ نهايته الحالي. المراجعات لا تعدّل العقد تلقائياً.`, `A submitted extension review proposes ending ${f.detail ?? ""}; the contract still carries its current end date. Reviews never change the contract automatically.`)
            : f.code === "draft_amendment_open" ? tx(`توجد مراجعة تعديل غير مكتملة (${f.detail ?? ""}).`, `An unfinished amendment review exists (${f.detail ?? ""}).`)
            : tx(`فترة هذا العقد تتداخل مع العقد ${f.detail ?? ""} للموظف نفسه.`, `This contract's period overlaps contract ${f.detail ?? ""} for the same employee.`),
        }));
        const prob = probationEnd(c); const probLeft = prob ? daysUntil(prob, today) : null;
        const termChip = term.kind === "ending_soon" ? <Chip tone="warn">{tx(`ينتهي خلال ${term.days} يوماً`, `Ends in ${term.days} days`)}</Chip>
          : term.kind === "ended" ? <Chip tone="neutral">{tx("انتهت مدته", "Term ended")}</Chip>
          : term.kind === "open_ended" ? <Chip>{tx("بلا تاريخ نهاية", "No end date")}</Chip>
          : term.kind === "not_started" ? <Chip>{tx(`يبدأ خلال ${term.days} يوماً`, `Starts in ${term.days} days`)}</Chip>
          : term.kind === "running" ? <Chip>{tx(`متبقٍ ${term.days} يوماً`, `${term.days} days left`)}</Chip> : null;
        const start = Date.parse(`${s(c.start_date).slice(0, 10)}T00:00:00Z`), end = Date.parse(`${s(c.end_date).slice(0, 10)}T00:00:00Z`), now = Date.parse(`${today}T00:00:00Z`);
        const pct = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100))) : null;
        const ameta = cachedMeta("DIGIT Contract Amendment");
        const canAmend = !!ameta && hasPerm(ameta, "create", { name: "", doctype: ameta.name, contract: name }) && Number(c.docstatus ?? 0) !== 2 && !["Expired", "Terminated"].includes(s(c.contract_status));
        const openDraft = amendments.find((a: R) => Number(a.docstatus ?? 0) === 0);
        const amend = () => {
          setErr("");
          try {
            const doc = contractAmendmentDraft(name);
            const dest = placeDoc("DIGIT Contract Amendment", "01"); if (!dest) return;
            enterHrNative(dest.sub);
            void navigate({ to: "/app/$app/$doctype/$name", params: { app: dest.app, doctype: dest.slug, name: doc.name }, search: HR_DOC_SEARCH as never });
          } catch (e) { setErr((e as Error).message); }
        };
        const positions = src.rows("DIGIT Position").filter((x: R) => s(x.incumbent) && s(x.incumbent) === s(c.employee));
        return (
          <DigitHrLayout record title={tx(`عقد ${name}`, `Contract ${name}`)} crumbs={crumbs} subtitle={title}>
            {back}
            <ProfileHeader code={name} dt="DIGIT Employment Contract" module="01" attr="contract" chips={<><Chip tone={s(c.contract_status) === "Active" ? undefined : "neutral"}>{optLabel(tx, c.contract_status)}</Chip><Chip>{docState(tx, c)}</Chip>{termChip}</>}>
              <Facts>
                <Fact label={tx("الموظف", "Employee")} attr="employee"><EmployeeRef id={c.employee} tx={tx} /></Fact>
                <Fact label={tx("نوع العقد", "Contract type")}>{optLabel(tx, c.contract_type)}</Fact>
                <Fact label={tx("الشركة", "Company")}><span data-no-i18n>{s(c.company) || "—"}</span></Fact>
                <Fact label={tx("المنصب الحالي", "Current position")} attr="position">{positions.length ? positions.map((x: R) => <div key={s(x.name)}><PositionRef id={x.name} tx={tx} /></div>) : <span className="text-muted-foreground">—</span>}</Fact>
                <Fact label={tx("تاريخ البداية", "Start date")}><D v={c.start_date} /></Fact>
                <Fact label={tx("تاريخ النهاية", "End date")} attr="end"><D v={c.end_date} /></Fact>
                <Fact label={tx("فترة التجربة", "Probation")} attr="probation">{s(c.probation_days) ? <span><bdi dir="ltr" data-no-i18n>{s(c.probation_days)}</bdi> {tx("يوماً", "days")}{prob && <span className="block text-xs text-muted-foreground">{tx("تنتهي", "ends")} <D v={prob} />{probLeft != null && probLeft >= 0 ? ` · ${tx(`بعد ${probLeft} يوماً`, `in ${probLeft} days`)}` : probLeft != null ? ` · ${tx("انقضت", "passed")}` : ""}</span>}</span> : <span>—</span>}</Fact>
                <Fact label={tx("فترة الإشعار", "Notice period")}>{s(c.notice_days) ? <span><bdi dir="ltr" data-no-i18n>{s(c.notice_days)}</bdi> {tx("يوماً", "days")}</span> : <span>—</span>}</Fact>
                <Fact label={tx("النسخة الموقعة", "Signed copy")} attr="signed">{s(c.signed_copy) ? <span>{tx("مرفقة", "Attached")} · <span className="text-xs text-muted-foreground" data-no-i18n>{s(c.signed_copy).split("/").pop()}</span></span> : <span className="text-muted-foreground">{tx("غير مرفقة", "Not attached")}</span>}</Fact>
              </Facts>
              {pct != null && <div className="mt-4" data-contract-term-bar={pct}>
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><D v={c.start_date} /><span>{tx("اليوم", "Today")}</span><D v={c.end_date} /></div>
                <div className="relative h-2 rounded-full bg-[var(--dhr-canvas)]" role="progressbar" aria-label={tx("المدة المنقضية من العقد", "Elapsed contract term")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className="absolute inset-y-0 start-0 rounded-full bg-[var(--dhr-emerald)]" style={{ width: `${pct}%` }} />
                </div>
              </div>}
            </ProfileHeader>
            <Findings items={findings} attr="contract" tx={tx} />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
              <div className="min-w-0">
                <RelatedTable title={tx("مراجعات تعديل العقد", "Amendment reviews")} read={src.read("DIGIT Contract Amendment")} rows={amendments} attr="contract-amendments" tx={tx}
                  head={[tx("السجل", "Record"), tx("نوع التعديل", "Amendment type"), tx("تاريخ السريان", "Effective date"), tx("النهاية المقترحة", "Proposed end date"), tx("حالة المستند", "Document state")]}
                  list={canAmend ? <Button variant="outline" size="sm" onClick={amend} data-contract-amend={name} className="min-h-10 gap-2"><FilePlus2 size={16} />{openDraft ? tx("متابعة المراجعة المفتوحة", "Continue open review") : tx("بدء مراجعة تعديل", "Start amendment review")}</Button> : undefined}
                  row={(a: R) => <tr key={s(a.name)} className="h-11 border-t" data-amendment-row={s(a.name)}>
                    <td className="px-3"><Native dt="DIGIT Contract Amendment" name={s(a.name)} module="01" className="text-primary hover:underline"><span data-no-i18n>{s(a.name)}</span></Native></td>
                    <td className="px-3">{optLabel(tx, a.amendment_type)}</td>
                    <td className="px-3"><D v={a.effective_date} /></td>
                    <td className="px-3"><D v={a.new_end_date} /></td>
                    <td className="px-3"><Chip>{docState(tx, a)}</Chip></td>
                  </tr>} />
                {err && <p role="alert" className="dhr-alert mb-4 text-sm" data-tone="danger" data-contract-error>{err}</p>}
                <p className="mb-4 text-[11px] text-muted-foreground">{tx("مراجعة التعديل سجل مستقل؛ تقديمها لا يغيّر العقد ولا الرواتب. يُحدَّث العقد من سجله الكامل بعد الاعتماد.", "An amendment review is a separate record; submitting it changes neither the contract nor payroll. Update the contract from its full record after approval.")}</p>
                {s(c.terms_text) && <section className="mb-4" data-contract-terms><h2 className="mb-2 text-sm font-semibold">{tx("نص الشروط", "Terms")}</h2><p className="whitespace-pre-wrap rounded-[12px] border p-3 text-sm" data-no-i18n>{s(c.terms_text)}</p></section>}
                <section className="mb-4" data-contract-files><Attachments dt="DIGIT Employment Contract" name={name} fields={["signed_copy"]} doc={c} module="01" tx={tx} /></section>
                <ChangeLog dt="DIGIT Employment Contract" name={name} tx={tx} />
              </div>
              <aside className="min-w-0" aria-label={tx("سجل عقود الموظف", "Employee contract history")}>
                <RelatedTable title={tx("عقود أخرى للموظف", "Other contracts of this employee")} read={src.read("DIGIT Employment Contract")} rows={history} attr="contract-history" tx={tx}
                  head={[tx("العقد", "Contract"), tx("الفترة", "Period"), tx("الحالة", "Status")]}
                  row={(x: R) => <tr key={s(x.name)} className="h-11 border-t" data-history-contract={s(x.name)}>
                    <td className="px-3"><Link to="/digit-hr/contracts/$name" params={{ name: s(x.name) }} className="text-primary hover:underline"><span data-no-i18n>{s(x.name)}</span></Link></td>
                    <td className="px-3 text-xs"><DateRange from={x.start_date} to={x.end_date} /></td>
                    <td className="px-3">{optLabel(tx, x.contract_status)}</td>
                  </tr>} />
              </aside>
            </div>
          </DigitHrLayout>
        );
      }}
    </ProfileGate>
  );
}
