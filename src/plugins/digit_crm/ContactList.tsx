/**
 * Owner notes C-04 contacts (/digit-crm/contacts) — the same Enterprise RecordList pattern as the lead list: saved-view
 * tabs, quick-filter chips, relationship status strip, coloured KPI cards, avatar + full name (record code below), company
 * link, role pill, owner avatar, last activity, next step, consent icons, row actions and the shared quick view. Rows come
 * only from contactDesk.contactRows; calls / e-mail / WhatsApp are logged (sandbox) on the linked deal or lead.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { EntDialog } from "@/components/enterprise/Surfaces";
import { peekRow } from "@/components/enterprise/QuickView";
import { useQuery } from "@tanstack/react-query";
import { cachedMeta } from "@/lib/catalog";
import { capabilityQuery } from "@/lib/capabilities";
import { deleteDocuments } from "@/lib/deleteDoc";
import { RecordList, SplitButton, type RlBulk, type RlChip, type RlColumn, type RlField, type RlRowAction, type RlView } from "@/components/enterprise/kit/RecordList";
import { Avatar, Pill } from "@/components/enterprise/kit/RecordFrame";
import { Composer, type ComposerMode } from "@/components/enterprise/kit/RecordTimeline";
import { KpiRow, type KpiItem } from "@/components/enterprise/kit/templates";
import { CrmFrame } from "./CrmApp";
import { crmRules } from "./salesDesk";
import { CALL_OUTCOMES, logActivity, WA_TEMPLATES } from "./leadDesk";
import { CONTACT_REL_HUE, CONTACT_REL_LABEL, CONTACT_REL_ORDER, contactRows, contactStrip, idleDays, type ContactRow, type Consent } from "./contactDesk";
import { ago, dueText, m, OwnerTag, personLabel, sar, tx } from "./CrmRecordParts";
import { LEAD_HUE_VAR } from "./leadCard";

const s = (v: unknown) => String(v ?? "");
const relLabel = (k: string, ar: boolean) => CONTACT_REL_LABEL[k as keyof typeof CONTACT_REL_LABEL]?.[ar ? 1 : 0] ?? k;

export function ContactListPage() {
  const ar = useLang() === "ar";
  return <CrmFrame title={tx(ar, "Contacts", "جهات الاتصال")} subtitle={tx(ar, "People at your customers and prospects — click a row for the quick view, Ctrl-click for the full record.", "الأشخاص لدى عملائك والمحتملين — انقر الصف للعرض السريع، وCtrl+نقرة للسجل الكامل.")}>{(user) => <Body user={user} ar={ar} />}</CrmFrame>;
}

function ConsentIcons({ c, ar }: { c: ContactRow["consent"]; ar: boolean }) {
  const one = (k: "email" | "whatsapp" | "sms", icon: string, label: string) => { const v: Consent = c[k];
    const t = v === true ? tx(ar, `${label}: consent recorded`, `${label}: موافقة مسجّلة`) : v === false ? tx(ar, `${label}: declined`, `${label}: مرفوض`) : tx(ar, `${label}: not recorded`, `${label}: غير مسجّلة`);
    return <span key={k} title={t} aria-label={t} data-consent={k} data-state={v === true ? "yes" : v === false ? "no" : "unknown"} className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs ${v === true ? "bg-[var(--success-bg)] text-[var(--success-text)]" : v === false ? "bg-[var(--danger-bg,var(--muted))] text-[var(--negative)] line-through" : "bg-muted text-muted-foreground"}`}>{icon}</span>; };
  return <span className="inline-flex gap-1" data-consent-icons>{one("email", "✉", tx(ar, "Email", "البريد"))}{one("whatsapp", "◉", tx(ar, "WhatsApp", "واتساب"))}{one("sms", "✆", tx(ar, "SMS", "الرسائل"))}</span>;
}

function Body({ user, ar }: { user: string; ar: boolean }) {
  const nav = useNavigate();
  const rows = contactRows(user);
  const reg = useQuery(capabilityQuery);
  const [, bump] = useState(0);
  const bulk: RlBulk[] = [{ key: "delete", label: tx(ar, "Delete", "حذف"), icon: "🗑", tone: "bad", run: (keys) => {
    const meta = cachedMeta("Contact"); if (!meta) return toast.error(tx(ar, "Contacts are not ready yet", "جهات الاتصال غير جاهزة بعد"));
    if (!window.confirm(tx(ar, `Delete ${keys.length} contacts?`, `حذف ${keys.length} جهة اتصال؟`))) return;
    const r = deleteDocuments(meta, keys, reg.data, user); bump((x) => x + 1);
    if (r.failed.length) toast.error(tx(ar, `${r.deleted.length} deleted, ${r.failed.length} refused`, `حُذف ${r.deleted.length} ورُفض ${r.failed.length}`), { description: r.failed.slice(0, 3).map((f) => `${f.name}: ${f.errors[0]}`).join(" · ") }); else toast.success(tx(ar, `${r.deleted.length} deleted`, `حُذف ${r.deleted.length}`));
  } }];
  const [log, setLog] = useState<{ row: ContactRow; mode: ComposerMode } | null>(null);
  const idle = Math.max(7, crmRules().inactivityDays * 10);
  const now = Date.now(), d30 = 30 * 864e5;
  const fresh = (r: ContactRow) => !!r.created && now - Date.parse(r.created) < d30;
  const views: RlView<ContactRow>[] = [
    { key: "all", label: tx(ar, "All contacts", "كل جهات الاتصال"), test: () => true },
    { key: "mine", label: tx(ar, "My contacts", "جهاتي"), test: (r) => r.owner === user },
    { key: "deals", label: tx(ar, "With open deals", "لديهم صفقات مفتوحة"), test: (r) => r.openDeals.length > 0 },
    { key: "idle", label: tx(ar, `No activity for ${idle} days`, `بلا نشاط منذ ${idle} يومًا`), test: (r) => { const d = idleDays(r, now); return d === null || d >= idle; } },
    { key: "missing", label: tx(ar, "Missing phone or email", "ينقصهم جوال أو بريد"), test: (r) => !r.phone || !r.email },
    { key: "new", label: tx(ar, "New (30 days)", "جديد (30 يومًا)"), test: fresh },
  ];
  const owners = [...new Set(rows.map((r) => r.owner))].map((o) => ({ value: o, label: o ? personLabel(o, ar) || o : tx(ar, "No owner", "بدون مالك") }));
  const roles = [...new Set(rows.map((r) => r.role).filter(Boolean))].map((x) => ({ value: x, label: x }));
  const companies = [...new Set(rows.map((r) => r.company).filter(Boolean))].map((x) => ({ value: x, label: x }));
  const relOpts = CONTACT_REL_ORDER.map((k) => ({ value: k, label: relLabel(k, ar) }));
  const consentOpts = [["yes", tx(ar, "Recorded", "مسجّلة")], ["no", tx(ar, "Declined", "مرفوضة")], ["unknown", tx(ar, "Not recorded", "غير مسجّلة")]].map(([value, label]) => ({ value: value!, label: label! }));
  const cv = (v: Consent) => (v === true ? "yes" : v === false ? "no" : "unknown");
  const chips: RlChip<ContactRow>[] = [
    { key: "rel", label: tx(ar, "Relationship", "العلاقة"), get: (r) => r.rel, options: relOpts },
    { key: "owner", label: tx(ar, "Owner", "المالك"), get: (r) => r.owner, options: owners },
    { key: "company", label: tx(ar, "Company", "الشركة"), get: (r) => r.company, options: companies },
    { key: "role", label: tx(ar, "Role", "الدور"), get: (r) => r.role, options: roles },
    { key: "wa", label: tx(ar, "WhatsApp consent", "موافقة واتساب"), get: (r) => cv(r.consent.whatsapp), options: consentOpts, more: true },
    { key: "em", label: tx(ar, "Email consent", "موافقة البريد"), get: (r) => cv(r.consent.email), options: consentOpts, more: true },
  ];
  const fields: RlField<ContactRow>[] = [
    { key: "title", label: tx(ar, "Name", "الاسم"), type: "text", get: (r) => r.title }, { key: "company", label: tx(ar, "Company", "الشركة"), type: "text", get: (r) => r.company },
    { key: "role", label: tx(ar, "Role", "الدور"), type: "text", get: (r) => r.role }, { key: "rel", label: tx(ar, "Relationship", "العلاقة"), type: "select", get: (r) => r.rel, options: relOpts },
    { key: "owner", label: tx(ar, "Owner", "المالك"), type: "select", get: (r) => r.owner, options: owners }, { key: "email", label: tx(ar, "Email", "البريد"), type: "text", get: (r) => r.email },
    { key: "phone", label: tx(ar, "Mobile", "الجوال"), type: "text", get: (r) => r.phone }, { key: "value", label: tx(ar, "Open deal value", "قيمة الصفقات المفتوحة"), type: "number", get: (r) => r.openValue },
    { key: "last", label: tx(ar, "Last activity on", "تاريخ آخر نشاط"), type: "date", get: (r) => r.lastAt.slice(0, 10) }, { key: "created", label: tx(ar, "Created on", "تاريخ الإنشاء"), type: "date", get: (r) => r.created.slice(0, 10) },
  ];
  const columns: RlColumn<ContactRow>[] = [
    { key: "name", label: tx(ar, "Name", "الاسم"), fixed: true, minWidth: 210, sortValue: (r) => r.title, filterValue: (r) => `${r.title} ${r.name}`,
      render: (r) => <span className="ek-rl-name"><Avatar name={r.title} size={28} /><span className="min-w-0"><Link to="/app/$app/$doctype/$name" params={{ app: "frappe", doctype: "contact", name: r.name }} className="block truncate font-semibold text-primary hover:underline" data-no-i18n data-contact-link={r.name} title={r.name}>{r.title}</Link></span></span> },
    { key: "company", label: tx(ar, "Company", "الشركة"), minWidth: 150, sortValue: (r) => r.company, filterValue: (r) => r.company,
      render: (r) => r.org ? <Link to="/digit-crm/customers/$org" params={{ org: r.org }} className="block max-w-[14rem] truncate text-primary hover:underline" data-no-i18n data-contact-org={r.org}>{r.company}</Link> : <bdi className="block max-w-[14rem] truncate" data-no-i18n>{r.company || "—"}</bdi> },
    { key: "role", label: tx(ar, "Role", "الدور"), sortValue: (r) => r.role, filterValue: (r) => r.role, render: (r) => r.role ? <Pill hue="violet"><bdi data-no-i18n>{r.role}</bdi></Pill> : <span className="ek-rl-sub">—</span> },
    { key: "rel", label: tx(ar, "Relationship", "العلاقة"), sortValue: (r) => CONTACT_REL_ORDER.indexOf(r.rel), filterValue: (r) => r.rel, filterOptions: relOpts, render: (r) => <Pill hue={CONTACT_REL_HUE[r.rel]} attrs={{ "data-contact-rel": r.rel }}>{relLabel(r.rel, ar)}</Pill> },
    { key: "owner", label: tx(ar, "Owner", "المالك"), sortValue: (r) => personLabel(r.owner, ar), filterValue: (r) => r.owner, filterOptions: owners, render: (r) => <OwnerTag user={r.owner} ar={ar} /> },
    { key: "last", label: tx(ar, "Last activity", "آخر نشاط"), sortValue: (r) => r.lastAt || "0", render: (r) => { const d = idleDays(r, now); return <span className={`whitespace-nowrap text-xs ${d !== null && d >= idle ? "font-semibold text-[var(--warning)]" : ""}`} data-no-i18n>{r.lastAt ? ago(r.lastAt, ar) : tx(ar, "None yet", "لا يوجد")}</span>; } },
    { key: "next", label: tx(ar, "Next step", "الخطوة التالية"), minWidth: 170, sortValue: (r) => r.nextDue || "9999", render: (r) => { if (!r.next) return r.openDeals.length ? <span className="text-xs font-semibold text-[var(--negative)]" data-next="none">{tx(ar, "No next step", "لا توجد خطوة تالية")}</span> : <span className="ek-rl-sub">—</span>; const d = dueText(r.nextDue, ar); return <span className="block min-w-0" data-next-tone={d.tone ?? "ok"}><span className="block truncate" data-no-i18n>{s(r.next["title"])}</span><small className={d.tone === "bad" ? "font-semibold text-[var(--negative)]" : d.tone === "warn" ? "font-semibold text-[var(--warning)]" : "ek-rl-sub"} data-no-i18n>{d.text}</small></span>; } },
    { key: "consent", label: tx(ar, "Consent", "الموافقات"), render: (r) => <ConsentIcons c={r.consent} ar={ar} /> },
    { key: "phone", label: tx(ar, "Mobile", "الجوال"), filterValue: (r) => r.phone, render: (r) => r.phone ? <bdi dir="ltr" className="whitespace-nowrap text-xs" data-no-i18n>{r.phone}</bdi> : <span className="ek-rl-sub">—</span> },
    { key: "value", label: tx(ar, "Open deal value", "قيمة الصفقات المفتوحة"), align: "end", sortValue: (r) => r.openValue, amount: (r) => r.openValue, amountText: (n) => sar(n), render: (r) => <bdi dir="ltr" className="whitespace-nowrap tabular-nums" data-no-i18n>{r.openValue ? sar(r.openValue) : "—"}</bdi> },
    { key: "email", label: tx(ar, "Email", "البريد"), defaultHidden: true, filterValue: (r) => r.email, render: (r) => <bdi dir="ltr" className="text-xs" data-no-i18n>{r.email || "—"}</bdi> },
  ];
  const target = (r: ContactRow): { dt: "CRM Deal" | "CRM Lead"; name: string } | null => r.openDeals[0] ? { dt: "CRM Deal", name: r.openDeals[0].name } : r.deals[0] ? { dt: "CRM Deal", name: r.deals[0].name } : r.lead && !Number(r.lead["converted"]) ? { dt: "CRM Lead", name: r.lead.name } : null;
  const act = (mode: ComposerMode): RlRowAction<ContactRow>["run"] => (r) => setLog({ row: r, mode });
  const rowActions: RlRowAction<ContactRow>[] = [
    { key: "call", label: tx(ar, "Call", "اتصال"), icon: "☎", run: act("call"), hidden: (r) => !target(r) || !r.phone },
    { key: "email", label: tx(ar, "Email", "بريد"), icon: "✉", run: act("email"), hidden: (r) => !target(r) || !r.email },
    { key: "whatsapp", label: tx(ar, "WhatsApp", "واتساب"), icon: "◉", run: act("whatsapp"), hidden: (r) => !target(r) || !r.phone },
    { key: "note", label: tx(ar, "Note", "ملاحظة"), icon: "✎", run: act("note"), hidden: (r) => !target(r) },
  ];
  const st = { total: rows.length, deals: rows.filter((r) => r.openDeals.length).length, idle: rows.filter((r) => { const d = idleDays(r, now); return d === null || d >= idle; }).length, missing: rows.filter((r) => !r.phone || !r.email).length,
    recent: rows.filter(fresh).length, prev: rows.filter((r) => r.created && now - Date.parse(r.created) >= d30 && now - Date.parse(r.created) < 2 * d30).length };
  const viewLink = (v: string) => (n: React.ReactNode) => <Link to="/digit-crm/contacts" search={{ view: v } as never} className="contents">{n}</Link>;
  const kpis: KpiItem[] = [
    { id: "c:all", label: tx(ar, "Contacts", "جهات الاتصال"), value: String(st.total), sub: tx(ar, `${rows.filter((r) => r.rel === "customer").length} at customers`, `${rows.filter((r) => r.rel === "customer").length} لدى عملاء`), wrap: viewLink("all") },
    { id: "c:deals", label: tx(ar, "With open deals", "لديهم صفقات مفتوحة"), value: String(st.deals), sub: sar(rows.reduce((a, r) => a + r.openValue, 0)), tone: "info", wrap: viewLink("deals") },
    { id: "c:new", label: tx(ar, "New (30 days)", "جديد (30 يومًا)"), value: String(st.recent), tone: "good", wrap: viewLink("new"), delta: st.prev ? { pct: Math.round(((st.recent - st.prev) / st.prev) * 100), better: "up", label: tx(ar, "vs previous 30 days", "مقابل الـ30 يومًا السابقة") } : undefined },
    { id: "c:idle", label: tx(ar, `No activity for ${idle} days`, `بلا نشاط منذ ${idle} يومًا`), value: String(st.idle), tone: st.idle ? "attention" : "good", wrap: viewLink("idle") },
    { id: "c:missing", label: tx(ar, "Missing phone or email", "ينقصهم جوال أو بريد"), value: String(st.missing), tone: st.missing ? "risk" : "good", wrap: viewLink("missing") },
  ];
  return <>
    <KpiRow id="crm:contacts" ar={ar} items={kpis} />
    <RecordList<ContactRow> id="digit_crm:contacts" doctype="Contact" ar={ar} rows={rows} rowKey={(r) => r.name} views={views} chips={chips} fields={fields} columns={columns}
      title={<>{tx(ar, "Contacts", "جهات الاتصال")} <bdi className="ek-sc-n tabular-nums" data-no-i18n>{rows.length}</bdi></>}
      actions={<SplitButton ar={ar} label={<>+ {tx(ar, "New contact", "جهة اتصال جديدة")}</>} onClick={() => void nav({ to: "/app/$app/$doctype/$name", params: { app: "frappe", doctype: "contact", name: "new" } as never })} attrs={{ "data-contact-new": "" }}
        items={[{ key: "import", label: tx(ar, "Import", "استيراد"), hint: tx(ar, "CSV / Excel through Data Import", "ملف CSV / Excel عبر استيراد البيانات"), run: () => void nav({ to: "/app/data-import/new" }) },
          { key: "classic", label: tx(ar, "Classic list", "القائمة الكلاسيكية"), hint: tx(ar, "The standard contact list with its own views", "قائمة جهات الاتصال القياسية بعروضها"), run: () => void nav({ to: "/digit-crm/contacts" }) }]} />}
      strip={{ tabs: (xs) => contactStrip(xs), of: (r) => r.rel }} search={(r) => `${r.title} ${r.company} ${r.phone} ${r.email} ${r.name} ${r.role}`}
      rowActions={rowActions} bulk={bulk} tone={(r) => (r.openDeals.length && !r.next ? "warn" : undefined)}
      kanban={{ columns: CONTACT_REL_ORDER.map((k) => ({ key: k, label: relLabel(k, ar), hue: LEAD_HUE_VAR[CONTACT_REL_HUE[k]]! })), of: (r) => r.rel,
        card: (r) => ({ key: r.name, title: <Link to="/app/$app/$doctype/$name" params={{ app: "frappe", doctype: "contact", name: r.name }} className="text-primary hover:underline" data-no-i18n>{r.title}</Link>, sub: <bdi data-no-i18n>{[r.role, r.company].filter(Boolean).join(" · ") || r.name}</bdi>, amountText: r.openValue ? sar(r.openValue) : undefined, onOpen: (el) => peekRow("Contact", r.name, rows.map((x) => x.name), el) }) }}
      groups={[{ key: "company", label: tx(ar, "Company", "الشركة"), of: (r) => r.company }, { key: "owner", label: tx(ar, "Owner", "المالك"), of: (r) => r.owner, labelOf: (v) => (v && v !== "—" ? personLabel(v, ar) || v : tx(ar, "No owner", "بدون مالك")) }, { key: "rel", label: tx(ar, "Relationship", "العلاقة"), of: (r) => r.rel, labelOf: (v) => relLabel(v, ar) }]}
      onOpen={(r, keys, el) => peekRow("Contact", r.name, keys, el)} onOpenFull={(r) => void nav({ to: "/app/$app/$doctype/$name", params: { app: "frappe", doctype: "contact", name: r.name } })}
      empty={{ title: tx(ar, "No contacts yet", "لا توجد جهات اتصال بعد"), hint: tx(ar, "Contacts are created when a lead is converted, or add one directly.", "تُنشأ جهات الاتصال عند تحويل عميل محتمل، أو أضف واحدة مباشرة.") }} />
    {log && (() => { const t = target(log.row)!; return <EntDialog open onOpenChange={(o) => { if (!o) setLog(null); }} size="lg" id="contact-quick-log" title={<bdi data-no-i18n>{log.row.title}</bdi>} kicker={tx(ar, `Logged on ${t.dt === "CRM Deal" ? "the deal" : "the lead"} ${t.name}`, `يُسجّل في ${t.dt === "CRM Deal" ? "الصفقة" : "العميل المحتمل"} ${t.name}`)}>
      <Composer ar={ar} mode={log.mode} onMode={(md) => setLog({ ...log, mode: md })} focusKey={1} emailTo={log.row.email} phoneTo={log.row.phone} outcomes={CALL_OUTCOMES.map(([k, a]) => ({ value: k, label: ar ? a : k }))}
        templates={WA_TEMPLATES.map((w) => ({ key: w.key, label: ar ? w.ar : w.en, body: w.body[ar ? 1 : 0].replace("{name}", s(log.row.c["first_name"]) || log.row.title) }))}
        onSubmit={(mm, p) => { const e = logActivity(t.dt, t.name, mm, p, user); if (e) return m(e, ar); toast.success(mm === "email" || mm === "whatsapp" ? tx(ar, "Recorded (sandbox — not sent)", "سُجّلت (تجريبي — لم تُرسل)") : tx(ar, "Saved to the timeline", "حُفظ في السجل")); setLog(null); return null; }} />
    </EntDialog>; })()}
  </>;
}
