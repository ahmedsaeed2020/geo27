/**
 * DIGIT Enterprise support screens (owner decision DEC-02: external hand-overs have their full UI and logic now):
 * the vendor support desk — open support issues sent to DIGIT support with their hand-over state — and live chat with a
 * person, kept as a support issue and handed to the chat service. Logic: src/lib/coreShared/providers.ts
 * (escalateIssue, requestChat); the provider is configured in Administration → Integrations.
 */
import { Link } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useState } from "react";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType, useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import { escalateIssue, integrationLogs, latestStatus, PROVIDER_LABEL, providerConnected, requestChat, screenDefects, STATUS_LABEL } from "@/lib/coreShared/providers";
import { enterpriseApps } from "@/plugins/enterprise";
import { IntegrationLogTable } from "./CorePanels";
import { EntFrame } from "./Surfaces";
import { Bar, Denied, Field, GoToAction, Kpi, pick, useCompany, useT } from "./FinanceDesk";

const tone = (s: string) => (s === "Accepted" || s === "Sent" ? "ok" : s === "Rejected" || s === "Failed" ? "bad" : "draft");
const can = (p: "read" | "write" | "create", user: string, d?: Doc) => { const m = cachedMeta("Issue"); return !!m && hasPerm(m, p, d, user); };

function ProviderNote({ engine }: { engine: "support_desk" | "live_chat" }) {
  const { ar, t } = useT();
  if (providerConnected(engine)) return <p className="text-xs text-muted-foreground" data-support-provider="connected">{t("Connected — requests are queued for the provider.", "متصل — تُرسل الطلبات إلى المزوّد.")}</p>;
  return <p className="text-xs text-muted-foreground" data-support-provider="none">{ar ? `المزوّد: ${pick(ar, PROVIDER_LABEL[engine])} غير متصل بعد — يُحفظ الطلب في سجل التكامل حتى يربطه المسؤول من الإدارة ← التكاملات.` : `Provider: ${PROVIDER_LABEL[engine][0]} is not connected yet — the request is kept in the integration log until an administrator connects it (Administration → Integrations).`}</p>;
}
const issueLink = (name: string) => <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "issue", name }} className="font-medium text-primary hover:underline" data-no-i18n>{name}</Link>;

/** One line of a screen report's hand-over context ("Owner team: digit_pro"). */
const defectField = (d: Doc, key: string) => (String(d["description"] ?? "").match(new RegExp(`^${key}: (.*)$`, "m"))?.[1] ?? "").trim();
/** Screen problem reports (header "Report a problem") by the one team that fixes each: the app owning the screen, or
 *  DIGIT Enterprise for the shared shell (providers.ts defectOwner) — so a team sees exactly its own hand-overs. */
function ScreenReports() {
  const { ar, t } = useT(); const user = useSessionUser(); const [team, setTeam] = useState("");
  const apps = enterpriseApps(user);
  const teamLabel = (id: string) => id === "digit_enterprise" ? t("DIGIT Enterprise — shared shell", "ديجيت إنتربرايز — الواجهة المشتركة")
    : (() => { const a = apps.find((x) => x.name === id); return a ? (ar ? a.title_ar : a.title) : id; })();
  const all = screenDefects();
  const teams = [...new Set(all.map((d) => defectField(d, "Owner team")).filter(Boolean))].sort();
  const rows = team ? all.filter((d) => defectField(d, "Owner team") === team) : all;
  return <EntFrame id="support-screen-reports" title={t("Screen problem reports by owning team", "بلاغات مشكلات الشاشات حسب الفريق المالك")}
    note={t("Each report names one team that fixes it: the app that owns the screen, or DIGIT Enterprise for the shared shell (header, dock, menus, side panels).", "كل بلاغ يحدد فريقًا مالكًا واحدًا يصلحه: التطبيق المالك للشاشة، أو ديجيت إنتربرايز للواجهة المشتركة (الرأس والشريط والقوائم واللوحات الجانبية).")}
    actions={teams.length > 1 ? <select className="field-input" value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t("Owning team", "الفريق المالك")} data-support-team-filter>
      <option value="">{t("All teams", "كل الفرق")}</option>{teams.map((id) => <option key={id} value={id}>{teamLabel(id)}</option>)}</select> : undefined}>
    {rows.length ? <div className="overflow-auto"><EntTable id="support-screen-reports" wrap><table className="w-full text-sm" data-support-screen-reports={rows.length}>
      <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-start">{t("Report", "البلاغ")}</th><th className="p-2 text-start">{t("Problem", "المشكلة")}</th><th className="p-2 text-start">{t("Owning team", "الفريق المالك")}</th><th className="p-2 text-start">{t("Screen", "الشاشة")}</th><th className="p-2 text-start">{t("Date", "التاريخ")}</th></tr></thead>
      <tbody>{rows.slice(0, 50).map((d) => { const owner = defectField(d, "Owner team"); return <tr key={d.name} className="border-t border-border" data-support-screen-report={d.name} data-owner-team={owner}>
        <td className="p-2">{issueLink(d.name)}</td><td className="p-2" data-no-i18n>{String(d["subject"] ?? "").replace(/^\[[^\]]*\]\s*/, "")}</td>
        <td className="p-2"><span className="ent-qv-status ent-qv-tone-draft">{teamLabel(owner)}</span></td>
        <td className="p-2"><bdi dir="ltr" className="font-mono text-xs" data-no-i18n>{defectField(d, "Route")}</bdi></td><td className="p-2 tabular-nums" data-no-i18n>{String(d["opening_date"] ?? "")}</td>
      </tr>; })}</tbody></table></EntTable></div>
      : <p className="text-sm text-muted-foreground" data-support-screen-none>{t("No screen problem reported yet — use “Report a problem on this screen” in the page header.", "لا توجد بلاغات بعد — استخدم «الإبلاغ عن مشكلة في هذه الشاشة» في رأس الصفحة.")}</p>}
  </EntFrame>;
}

