/**
 * DIGIT CRM Lead Create: one form model drives both the approved short popup and the designed full Create page.
 * The popup keeps essential fields, duplicate checks, Saudi validation and consent; «فتح الصفحة كاملة» sits beside Save
 * and carries typed values to /digit-crm/leads/new?draft=…, never to the record View. Saving writes only through leadDesk.
 */
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { indexQuery, metaQuery } from "@/lib/catalog";
import { createDraft } from "@/lib/documentApi";
import { toast } from "sonner";
import { adapter } from "@/lib/adapter";
import { FormDrawer, type FdSection } from "@/components/enterprise/kit/RecordForm";
import { DupBanner } from "@/components/enterprise/kit/RecordFrame";
import { closeCreate, type CreateOverrideProps } from "@/components/enterprise/CreatePanel";
import { peekRow } from "@/components/enterprise/QuickView";
import { useLang } from "@/i18n";
import { useSessionUser } from "@/lib/session";
import { crmUsers, isManager } from "./wf01";
import { createLeadFull, ksaMobile, leadDuplicates, mergeInputInto, undoCreateLead, type LeadInput, type Msg } from "./leadDesk";
import { leadRules } from "./leadRules";
import { CITIES, fieldLabel, INDUSTRIES, indLabel, m, SIZES, SOURCES, srcLabel, tx, personLabel } from "./CrmRecordParts";

export type CreateMode = "form" | "card" | "whatsapp";
export type LeadCreateForm = LeadInput & { owner: string };

/** Typed values stay in a local draft and open designed Create, never the record View. */
export function leadFullCreateTarget(meta: Parameters<typeof createDraft>[0], mapped: Record<string, unknown>) {
  const r = createDraft(meta, { mapped });
  return r.doc ? { ok: true as const, to: "/digit-crm/leads/new" as const, search: { draft: r.doc.name } } : { ok: false as const, errors: r.errors };
}
export const blankLeadForm = (): LeadCreateForm => ({ first_name: "", last_name: "", job_title: "", mobile_no: "", email: "", organization: "", custom_cr_no: "", custom_vat_no: "", industry: "", no_of_employees: "", territory: "", source: "", campaign: "", custom_interest: "", custom_estimated_value: "", owner: "me", consent: {} });
const DT_AR: Record<string, string> = { "CRM Lead": "عميل محتمل", Contact: "جهة اتصال", Customer: "عميل", "CRM Organization": "شركة" };
const ON_AR: Record<string, [string, string]> = { phone: ["mobile", "الجوال"], email: ["email", "البريد"], company: ["company", "الشركة"], cr: ["CR", "السجل التجاري"], vat: ["VAT", "الرقم الضريبي"] };

/** Business-card text → fields (name on the first line, then phone, email, company / title by keywords). */
export function parseCard(text: string): Partial<LeadInput> {
  const lines = text.split(/\n/).map((x) => x.trim()).filter(Boolean); const out: Partial<LeadInput> = {};
  const email = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/); if (email) out.email = email[0];
  const phone = text.match(/(?:\+?966|0)?\s*5[\d\s-]{8,11}/); if (phone && ksaMobile(phone[0])) out.mobile_no = ksaMobile(phone[0])!;
  const name = lines.find((l) => !/[@\d]/.test(l)); if (name) { const [f, ...r] = name.split(/\s+/); out.first_name = f ?? ""; out.last_name = r.join(" "); }
  const co = lines.find((l) => /شركة|مؤسسة|company|co\.|ltd|est\./i.test(l)); if (co) out.organization = co;
  const title = lines.find((l) => /مدير|رئيس|مسؤول|manager|director|head|officer/i.test(l) && l !== co); if (title) out.job_title = title;
  return out;
}

