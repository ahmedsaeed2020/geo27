/** Designed full CREATE page for a CRM Lead. It uses the same form model and field sections as the short popup,
 * with the approved CRM record composition: person/contact on the Arabic right, white editable cards, and useful side checks. */
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { deleteDraft } from "@/lib/documentApi";
import { useLang } from "@/i18n";
import { FdSectionView } from "@/components/enterprise/kit/RecordForm";
import { Pill, RecordColumns, RecordHeader, SideCard } from "@/components/enterprise/kit/RecordFrame";
import { CrmFrame } from "./CrmApp";
import { useLeadCreateForm, type LeadCreateForm } from "./LeadCreate";
import { personLabel, tx } from "./CrmRecordParts";
import type { LeadInput } from "./leadDesk";

export function LeadFullCreatePage({ draft }: { draft?: string | undefined }) {
  const ar = useLang() === "ar";
  return <CrmFrame title={tx(ar, "New lead", "عميل محتمل جديد")} subtitle={tx(ar, "Complete Create — every white field is editable", "إنشاء كامل — كل الحقول البيضاء قابلة للتحرير")} bare>
    {(user) => <LeadFullCreateBody user={user} ar={ar} draft={draft} />}
  </CrmFrame>;
}

function LeadFullCreateBody({ user, ar, draft }: { user: string; ar: boolean; draft?: string | undefined }) {
  const nav = useNavigate();
  const preset = useMemo(() => {
    if (!draft) return undefined;
    const d = adapter.get("CRM Lead", draft);
    if (!d) return undefined;
    const { name: _name, doctype: _dt, owner: _owner, ...values } = d;
    void _name; void _dt; void _owner;
    return { ...values, owner: String(d["lead_owner"] ?? "me") } as Partial<LeadCreateForm>;
  }, [draft]);
  const discard = () => {
    if (draft) { const meta = cachedMeta("CRM Lead"); if (meta) deleteDraft(meta, draft, user); }
  };
  const f = useLeadCreateForm({ open: true, user, ar, preset: preset as Partial<LeadInput> | undefined, onSaved: (name) => {
    discard();
    void nav({ to: "/digit-crm/leads/$leadId", params: { leadId: name } });
  } });
  const title = [f.v.first_name, f.v.last_name].filter(Boolean).join(" ").trim() || tx(ar, "New lead", "عميل محتمل جديد");
  const required = [f.v.first_name, f.v.source];
  const recommended = [f.v.mobile_no || f.v.email, f.v.organization, f.v.owner];
  const complete = [...required, ...recommended].filter((x) => !!String(x ?? "").trim()).length;
  const person = f.sections.filter((s) => s.key === "person");
  const rest = f.sections.filter((s) => s.key !== "person");
  const renderSections = (keys: string[]) => <div className="grid gap-3">{f.sections.filter((s) => keys.includes(s.key)).map((s) => <FdSectionView key={s.key} section={s} ar={ar} index={f.sections.indexOf(s)} fields={s.fields} />)}</div>;
  return <div className="ek-rf lead-create-full grid gap-4" data-lead-create-full data-draft={draft ?? ""}>
    <RecordHeader ar={ar} name={title} kicker={tx(ar, "CRM Lead · Create", "عميل محتمل · إنشاء")} title={<bdi data-no-i18n>{title}</bdi>}
      sub={f.v.organization ? <bdi data-no-i18n>{f.v.organization}</bdi> : tx(ar, "Draft — not saved yet", "مسودة — لم تُحفظ بعد")}
      pills={<><Pill tone="info">{tx(ar, "Create mode", "وضع الإنشاء")}</Pill>{f.v.source && <Pill tone="neutral">{f.v.source}</Pill>}</>}
      facts={<dl className="ek-rf-factlist"><div><dt>{tx(ar, "Owner", "المسؤول")}</dt><dd><bdi data-no-i18n>{personLabel(f.v.owner === "me" ? user : f.v.owner, ar) || tx(ar, "Assignment rule", "قاعدة الإسناد")}</bdi></dd></div><div><dt>{tx(ar, "Readiness", "الجاهزية")}</dt><dd><bdi data-no-i18n>{complete}/5</bdi></dd></div></dl>}
      actions={<><Link to="/digit-crm/leads" className="btn-ghost" onClick={discard}>{tx(ar, "Cancel", "إلغاء")}</Link><button type="button" className="btn-secondary" onClick={() => f.save("new")}>{tx(ar, "Save & add another", "حفظ وإضافة آخر")}</button><button type="button" className="btn-primary" onClick={() => f.save("open")} data-lead-full-save>{tx(ar, "Save", "حفظ")}</button></>} />
    <div className="ek-rf-readonly" role="status"><b>{tx(ar, "Create, not View.", "إنشاء، وليس عرضًا.")}</b> {tx(ar, "Type directly into the white fields. Nothing becomes a lead until you save.", "اكتب مباشرة في الحقول البيضاء. لا يُنشأ العميل المحتمل حتى تضغط حفظ.")}</div>
    {f.banner}
    <RecordColumns ar={ar} initialTab={0} labels={[tx(ar, "Person & contact", "الشخص والتواصل"), tx(ar, "Company & qualification", "الشركة والتأهيل"), tx(ar, "Checks", "التحقق")]}
      start={renderSections(person.map((s) => s.key))}
      middle={renderSections(rest.map((s) => s.key))}
      end={<div className="grid gap-3">
        <SideCard id="create-readiness" title={tx(ar, "Create readiness", "جاهزية الإنشاء")} icon="✓" hue="emerald" count={complete}>
          <ul className="grid gap-1.5 text-sm" data-lead-create-checks>{[
            [tx(ar, "First name and source", "الاسم الأول والمصدر"), required.every((x) => !!String(x ?? "").trim())],
            [tx(ar, "Email or mobile", "البريد أو الجوال"), !!(f.v.email || f.v.mobile_no)],
            [tx(ar, "Company", "الشركة"), !!f.v.organization],
            [tx(ar, "Owner", "المسؤول"), !!f.v.owner],
          ].map(([label, ok]) => <li key={String(label)}>{ok ? "✓" : "○"} {label}</li>)}</ul>
        </SideCard>
        <SideCard id="create-duplicates" title={tx(ar, "Duplicate check", "فحص التكرار")} icon="⧉" hue={f.dups.length ? "amber" : "teal"} count={f.dups.length}>
          <p className="text-sm text-muted-foreground">{f.dups.length ? tx(ar, "Review the matches above, merge, or continue with a reason.", "راجع التطابقات أعلاه أو ادمج أو تابع مع سبب.") : tx(ar, "No similar record by the details entered so far.", "لا يوجد سجل مشابه بالبيانات المدخلة حتى الآن.")}</p>
        </SideCard>
        <SideCard id="create-next" title={tx(ar, "After saving", "بعد الحفظ")} icon="←" hue="blue">
          <p className="text-sm">{tx(ar, "The saved lead opens in the rich record View with its status path, quick actions, timeline and conversion tools.", "يفتح العميل المحفوظ في شاشة العرض الغنية مع مسار الحالة والإجراءات السريعة والسجل وأدوات التحويل.")}</p>
        </SideCard>
      </div>} />
  </div>;
}
