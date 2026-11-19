import { useState } from "react";
import { useLang } from "@/i18n";
import type { FormPanelProps } from "../experienceSlots";
import { postCommission } from "./commission";
import { STATEMENT } from "./commissionSchema";
/** Native document form extension, not a second commission store or screen. */
export function CommissionPanel({ meta, doc, dirty, canWrite }: FormPanelProps) {
  const lang = useLang();
  const [message, setMessage] = useState("");
  if (meta.name !== STATEMENT) return null;
  const ar = lang === "ar";
  return <section className="rounded-lg border p-4 space-y-2">
    <p>{ar ? "مصدر السطور: فواتير المبيعات المرحلة × نسبة العمولة على مندوب المبيعات. بعد الترحيل يصبح الكشف للقراءة فقط." : "Lines: submitted Sales Invoices × Sales Person commission rate. Posted statements are read-only."}</p>
    <button type="button" className="rounded border px-3 py-2" disabled={dirty || !canWrite || Boolean(doc["__islocal"])} onClick={() => { try { const result = postCommission(doc.name); setMessage(`${result.message} · ${result.journal_entry}`); } catch (e) { setMessage((e as Error).message); } }}>{ar ? "ترحيل العمولة" : "Post commission"}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
