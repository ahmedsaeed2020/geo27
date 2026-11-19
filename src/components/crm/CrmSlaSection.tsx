import { useEffect, useState } from "react";
import type { Doc } from "@/lib/adapter";
import { useL } from "./crmI18n";

export function CrmSlaSection({ doc }: { doc: Doc }) {
  const { L } = useL(); const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  if (!doc["sla"]) return null;
  const due = Date.parse(String(doc["response_by"])); const replied = Boolean(doc["first_responded_on"]); const failed = replied ? due < Date.parse(String(doc["first_responded_on"])) : now > due;
  const seconds = Math.max(0, Math.floor(Math.abs(due - now) / 1000));
  return <section className="border-t border-crm-line p-4 space-y-2 text-sm" aria-label={L("SLA")}><h3 className="font-medium">{L("SLA")}</h3><div data-no-i18n>{String(doc["sla"])}</div><div role="status">{L(failed ? "Failed" : replied ? "Fulfilled" : "First Response Due")}</div>{Number.isFinite(due) && <><time data-no-i18n dateTime={String(doc["response_by"])}>{String(doc["response_by"])}</time>{!replied && <div data-no-i18n>{failed ? "−" : ""}{Math.floor(seconds / 3600)}:{String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</div>}</>}</section>;
}