/** Vendor support desk: open issues, one click hands an issue to DIGIT support; the hand-over state shows per issue. */
export function SupportDeskPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser(); useScopeMetas(["Issue"]);
  if (!canReadType("Issue")) return <Denied />;
  const issues = adapter.list("Issue").filter((i) => i["status"] !== "Closed").sort((a, b) => String(b["opening_date"] ?? "").localeCompare(String(a["opening_date"] ?? "")) || b.name.localeCompare(a.name));
  const sent = integrationLogs({ engine: "support_desk" }); const may = can("write", user);
  return <div className="space-y-3" data-support-desk>
    <Bar>{can("create", user) ? <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "issue", name: "new" }} className="btn-primary" data-band-primary data-support-new>{t("New issue", "طلب جديد")}</Link>
      : <button type="button" className="btn-primary" data-band-primary data-support-new disabled title={t("Your role may not open support requests", "لا يسمح دورك بفتح طلبات الدعم")}>{t("New issue", "طلب جديد")}</button>}</Bar>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Kpi id="open" label={t("Open issues", "طلبات مفتوحة")} value={issues.length.toLocaleString("en-US")} />
      <Kpi id="sent" label={t("Sent to DIGIT support", "أُرسلت لدعم ديجيت")} value={sent.length.toLocaleString("en-US")} />
      <Kpi id="awaiting" label={t("Awaiting provider", "بانتظار المزوّد")} value={sent.filter((r) => r.status === "Awaiting Provider").length.toLocaleString("en-US")} />
      <Kpi id="answered" label={t("Answered", "تم الرد")} value={sent.filter((r) => r.status === "Accepted" || r.status === "Sent").length.toLocaleString("en-US")} />
    </div>
    <EntFrame id="support-issues" title={t("Open support issues", "طلبات الدعم المفتوحة")} note={t("Send an issue to DIGIT support when your team cannot solve it; the issue stays your record.", "أرسل الطلب إلى دعم ديجيت إذا تعذّر حله داخليًا؛ يبقى الطلب سجلًا لديك.")}
>
      <ProviderNote engine="support_desk" />
      {issues.length ? <div className="mt-2 overflow-auto"><EntTable id="support-issues" wrap><table className="w-full text-sm" data-support-rows={issues.length}>
        <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-start">{t("Issue", "الطلب")}</th><th className="p-2 text-start">{t("Subject", "الموضوع")}</th><th className="p-2 text-start">{t("Priority", "الأولوية")}</th><th className="p-2 text-start">{t("DIGIT support", "دعم ديجيت")}</th><th className="p-2" /></tr></thead>
        <tbody>{issues.slice(0, 50).map((i) => { const st = latestStatus("support_desk", "Issue", i.name); return <tr key={i.name} className="border-t border-border" data-support-issue={i.name}>
          <td className="p-2">{issueLink(i.name)}</td><td className="p-2" data-no-i18n>{String(i["subject"] ?? "")}</td><td className="p-2">{String(i["priority"] ?? "")}</td>
          <td className="p-2"><span className={`ent-qv-status ent-qv-tone-${tone(st)}`} data-support-status={st}>{pick(ar, STATUS_LABEL[st])}</span></td>
          <td className="p-2 text-end">{may && <button type="button" className="btn-ghost" data-support-send={i.name} onClick={() => { const r = escalateIssue(i, user); if (r.ok) toast.success(pick(ar, STATUS_LABEL[r.log.status])); else toast.error(pick(ar, r.reason)); }}>{st === "Not sent" ? t("Send to DIGIT support", "إرسال لدعم ديجيت") : t("Send again", "إعادة الإرسال")}</button>}</td>
        </tr>; })}</tbody></table></EntTable></div> : <p className="mt-2 text-sm text-muted-foreground" data-support-none>{t("No open issue.", "لا يوجد طلب مفتوح.")}</p>}
    </EntFrame>
    <ScreenReports />
    <EntFrame id="support-log" title={t("Sent to DIGIT support", "ما أُرسل لدعم ديجيت")}><IntegrationLogTable rows={sent} ar={ar} /></EntFrame>
    <p className="text-xs text-muted-foreground" data-support-company data-no-i18n>{c.company}</p>
  </div>;
}

