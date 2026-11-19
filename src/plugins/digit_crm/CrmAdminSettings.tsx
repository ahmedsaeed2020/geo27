/**
 * CRM admin settings (owner request 2026-11-19): sales team access, display currency and editable lead statuses, all
 * written to the CRM's own records (User, FCRM Settings custom_currency, CRM Lead Status) so every CRM screen follows them.
 */
import { useState } from "react";
import { toast } from "sonner";
import { adapter } from "@/lib/adapter";
import { isManager } from "./wf01";
import { LEAD_STATUS_AR } from "./leadDesk";
import { tx } from "./CrmRecordParts";

const SETTINGS = "FCRM Settings";
const CURRENCIES = [["SAR", "ريال سعودي"], ["EGP", "جنيه مصري"], ["AED", "درهم إماراتي"], ["KWD", "دينار كويتي"], ["QAR", "ريال قطري"], ["BHD", "دينار بحريني"], ["OMR", "ريال عماني"], ["JOD", "دينار أردني"], ["USD", "دولار أمريكي"], ["EUR", "يورو"]] as const;
const ROLES = [["Sales User", "مندوب مبيعات", "Sales rep"], ["Sales Manager", "مدير مبيعات", "Sales manager"]] as const;
const TYPES = [["Open", "مفتوحة"], ["Ongoing", "جارية"], ["Won", "ناجحة / محوّلة"], ["Lost", "مغلقة / غير مؤهلة"]] as const;
const s = (v: unknown) => String(v ?? "");

/** Display currency for every CRM amount (defaults to SAR). */
export const crmCurrency = () => s(adapter.get(SETTINGS, SETTINGS)?.["custom_currency"]) || "SAR";
/** Configured lead statuses, in their saved order. */
export const leadStatuses = () => adapter.list("CRM Lead Status").sort((a, b) => Number(a["position"] ?? 0) - Number(b["position"] ?? 0));

export function CrmAdminSettings({ user, ar }: { user: string; ar: boolean }) {
  const [, bump] = useState(0);
  const re = () => bump((x) => x + 1);
  if (!isManager(user)) return null;
  return <div className="grid gap-4 lg:grid-cols-3" data-crm-admin-settings>
    <Team ar={ar} onChange={re} />
    <Currency ar={ar} onChange={re} />
    <Statuses ar={ar} onChange={re} />
  </div>;
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <section className="ek-card ek-card-pad space-y-3"><div><h3 className="ek-h3">{title}</h3><p className="text-xs text-muted-foreground">{hint}</p></div>{children}</section>;
}

