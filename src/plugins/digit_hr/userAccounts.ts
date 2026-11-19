/**
 * DEC-015 (owner ruling 18/11/2026): who needs a sign-in account. An explicit «يحتاج حساب مستخدم» value wins; a blank
 * one follows the default — Yes when the employee already signs in (self-service), approves for others (someone
 * reports to them) or works in an office; No for site crew trades. The «بلا حساب مستخدم» card and the profile gaps
 * count only employees who need an account and have none, so site workers never show as a gap.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { NEEDS_ACCOUNT_FIELD, SITE_TRADES } from "./accountNeedSpec";

const s = (v: unknown) => (v == null ? "" : String(v));
const TRADES = new Set<string>(SITE_TRADES);
export type AccountNeedReason = "set" | "linked" | "approver" | "site" | "office";
export interface AccountNeed { needs: boolean; reason: AccountNeedReason }

/** Employees at least one active employee reports to (approvers by default in HR). */
export function approverSet(list: Doc[] = adapter.list("Employee")): Set<string> {
  const out = new Set<string>();
  for (const e of list) if (s(e["status"] || "Active") === "Active" && s(e["reports_to"])) out.add(s(e["reports_to"]));
  return out;
}
export const isSiteWorker = (e: Doc) => TRADES.has(s(e["designation"]).trim());

export function accountNeed(e: Doc, approvers: Set<string> = approverSet()): AccountNeed {
  const v = s(e[NEEDS_ACCOUNT_FIELD]);
  if (v === "Yes" || v === "No") return { needs: v === "Yes", reason: "set" };
  if (s(e["user_id"])) return { needs: true, reason: "linked" };
  if (approvers.has(s(e.name))) return { needs: true, reason: "approver" };
  if (isSiteWorker(e)) return { needs: false, reason: "site" };
  return { needs: true, reason: "office" };
}

/** Names of employees that need no account (explicit No or the site-worker default); the account card excludes them. */
export function noAccountNeeded(list: Doc[] = adapter.list("Employee")): string[] {
  const ap = approverSet(list);
  return list.filter((e) => !accountNeed(e, ap).needs).map((e) => e.name);
}

export const NEED_REASON: Record<AccountNeedReason, [en: string, ar: string]> = {
  set: ["Set on the employee record", "محدد في سجل الموظف"],
  linked: ["Already signs in (self-service)", "يدخل بالفعل (خدمة ذاتية)"],
  approver: ["Approver — others report to this employee", "معتمد — موظفون يتبعون له"],
  site: ["Site worker", "عامل موقع"],
  office: ["Office staff", "موظف مكتب"],
};