export function useLeadCreateForm({ open, user, ar, mode = "form", preset, onSaved }: {
  open: boolean; user: string; ar: boolean; mode?: CreateMode | undefined; preset?: Partial<LeadInput> | undefined;
  onSaved?: ((name: string, kind: "save" | "open") => void) | undefined;
}) {
  const nav = useNavigate();
  const init = (): LeadCreateForm => {
    const p = { ...(preset ?? {}) } as Partial<LeadCreateForm> & { lead_owner?: string };
    const owner = p.owner ?? p.lead_owner ?? "me";
    return { ...blankLeadForm(), ...(mode === "whatsapp" ? { source: "WhatsApp", consent: { whatsapp: true } } : mode === "card" ? { source: "Business card" } : {}), ...p, owner };
  };
  const [v, setV] = useState(init); const [errors, setErrors] = useState<Record<string, Msg>>({}); const [cont, setCont] = useState(""); const [card, setCard] = useState("");
  const [lastKey, setLastKey] = useState(""); const key = `${open}|${mode}|${JSON.stringify(preset ?? {})}`;
  if (open && key !== lastKey) { setLastKey(key); setV(init()); setErrors({}); setCont(""); setCard(""); }
  const set = (p: Partial<typeof v>) => { setV((x) => ({ ...x, ...p })); setErrors((e) => { const n = { ...e }; for (const k of Object.keys(p)) delete n[k]; return n; }); };
  const dups = useMemo(() => (open ? leadDuplicates({ email: v.email, mobile_no: v.mobile_no, organization: (v.organization ?? "").length >= 3 ? v.organization : "", custom_cr_no: v.custom_cr_no, custom_vat_no: v.custom_vat_no }) : []), [open, v.email, v.mobile_no, v.organization, v.custom_cr_no, v.custom_vat_no]);
  const mgr = isManager(user), rules = leadRules();
  const companies = useMemo(() => [...new Set([...adapter.list("Customer").map((c) => String(c["customer_name"] ?? "")), ...adapter.list("Prospect").map((p) => String(p["company_name"] ?? p.name)), ...adapter.list("CRM Organization").map((o) => String(o["organization_name"] ?? o.name))].filter(Boolean))].sort(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const campaigns = adapter.list("Campaign").map((c) => c.name);
  const save = (kind: "save" | "new" | "open") => {
    if (dups.length && !cont) { toast.error(tx(ar, "A similar record exists — open it, merge, or continue with a reason", "يوجد سجل مشابه — افتحه أو ادمجه أو اختر «متابعة على أي حال» مع السبب")); return; }
    const r = createLeadFull(v, user, { owner: v.owner, ...(cont ? { dupReason: cont, dupOf: dups[0]?.name } : {}) });
    if (!r.ok) { setErrors(r.errors ?? {}); toast.error(m(r.error, ar)); return; }
    const name = r.name;
    toast.success(tx(ar, `Lead ${name} created`, `أُنشئ العميل المحتمل ${name}`), { duration: 10000, description: tx(ar, `Assigned to ${personLabel(r.owner, ar) || r.owner} · first response due within ${rules.slaHours} h`, `تم إسناده إلى ${personLabel(r.owner, ar) || r.owner} · بدأت مهلة أول رد (${rules.slaHours} ساعات)`),
      action: { label: tx(ar, "Undo", "تراجع"), onClick: () => { const u = undoCreateLead(name, user); if (u.ok) toast.message(tx(ar, "Creation undone", "تم التراجع عن الإنشاء")); else toast.error(m(u.error, ar)); } } });
    if (kind === "new") { setV({ ...blankLeadForm(), source: v.source, campaign: v.campaign ?? "", owner: v.owner }); setCont(""); setErrors({}); return; }
    if (onSaved) { onSaved(name, kind === "open" ? "open" : "save"); return; }
    if (kind === "open") void nav({ to: "/digit-crm/leads/$leadId", params: { leadId: name } });
  };
  // Typed values travel in the same local draft; the destination is the designed CREATE route, not the record View.
  const idx = useQuery(indexQuery); const le = idx.data?.find((e) => e.name === "CRM Lead");
  const lm = useQuery({ ...metaQuery(le?.app ?? "crm", le?.slug ?? "-"), enabled: open && !!le });
  const openFull = () => {
    if (!le || !lm.data) return;
    const have = new Set(lm.data.fields.map((f) => f.fieldname).filter(Boolean));
    const owner = !mgr || !v.owner || v.owner === "me" ? user : v.owner === "rule" ? "" : v.owner;
    const typed: Record<string, unknown> = { ...v, mobile_no: ksaMobile(v.mobile_no) ?? v.mobile_no, lead_owner: owner };
    const mapped: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(typed)) if (have.has(k) && (typeof x === "number" ? Number.isFinite(x) : typeof x === "string" && x.trim())) mapped[k] = x;
    const target = leadFullCreateTarget(lm.data, mapped);
    if (!target.ok) { toast.error(target.errors.join(" · ")); return; }
    void nav({ to: target.to, search: target.search });
  };
  const L = (k: string) => fieldLabel(k, ar);
  const inp = (k: keyof LeadInput, p: { type?: string; dir?: "ltr"; placeholder?: string; list?: string; inputMode?: "tel" | "email" | "numeric" } = {}) => <input className="field-input min-h-9 w-full text-sm" value={String(v[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as Partial<typeof v>)} aria-label={L(k)} aria-invalid={!!errors[k] || undefined} data-lead-input={k} type={p.type ?? "text"} dir={p.dir} placeholder={p.placeholder} list={p.list} inputMode={p.inputMode} />;
  const sel = (k: keyof LeadInput, opts: { value: string; label: string }[]) => <select className="field-input min-h-9 w-full text-sm" value={String(v[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as Partial<typeof v>)} aria-label={L(k)} aria-invalid={!!errors[k] || undefined} data-lead-input={k}><option value="">—</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  const err = (k: string) => (errors[k] ? m(errors[k]!, ar) : undefined);
  const mob = ksaMobile(v.mobile_no);
  const sections: FdSection[] = [
    { key: "person", label: tx(ar, "Person & contact", "الشخص والتواصل"), icon: "👤", fields: [
      { key: "first_name", label: L("first_name"), required: true, short: true, error: err("first_name"), node: inp("first_name") },
      { key: "last_name", label: L("last_name"), short: true, node: inp("last_name") },
      { key: "job_title", label: L("job_title"), node: inp("job_title") },
      { key: "mobile_no", label: L("mobile_no"), short: true, error: err("mobile_no"), hint: v.mobile_no && mob ? <bdi dir="ltr" data-no-i18n>{mob}</bdi> : tx(ar, "Saudi mobile, e.g. 05X XXX XXXX", "جوال سعودي، مثال ‎05X XXX XXXX‎"), node: inp("mobile_no", { dir: "ltr", placeholder: "+966 5X XXX XXXX", inputMode: "tel", type: "tel" }) },
      { key: "email", label: L("email"), short: true, error: err("email"), node: inp("email", { dir: "ltr", type: "email", inputMode: "email" }) },
    ] },
    { key: "company", label: tx(ar, "Company", "الشركة"), icon: "🏢", fields: [
      { key: "organization", label: L("organization"), short: true, wide: true, hint: tx(ar, "Live search of customers, prospects and companies", "بحث مباشر في العملاء والمحتملين والشركات"), node: <>{inp("organization", { list: "lead-companies" })}<datalist id="lead-companies">{companies.map((c) => <option key={c} value={c} />)}</datalist></> },
      { key: "custom_cr_no", label: `${L("custom_cr_no")} ${tx(ar, "(optional)", "(اختياري)")}`, error: err("custom_cr_no"), node: inp("custom_cr_no", { dir: "ltr", inputMode: "numeric", placeholder: "10 digits" }) },
      { key: "custom_vat_no", label: `${L("custom_vat_no")} ${tx(ar, "(optional)", "(اختياري)")}`, error: err("custom_vat_no"), node: inp("custom_vat_no", { dir: "ltr", inputMode: "numeric", placeholder: "3XXXXXXXXXXXXX3" }) },
      { key: "industry", label: L("industry"), node: sel("industry", INDUSTRIES.map((x) => ({ value: x, label: indLabel(x, ar) }))) },
      { key: "no_of_employees", label: L("no_of_employees"), node: sel("no_of_employees", SIZES.map((x) => ({ value: x, label: x }))) },
      { key: "territory", label: L("territory"), node: <>{inp("territory", { list: "lead-cities" })}<datalist id="lead-cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist></> },
    ] },
    { key: "qual", label: tx(ar, "Qualification", "التأهيل"), icon: "★", fields: [
      { key: "source", label: L("source"), required: true, short: true, error: err("source"), node: sel("source", SOURCES.map((x) => ({ value: x, label: srcLabel(x, ar) }))) },
      { key: "campaign", label: L("campaign"), node: sel("campaign", campaigns.map((c) => ({ value: c, label: c }))) },
      { key: "custom_interest", label: L("custom_interest"), wide: true, node: inp("custom_interest") },
      { key: "custom_estimated_value", label: `${L("custom_estimated_value")} (⃁)`, error: err("custom_estimated_value"), node: inp("custom_estimated_value", { type: "number", dir: "ltr", inputMode: "numeric" }) },
      { key: "lead_owner", label: L("lead_owner"), short: true, error: err("lead_owner"), hint: mgr ? undefined : tx(ar, "A sales user owns the leads they create", "مستخدم المبيعات يملك ما ينشئه"), node: <select className="field-input min-h-9 w-full text-sm" value={v.owner} disabled={!mgr} onChange={(e) => set({ owner: e.target.value })} aria-label={L("lead_owner")} data-lead-input="lead_owner">
        <option value="me">{tx(ar, `Me (${personLabel(user, ar) || user})`, `أنا (${personLabel(user, ar) || user})`)}</option>
        {mgr && <option value="rule">{tx(ar, "Assignment rule (round robin)", "قاعدة الإسناد (توزيع دوري)")}</option>}
        {mgr && crmUsers().filter((u) => u.name !== user).map((u) => <option key={u.name} value={u.name}>{personLabel(u.name, ar)}</option>)}</select> },
    ] },
    { key: "consent", label: tx(ar, "Consent", "الموافقة"), icon: "✓", note: tx(ar, "Records who agreed to which channel and when (personal-data record). It is a record only, not a compliance statement.", "يسجّل موافقة العميل على كل قناة وتاريخها ومن سجّلها (سجل بيانات شخصية)، وهو سجل فقط وليس إقرارًا بالامتثال."), fields: [
      { key: "consent", label: tx(ar, "Channels the customer agreed to", "القنوات التي وافق عليها العميل"), short: true, wide: true, node: <div className="ek-fd-consent" data-lead-consent>{(["whatsapp", "email", "sms"] as const).map((c) => <label key={c} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!v.consent?.[c]} onChange={(e) => set({ consent: { ...v.consent, [c]: e.target.checked } })} data-consent={c} /> {c === "whatsapp" ? tx(ar, "WhatsApp", "واتساب") : c === "email" ? tx(ar, "Email", "البريد") : tx(ar, "SMS", "الرسائل النصية")}</label>)}</div>,
        hint: Object.values(v.consent ?? {}).some(Boolean) ? tx(ar, "Saved with today's date and your name", "تُحفظ بتاريخ اليوم واسمك") : undefined },
    ] },
  ];
  const banner = <>
    {mode === "whatsapp" && <p className="ek-fd-note mb-2" data-lead-mode="whatsapp">{tx(ar, "WhatsApp sandbox: the lead is added as if it came from a WhatsApp chat; no WhatsApp connection is used.", "واتساب تجريبي: يُضاف العميل كأنه جاء من محادثة واتساب، دون اتصال فعلي بواتساب.")}</p>}
    {mode === "card" && <div className="mb-2 grid gap-2" data-lead-mode="card"><label className="text-xs font-semibold">{tx(ar, "Paste the business card text", "الصق نص بطاقة العمل")}<textarea className="field-input mt-1 w-full text-sm" rows={4} value={card} onChange={(e) => setCard(e.target.value)} placeholder={tx(ar, "Name\nTitle\nCompany\nMobile\nEmail", "الاسم\nالمسمى\nالشركة\nالجوال\nالبريد")} data-card-text /></label>
      <button type="button" className="btn-secondary justify-self-start" disabled={!card.trim()} onClick={() => { const p = parseCard(card); set(p); toast.message(tx(ar, `${Object.keys(p).length} fields filled from the card`, `عُبّئ ${Object.keys(p).length} حقول من البطاقة`)); }} data-card-parse>{tx(ar, "Fill from the card", "تعبئة من البطاقة")}</button></div>}
    <DupBanner ar={ar} continued={cont || undefined} matches={dups.map((d) => ({ key: d.key, title: d.title, sub: d.sub || undefined, kind: ar ? DT_AR[d.dt] ?? d.dt : d.dt, on: d.on.map((o) => ON_AR[o]![ar ? 1 : 0]) }))}
      onOpen={(x) => { const d = dups.find((y) => y.key === x.key); if (!d) return; if (d.dt === "CRM Lead") peekRow("CRM Lead", d.name, dups.filter((y) => y.dt === "CRM Lead").map((y) => y.name)); else peekRow(d.dt, d.name, []); }}
      onMerge={dups[0]?.dt === "CRM Lead" ? (x) => { const d = dups.find((y) => y.key === x.key); if (!d || d.dt !== "CRM Lead") return; const r = mergeInputInto(d.name, v, user); if (!r.ok) { toast.error(m(r.error, ar)); return; } toast.success(tx(ar, `New details merged into ${d.name}`, `دُمجت البيانات الجديدة في ${d.name}`)); void nav({ to: "/digit-crm/leads/$leadId", params: { leadId: d.name } }); } : undefined}
      onContinue={(why) => setCont(why)} />
  </>;
  return { v, set, sections, banner, dups, save, openFull, fullReady: !!le && !!lm.data, fullHref: "/digit-crm/leads/new", mgr };
}

export function LeadCreateDrawer({ open, onOpenChange, user, ar, mode = "form", preset }: { open: boolean; onOpenChange: (o: boolean) => void; user: string; ar: boolean; mode?: CreateMode; preset?: Partial<LeadInput> | undefined }) {
  const nav = useNavigate();
  const f = useLeadCreateForm({ open, user, ar, mode, preset, onSaved: (name, kind) => { onOpenChange(false); if (kind === "open") void nav({ to: "/digit-crm/leads/$leadId", params: { leadId: name } }); } });
  return <FormDrawer open={open} onOpenChange={onOpenChange} id="lead-create" ar={ar} title={tx(ar, "New lead", "عميل محتمل جديد")} kicker={tx(ar, "DIGIT CRM · required fields are marked *", "ديجيت لإدارة العملاء · الحقول المطلوبة عليها *")}
    sections={f.sections} banner={f.banner} onShortcut={() => f.save("save")}
    full={{ href: f.fullHref, run: () => { onOpenChange(false); f.openFull(); } }}
    buttons={[{ key: "cancel", label: tx(ar, "Cancel", "إلغاء"), ghost: true, run: () => onOpenChange(false) }, { key: "new", label: tx(ar, "Save & add another", "حفظ وإضافة آخر"), run: () => f.save("new") }, { key: "open", label: tx(ar, "Save & open", "حفظ وفتح"), run: () => f.save("open") }, { key: "save", label: tx(ar, "Save", "حفظ"), primary: true, run: () => f.save("save") }]} />;
}

/** Shared CreatePanel override: native CRM and cross-app «New Lead» actions open this same approved form. */
export function LeadCreatePanel({ values }: CreateOverrideProps) {
  const ar = useLang() === "ar"; const user = useSessionUser();
  return <LeadCreateDrawer open onOpenChange={(o) => { if (!o) closeCreate(); }} user={user} ar={ar} preset={values as Partial<LeadInput> | undefined} />;
}