function Team({ ar, onChange }: { ar: boolean; onChange: () => void }) {
  const [f, setF] = useState({ name: "", email: "", role: "Sales User" });
  const roleOf = (u: Record<string, unknown>) => (Array.isArray(u["roles"]) ? (u["roles"] as Record<string, unknown>[]).map((r) => s(r["role"])) : []);
  const team = adapter.list("User").filter((u) => roleOf(u).some((r) => r === "Sales User" || r === "Sales Manager"));
  const add = () => {
    const email = f.email.trim().toLowerCase();
    if (!f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return void toast.error(tx(ar, "Enter a name and a valid email", "أدخل الاسم وبريدًا صحيحًا"));
    if (adapter.get("User", email)) return void toast.error(tx(ar, "This email already exists", "هذا البريد موجود بالفعل"));
    const [first, ...rest] = f.name.trim().split(/\s+/);
    adapter.insertDoc("User", { name: email, email, first_name: first, last_name: rest.join(" "), full_name: f.name.trim(), enabled: 1, user_type: "System User", roles: [{ doctype: "Has Role", role: f.role }] });
    setF({ name: "", email: "", role: "Sales User" }); toast.success(tx(ar, "Added to the sales team", "أُضيف إلى فريق المبيعات")); onChange();
  };
  const setRole = (email: string, role: string) => { adapter.update("User", email, { roles: [{ doctype: "Has Role", role }] }); onChange(); };
  const toggle = (email: string, on: boolean) => { adapter.update("User", email, { enabled: on ? 1 : 0 }); onChange(); };
  return <Card title={tx(ar, "Sales team", "فريق المبيعات")} hint={tx(ar, "Add reps and managers; a rep sees only the records assigned to them.", "أضف مندوبين ومديرين؛ المندوب يرى السجلات المسندة له فقط.")}>
    <div className="grid gap-2">
      <input className="field-input" placeholder={tx(ar, "Full name", "الاسم الكامل")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className="field-input" dir="ltr" type="email" placeholder="name@company.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <div className="flex gap-2"><select className="field-input flex-1" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([k, a, en]) => <option key={k} value={k}>{ar ? a : en}</option>)}</select>
        <button type="button" className="btn-primary" onClick={add} data-team-add>{tx(ar, "Add", "إضافة")}</button></div>
    </div>
    <ul className="divide-y divide-border text-sm">{team.map((u) => { const on = Number(u["enabled"] ?? 1) === 1; const r = roleOf(u).find((x) => x.startsWith("Sales")) ?? "Sales User"; return <li key={u.name} className="flex items-center gap-2 py-2">
      <span className="min-w-0 flex-1"><b className="block truncate" data-no-i18n>{s(u["full_name"]) || u.name}</b><small className="block truncate text-muted-foreground" dir="ltr" data-no-i18n>{u.name}</small></span>
      <select className="field-input min-h-8 w-auto text-xs" value={r} onChange={(e) => setRole(u.name, e.target.value)} aria-label={tx(ar, "Role", "الدور")}>{ROLES.map(([k, a, en]) => <option key={k} value={k}>{ar ? a : en}</option>)}</select>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={on} onChange={(e) => toggle(u.name, e.target.checked)} />{tx(ar, "Active", "نشط")}</label>
    </li>; })}{!team.length && <li className="py-2 text-muted-foreground">{tx(ar, "No team members yet.", "لا يوجد أعضاء بعد.")}</li>}</ul>
  </Card>;
}

function Currency({ ar, onChange }: { ar: boolean; onChange: () => void }) {
  const cur = crmCurrency();
  const save = (v: string) => { if (adapter.get(SETTINGS, SETTINGS)) adapter.update(SETTINGS, SETTINGS, { custom_currency: v }); else adapter.insertDoc(SETTINGS, { name: SETTINGS, custom_currency: v }); toast.success(tx(ar, `Currency: ${v}`, `العملة: ${v}`)); onChange(); };
  return <Card title={tx(ar, "Currency", "العملة")} hint={tx(ar, "Used for every amount shown in the CRM.", "تُستخدم في كل المبالغ المعروضة في الـ CRM.")}>
    <select className="field-input" value={cur} onChange={(e) => save(e.target.value)} data-crm-currency>{CURRENCIES.map(([k, a]) => <option key={k} value={k}>{ar ? `${a} (${k})` : k}</option>)}</select>
  </Card>;
}

function Statuses({ ar, onChange }: { ar: boolean; onChange: () => void }) {
  const [n, setN] = useState({ name: "", ar: "", type: "Ongoing", color: "#11E497" });
  const list = leadStatuses();
  const used = (k: string) => adapter.list("CRM Lead").some((l) => l["status"] === k);
  const add = () => {
    const name = n.name.trim(); if (!name) return void toast.error(tx(ar, "Enter the status name", "أدخل اسم الحالة"));
    if (adapter.get("CRM Lead Status", name)) return void toast.error(tx(ar, "This status already exists", "الحالة موجودة بالفعل"));
    adapter.insertDoc("CRM Lead Status", { name, lead_status: name, custom_label_ar: n.ar.trim(), type: n.type, color: n.color, position: list.length + 1 });
    setN({ name: "", ar: "", type: "Ongoing", color: "#11E497" }); onChange();
  };
  const patch = (k: string, p: Record<string, unknown>) => { adapter.update("CRM Lead Status", k, p); onChange(); };
  const move = (i: number, d: -1 | 1) => { const a = list[i], b = list[i + d]; if (!a || !b) return; adapter.update("CRM Lead Status", a.name, { position: i + d + 1 }); adapter.update("CRM Lead Status", b.name, { position: i + 1 }); list.forEach((x, j) => { if (j !== i && j !== i + d) adapter.update("CRM Lead Status", x.name, { position: j + 1 }); }); onChange(); };
  const del = (k: string) => { if (used(k)) return void toast.error(tx(ar, "Move the leads in this status first", "انقل العملاء من هذه الحالة أولًا")); if (!window.confirm(tx(ar, `Delete ${k}?`, `حذف الحالة ${LEAD_STATUS_AR[k] ?? k}؟`))) return; adapter.remove("CRM Lead Status", k); onChange(); };
  return <Card title={tx(ar, "Lead statuses", "حالات العملاء المحتملين")} hint={tx(ar, "Rename, recolour, reorder, add or delete statuses.", "عدّل الأسماء والألوان والترتيب، أو أضف واحذف حالات.")}>
    <ul className="grid gap-2 text-sm">{list.map((x, i) => <li key={x.name} className="flex items-center gap-1" data-status-row={x.name}>
      <input type="color" className="h-8 w-8 shrink-0 rounded" value={/^#[0-9a-f]{6}$/i.test(s(x["color"])) ? s(x["color"]) : "#11E497"} onChange={(e) => patch(x.name, { color: e.target.value })} aria-label={tx(ar, "Colour", "اللون")} />
      <input className="field-input min-h-8 flex-1 text-xs" value={s(x["custom_label_ar"]) || (ar ? LEAD_STATUS_AR[x.name] ?? "" : "")} placeholder={x.name} onChange={(e) => patch(x.name, { custom_label_ar: e.target.value })} aria-label={tx(ar, "Arabic label", "الاسم بالعربي")} />
      <select className="field-input min-h-8 w-auto text-xs" value={s(x["type"]) || "Ongoing"} onChange={(e) => patch(x.name, { type: e.target.value })} aria-label={tx(ar, "Type", "النوع")}>{TYPES.map(([k, a]) => <option key={k} value={k}>{ar ? a : k}</option>)}</select>
      <button type="button" className="btn-ghost px-1" disabled={!i} onClick={() => move(i, -1)} aria-label={tx(ar, "Up", "أعلى")}>↑</button>
      <button type="button" className="btn-ghost px-1" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={tx(ar, "Down", "أسفل")}>↓</button>
      <button type="button" className="btn-ghost px-1 text-[var(--negative)]" onClick={() => del(x.name)} aria-label={tx(ar, "Delete", "حذف")}>✕</button>
    </li>)}</ul>
    <div className="grid gap-2 border-t border-border pt-3">
      <div className="flex gap-2"><input className="field-input flex-1" dir="ltr" placeholder={tx(ar, "Name (English key)", "الاسم بالإنجليزي")} value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <input className="field-input flex-1" placeholder={tx(ar, "Arabic label", "الاسم بالعربي")} value={n.ar} onChange={(e) => setN({ ...n, ar: e.target.value })} /></div>
      <div className="flex gap-2"><select className="field-input flex-1" value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}>{TYPES.map(([k, a]) => <option key={k} value={k}>{ar ? a : k}</option>)}</select>
        <input type="color" className="h-9 w-10 rounded" value={n.color} onChange={(e) => setN({ ...n, color: e.target.value })} />
        <button type="button" className="btn-primary" onClick={add} data-status-add>{tx(ar, "Add status", "إضافة حالة")}</button></div>
    </div>
  </Card>;
}