/** Live chat with a person: the request becomes a support issue and is handed to the chat service. */
export function LiveChatPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser(); useScopeMetas(["Issue"]);
  const [f, setF] = useState({ topic: "", message: "", phone: "" });
  if (!canReadType("Issue")) return <Denied />;
  const rows = integrationLogs({ engine: "live_chat" }); const may = can("create", user);
  return <>
    <Bar><GoToAction to='[data-ent-frame="chat-request"]' data-chat-go>{t("Request a chat", "اطلب محادثة")}</GoToAction></Bar>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" data-live-chat>
    <EntFrame id="chat-request" title={t("Chat with a person", "تحدّث مع موظف")} note={t("Describe what you need; an agent joins when the chat service is connected. Your request is kept as a support issue.", "صف ما تحتاجه؛ ينضم موظف عند ربط خدمة المحادثة. يُحفظ طلبك كطلب دعم.")}>
      <ProviderNote engine="live_chat" />
      {may ? <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); const r = requestChat({ topic: f.topic, message: f.message, ...(f.phone ? { phone: f.phone } : {}), user, company: c.company }); if (r.ok) { setF({ topic: "", message: "", phone: "" }); toast.success(`${pick(ar, STATUS_LABEL[r.log.status])} · ${r.issue.name}`); } else toast.error(pick(ar, r.reason)); }}>
        <Field label={t("Topic", "الموضوع")}><input className="field-input w-full" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} data-chat-topic /></Field>
        <Field label={t("Message", "الرسالة")}><textarea className="field-input min-h-24 w-full" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} data-chat-message /></Field>
        <Field label={t("Mobile (optional)", "الجوال (اختياري)")}><input className="field-input w-full" dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-chat-phone data-no-i18n /></Field>
        <button type="submit" className="btn-primary" data-chat-send>{t("Request a chat", "اطلب محادثة")}</button>
      </form> : <p className="mt-2 text-sm text-muted-foreground" data-chat-denied>{t("You may not open support requests.", "لا يمكنك فتح طلبات دعم.")}</p>}
    </EntFrame>
    <EntFrame id="chat-requests" title={t("Your chat requests", "طلبات المحادثة")}>
      {rows.length ? <ul className="space-y-2" data-chat-rows={rows.length}>{rows.map((r) => <li key={r.name} className="ent-frame flex flex-wrap items-center gap-2 p-2" data-chat-row={r.reference_name}>
        {issueLink(r.reference_name)}<span className="min-w-0 flex-1 text-sm" data-no-i18n>{r.summary}</span>
        <span className={`ent-qv-status ent-qv-tone-${tone(r.status)}`}>{pick(ar, STATUS_LABEL[r.status])}</span><span className="text-xs tabular-nums text-muted-foreground" data-no-i18n>{r.last_attempt}</span></li>)}</ul>
        : <p className="text-sm text-muted-foreground" data-chat-none>{t("No chat request yet.", "لا توجد طلبات محادثة بعد.")}</p>}
    </EntFrame>
  </div></>;
}

/** Issue form panel: hand this issue to DIGIT support and see its state. */
export function IssueSupportPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const st = latestStatus("support_desk", "Issue", doc.name); const may = can("write", user, doc);
  return <EntFrame id="support-desk" title={t("DIGIT support", "دعم ديجيت")} actions={<span className={`ent-qv-status ent-qv-tone-${tone(st)}`} data-support-status={st}>{pick(ar, STATUS_LABEL[st])}</span>}>
    <ProviderNote engine="support_desk" />
    {may && doc["status"] !== "Closed" && <button type="button" className="btn-ghost mt-2" data-support-send={doc.name} onClick={() => { const r = escalateIssue(doc, user); if (r.ok) toast.success(pick(ar, STATUS_LABEL[r.log.status])); else toast.error(pick(ar, r.reason)); }}>{st === "Not sent" ? t("Send to DIGIT support", "إرسال لدعم ديجيت") : t("Send again", "إعادة الإرسال")}</button>}
  </EntFrame>;
}
