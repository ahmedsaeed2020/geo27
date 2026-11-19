/**
 * Outside services (round-2 ruling 5): Mudad, Qiwa, Muqeem, GOSI, LinkedIn, job boards, e-mail, SMS, the identity
 * provider and the AI provider each have a DIGIT HR Provider Setting (mode Simulated / Live (server) / Off). Every send
 * is a DIGIT Provider Exchange with an idempotency key and the export file it carries; processQueue() plays the
 * provider's side in the preview (acknowledges, or fails and schedules a retry up to the platform limit), so the whole
 * flow runs end to end in the app. In Live (server) mode the exchange stays queued for the Frappe connector named in
 * FRAPPE_DEVELOPER_GUIDE.md; Off refuses the send. The AI provider defaults to Off (rule-based assistants only).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { policyValue } from "../product/settings";
import { nowISO, s, n, todayISO } from "./write";

export const PSET = "DIGIT HR Provider Setting";
export const PEX = "DIGIT Provider Exchange";
export type Provider = "Mudad" | "Qiwa" | "Muqeem" | "GOSI" | "LinkedIn" | "Job Boards" | "Email" | "SMS" | "Identity Provider" | "AI";
export const PROVIDERS: { id: Provider; en: string; ar: string; ops: string[] }[] = [
  { id: "Mudad", en: "Mudad (wage protection)", ar: "مدد (حماية الأجور)", ops: ["WPS Upload", "Payroll Status"] },
  { id: "Qiwa", en: "Qiwa (contracts, work permits)", ar: "قوى (العقود ورخص العمل)", ops: ["Contract Authentication", "Work Permit"] },
  { id: "Muqeem", en: "Muqeem (iqama services)", ar: "مقيم (خدمات الإقامة)", ops: ["Iqama Renewal", "Exit Re-entry Visa"] },
  { id: "GOSI", en: "GOSI (social insurance)", ar: "التأمينات الاجتماعية", ops: ["Monthly Contribution", "Register Employee", "Wage Change"] },
  { id: "LinkedIn", en: "LinkedIn (jobs and sourcing)", ar: "لينكدإن (الوظائف والاستقطاب)", ops: ["Post Job", "Import Profile"] },
  { id: "Job Boards", en: "Job boards (Bayt, Indeed, Tanqeeb)", ar: "مواقع الوظائف (بيت، إنديد، تنقيب)", ops: ["Post Job"] },
  { id: "Email", en: "E-mail", ar: "البريد الإلكتروني", ops: ["Send", "Scheduled Report", "Password Reset"] },
  { id: "SMS", en: "SMS", ar: "الرسائل النصية", ops: ["Send"] },
  { id: "Identity Provider", en: "Identity provider (single sign-on)", ar: "مزود الهوية (الدخول الموحد)", ops: ["Provision User", "Disable User", "Grant Access", "Revoke Access"] },
  { id: "AI", en: "AI provider", ar: "مزود الذكاء الاصطناعي", ops: ["Summarise", "Answer"] },
];
export type Mode = "Simulated" | "Live (server)" | "Off";
/** The provider's mode: its setting record, else Simulated (AI: Off unless the platform setting enables it). */
export function providerMode(p: Provider): Mode {
  const rec = adapter.list(PSET).filter((d) => d["provider"] === p).sort((a, b) => s(b.modified).localeCompare(s(a.modified)))[0];
  if (rec?.["mode"]) return rec["mode"] as Mode;
  if (p === "AI") return (policyValue("ai_assist_enabled", todayISO()) ?? 0) > 0 ? "Simulated" : "Off";
  return "Simulated";
}
/** Stable short hash (FNV-1a) for idempotency keys. */
export function hashOf(text: string): string { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }

