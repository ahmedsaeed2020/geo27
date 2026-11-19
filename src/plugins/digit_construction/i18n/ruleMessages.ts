/**
 * Arabic display of DIGIT Construction rule messages raised in the browser.
 *
 * The browser rules (domain/hooks.ts, domain/services.ts …) refuse a change with an English message built from the same
 * templates the Frappe server rules use (SERVER_MESSAGES_AR keys, `{0}` slots). On Arabic screens a refusal is shown with
 * the Arabic template; slot values stay exactly as raised (record names, amounts, dates), except fixed labels that have
 * their own Arabic (policy actions, DocType names) — the same rule as the server, where only `T(...)` labels are
 * translated. Display only: stored values and the English messages the rules and tests compare are unchanged.
 */
import { POLICY_AFFECTS } from "../domain/data";
import { P8_CHECKLIST } from "../domain/calc";
import { DOCTYPE_AR } from "../schema";
import { SERVER_MESSAGES_AR } from "./ruleMessagesAr";

/** Field, state and status labels the ported rules pass as fixed T(...) labels (negative-value checks, decision states). */
export const FIXED_LABELS_AR: Record<string, string> = {
  "meter start": "قراءة بداية العداد", "meter end": "قراءة نهاية العداد", "idle hours": "ساعات التوقف", "downtime hours": "ساعات التعطل", "fuel litres": "لترات الوقود",
  "hourly rate": "سعر الساعة", "daily rate": "السعر اليومي", "weekly rate": "السعر الأسبوعي", "monthly rate": "السعر الشهري",
  Rejected: "مرفوض", Closed: "مغلق", Returned: "مُعاد", Completed: "مكتمل", Cancelled: "ملغى", open: "مفتوح",
  // project roles and the app roles a delegate must hold (team rules F01-02)
  "Project Manager": "مدير مشروع", QS: "مهندس كميات", "Site Engineer": "مهندس موقع", Foreman: "مراقب عمال", Procurement: "مسؤول مشتريات", Accountant: "محاسب", Planner: "مخطط", Safety: "مسؤول سلامة",
  "Digit Project Manager": "مدير المشروع", "Digit QS": "مهندس الكميات", "Digit Site Engineer": "مهندس الموقع", "Digit Procurement Officer": "مسؤول المشتريات", "Digit Accountant": "المحاسب",
};
/** Fixed labels that appear inside rule messages and have their own Arabic (exported into the app's ar.csv too). */
export const RULE_LABELS_AR: Record<string, string> = { ...Object.fromEntries(Object.values(POLICY_AFFECTS).map(([en, ar]) => [en, ar])), ...Object.fromEntries(P8_CHECKLIST.map(([, en, ar]) => [en, ar])), ...FIXED_LABELS_AR };

type Compiled = { re: RegExp; slots: number[]; ar: string };
let compiled: Compiled[] | null = null;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(): Compiled[] {
  const out: Compiled[] = [];
  for (const [en, ar] of Object.entries(SERVER_MESSAGES_AR)) {
    const slots: number[] = [];
    const src = en.split(/(\{\d+\})/).map((part) => {
      const m = part.match(/^\{(\d+)\}$/);
      if (m) { slots.push(Number(m[1])); return "([\\s\\S]*?)"; }
      return escape(part);
    }).join("");
    out.push({ re: new RegExp(`^${src}$`), slots, ar });
  }
  // the most specific template wins: longer fixed text first
  return out.sort((a, b) => b.re.source.replace(/\(\[\\s\\S\]\*\?\)/g, "").length - a.re.source.replace(/\(\[\\s\\S\]\*\?\)/g, "").length);
}

const label = (v: string) => RULE_LABELS_AR[v] ?? DOCTYPE_AR[v] ?? v;

/** One message line → Arabic when it matches a known rule template; any other text is returned unchanged. */
export function ruleMessageAr(line: string): string {
  const text = line.trim();
  if (!text) return line;
  if (SERVER_MESSAGES_AR[text]) return SERVER_MESSAGES_AR[text]!;
  compiled ??= compile();
  for (const c of compiled) {
    const m = text.match(c.re);
    if (!m) continue;
    const values: Record<number, string> = {};
    c.slots.forEach((slot, i) => { values[slot] = label(m[i + 1] ?? ""); });
    return c.ar.replace(/\{(\d+)\}/g, (_x, n: string) => values[Number(n)] ?? "");
  }
  return line;
}

/** A message that may hold several lines (errors joined with "\n"). */
export function localizeRuleMessage(text: string, ar: boolean): string {
  if (!ar || !text) return text;
  return text.split("\n").map(ruleMessageAr).join("\n");
}
