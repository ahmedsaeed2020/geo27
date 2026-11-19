/**
 * F3-03 shared FSM risk pieces: the deficiency chain (ملاحظة → مسعّرة → معتمدة → إصلاح → إعادة فحص → مغلقة) read from the
 * finding's own state, quotation, repair job and retests, and the impairment banner shown on the site, system, device,
 * run and finding pages whenever an impairment interval is active. Both read records only; actions stay in services.
 */
import type { ReactNode } from "react";
import type { Doc } from "@/lib/adapter";
import { AlertBanner, StageProgress } from "@/components/enterprise/kit";
import { list, raw } from "../domain/data";
import { s } from "../domain/rules";
import * as svc from "../domain/services";
import { nm } from "./dayBoard";
import { ActionButton, AppLink, dtTxt, opt, useFx } from "./kit";

export const CHAIN = [
  { key: "noted", en: "Finding", ar: "ملاحظة", hue: "var(--ek-risk)" }, { key: "quoted", en: "Quoted", ar: "مسعّرة", hue: "var(--gold)" },
  { key: "approved", en: "Approved", ar: "معتمدة", hue: "var(--blue)" }, { key: "repair", en: "Repair", ar: "إصلاح", hue: "var(--violet)" },
  { key: "retest", en: "Retest", ar: "إعادة فحص", hue: "var(--teal)" }, { key: "closed", en: "Closed", ar: "مغلقة", hue: "var(--ek-good)" },
] as const;
/** Chain position of a finding (−1 = off the chain: rejected, duplicate or disputed). */
export function chainIndex(d: Doc): number {
  const st = s(d["workflow_state"]);
  if (st === "Verified Closed") return 5;
  if (st === "Retest Pending") return 4;
  if (st === "Approved for Repair") { const j = raw("FSM Job", d["repair_job"]); return j ? 3 : 2; }
  if (st === "Quoted") return 1;
  if (st === "Open") return 0;
  return -1;
}
export function DefChain({ d, compact }: { d: Doc; compact?: boolean }) {
  const { ar } = useFx(); const i = chainIndex(d);
  const stages = CHAIN.map((c) => ({ key: c.key, label: ar ? c.ar : c.en, hue: c.hue }));
  if (i < 0) return <span className="fsm-chain-off" data-def-chain="off">{opt(d["workflow_state"], ar)}</span>;
  return <StageProgress stages={stages} current={i} ar={ar} attrs={{ "data-def-chain": CHAIN[i]!.key, ...(compact ? { "data-compact": "" } : {}) }}
    label={compact ? undefined : <span><b>{stages[i]!.label}</b>{i < 5 && <span className="text-muted-foreground"> · {ar ? "التالي" : "next"}: {stages[i + 1]!.label}</span>}</span>} />;
}

/** Active impairment intervals for a site and / or a system. */
export function activeImpairments(o: { site?: unknown; system?: unknown }): Doc[] {
  return list("FSM Impairment").filter((i) => s(i["status"]) === "Active" && (o.system ? s(i["system"]) === s(o.system) : o.site ? s(i["site"]) === s(o.site) : false));
}
export function ImpairmentBanner({ site, system, extra }: { site?: unknown; system?: unknown; extra?: ReactNode }) {
  const { t, ar } = useFx(); const xs = activeImpairments({ site, system });
  if (!xs.length) return null;
  return <AlertBanner tone="bad" attrs={{ "data-impairment-banner": String(xs.length) }}
    title={system ? t("This system is impaired — protection is reduced", "هذا النظام متعطّل — الحماية منقوصة") : t(`${xs.length} system impairment(s) active on this site`, `${xs.length} تعطّل قائم في أنظمة هذا الموقع`)}
    lines={xs.slice(0, 4).map((i) => <span key={i.name}><b data-no-i18n>{nm("FSM Service System", i["system"], ar)}</b> · {opt(i["scope"], ar) || "—"} · {t("since", "منذ")} <span data-no-i18n>{dtTxt(i["started_on"])}</span>{i["fire_watch"] ? <> · {t("fire watch in place", "حراسة حريق قائمة")}</> : null}{i["deficiency"] ? <> · <AppLink to={`deficiency/${encodeURIComponent(s(i["deficiency"]))}`}>{t("finding", "الملاحظة")}</AppLink></> : null}</span>)}
    action={<>{xs.length === 1 && <ActionButton compact label={t("Restore to service", "إعادة للخدمة")} run={() => svc.restoreImpairment(xs[0]!.name)} />}<AppLink to="queue/impairments" className="btn-secondary min-h-9 px-3 text-sm inline-flex items-center">{t("All impairments", "كل التعطّلات")}</AppLink>{extra}</>} />;
}