export interface QueueInput { provider: Provider; operation: string; doctype?: string; name?: string; payload: unknown; file_name?: string; key?: string }
/** Queue one exchange. The same provider + operation + record + payload is queued once (idempotent). */
export function queueExchange(q: QueueInput): { doc?: Doc; duplicate: boolean; refused?: [string, string] } {
  const mode = providerMode(q.provider);
  if (mode === "Off") return { duplicate: false, refused: [`${q.provider} is switched off in the provider settings.`, `المزود ${PROVIDERS.find((p) => p.id === q.provider)?.ar ?? q.provider} متوقف في إعدادات المزودين.`] };
  const payload = typeof q.payload === "string" ? q.payload : JSON.stringify(q.payload, null, 1);
  const key = q.key ?? `${q.provider}|${q.operation}|${q.doctype ?? ""}|${q.name ?? ""}|${hashOf(payload)}`;
  const dup = adapter.list(PEX).find((d) => d["idempotency_key"] === key);
  if (dup) return { doc: dup, duplicate: true };
  const doc = adapter.insertDoc(PEX, { provider: q.provider, operation: q.operation, direction: "Outbound", reference_doctype: q.doctype ?? "", reference_name: q.name ?? "", idempotency_key: key, status: "Queued", file_name: q.file_name ?? "", payload, attempts: 0, response: mode === "Live (server)" ? "Waiting for the server connector" : "" });
  return { doc, duplicate: false };
}
/** Play the provider side for queued simulated exchanges. A payload carrying "simulate_failure" fails until the retry limit. */
export function processQueue(now = nowISO()): { sent: number; failed: number; parked: number } {
  const max = policyValue("integration_max_attempts", now.slice(0, 10)) ?? 5; const wait = policyValue("integration_retry_minutes", now.slice(0, 10)) ?? 15;
  let sent = 0, failed = 0, parked = 0;
  adapter.batch(() => {
    for (const d of adapter.list(PEX)) {
      const st = s(d["status"]); if (st !== "Queued" && st !== "Failed") continue;
      if (providerMode(d["provider"] as Provider) !== "Simulated") continue;
      if (st === "Failed" && (n(d["attempts"]) >= max || (d["next_retry_at"] && s(d["next_retry_at"]) > now))) continue;
      const attempts = n(d["attempts"]) + 1;
      if (s(d["payload"]).includes("simulate_failure")) {
        const next = new Date(Date.parse(now.replace(" ", "T") + "Z") + wait * 60000).toISOString().slice(0, 19).replace("T", " ");
        adapter.update(PEX, d.name, { status: "Failed", attempts, response: attempts >= max ? "Parked after the retry limit" : `Provider error; retry at ${next}`, next_retry_at: next });
        if (attempts >= max) parked++; else failed++;
        continue;
      }
      adapter.update(PEX, d.name, { status: "Acknowledged", attempts, sent_on: now, response: `${d["provider"]} acknowledged ${d["operation"]} (simulated reference ${hashOf(d.name).toUpperCase()})` });
      sent++;
    }
  });
  return { sent, failed, parked };
}
/** Retry one failed exchange now (same key, same payload; an acknowledged exchange is never resent). */
export function retryExchange(name: string): boolean {
  const d = adapter.get(PEX, name); if (!d || s(d["status"]) === "Acknowledged") return false;
  adapter.update(PEX, name, { status: "Queued", next_retry_at: "", response: "Retry requested" });
  return true;
}
/** Inbound event with an idempotency key: processed once; a replay of the same key is ignored (PLT-04). */
export function ingestEvent(system: string, key: string, payload: unknown, apply: () => void): { processed: boolean; event: Doc } {
  const EV = "DIGIT Integration Event";
  const prev = adapter.list(EV).find((d) => d["idempotency_key"] === key && d["external_system"] === system);
  if (prev && s(prev["status"]) === "Processed") { adapter.update(EV, prev.name, { attempts: n(prev["attempts"]) + 1 }); return { processed: false, event: adapter.get(EV, prev.name)! }; }
  apply();
  const ev = prev ? (adapter.update(EV, prev.name, { status: "Processed", attempts: n(prev["attempts"]) + 1 }), adapter.get(EV, prev.name)!) : adapter.insertDoc(EV, { external_system: system, idempotency_key: key, direction: "Inbound", attempts: 1, status: "Processed", payload: JSON.stringify(payload).slice(0, 2000) });
  return { processed: true, event: ev };
}
/** Exchanges of one record (for the "Sent to" strip on a form). */
export const exchangesOf = (doctype: string, name: string) => adapter.list(PEX).filter((d) => d["reference_doctype"] === doctype && d["reference_name"] === name);
