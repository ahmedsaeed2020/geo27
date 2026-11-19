/**
 * Preview runner of the Construction alerts (domain/alertDefs.ts): Value Change alerts fire from a document hook when
 * the watched field changes to a value meeting the condition; Days Before alerts are raised by runDateAlerts() for
 * documents whose date falls within the advance window (once per document and date). Both write one Notification Log
 * per recipient (runtime.ts notificationRecipients), exactly like the Core notifications, so the bell shows them.
 * On the Frappe host the server sends them natively and nothing runs here.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { fill, isEnabled, notificationRecipients, value } from "../../runtime";
import type { Notification } from "../../types";
import { CONSTRUCTION_ALERTS } from "./alertDefs";
import { isFrappeHost } from "./host";
import { inSystem } from "./data";

const APP = "digit_construction";
const ok = (n: Notification, d: Doc) => !n.condition || !!value(n.condition, d);
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-");
function write(n: Notification, d: Doc, key: string) {
  notificationRecipients(n, d).forEach((u, i) => {
    const name = `${key}-${i}`; if (adapter.get("Notification Log", name)) return;
    adapter.insertDocQuiet("Notification Log", { name, subject: fill(n.subject, d), ...(n.subject_ar ? { subject_ar: fill(n.subject_ar, d) } : {}), email_content: fill(n.message, d), for_user: u, from_user: d["modified_by"] ?? d["owner"] ?? "",
      type: "Alert", document_type: n.document_type, document_name: d.name, read: 0, creation: new Date().toISOString(), digit_alert: n.name });
  });
}
const active = (d: Doc) => isEnabled(APP) && !isFrappeHost() && !d["__synthetic"];
// a user change of an existing document (frappe: doc_before_save); the demo installer (asSystem) raises none

// Value Change: the watched field moved to a value that meets the condition
for (const dt of new Set(CONSTRUCTION_ALERTS.filter((n) => n.event === "Value Change").map((n) => n.document_type))) {
  registerDocHook(dt, (doc, before) => ({ doc, after: (x) => {
    if (!before || inSystem() || !active(x)) return;
    for (const n of CONSTRUCTION_ALERTS) if (n.document_type === dt && n.event === "Value Change" && n.value_changed && String(before?.[n.value_changed] ?? "") !== String(x[n.value_changed] ?? "") && ok(n, x))
      write(n, x, `CNV-${slug(n.name)}-${x.name}-${slug(String(x[n.value_changed] ?? ""))}-${Date.now().toString(36)}`);
  } }));
}

/** Days Before alerts due today: date − today between 0 and days_in_advance; one log per document, date and recipient. */
export function runDateAlerts(today = new Date().toISOString().slice(0, 10)): number {
  let n = 0;
  const t = Date.parse(today);
  for (const a of CONSTRUCTION_ALERTS.filter((x) => x.event === "Days Before" && x.date_changed)) for (const d of adapter.list(a.document_type)) {
    if (!active(d)) continue;
    const v = String(d[a.date_changed!] ?? ""); if (!/^\d{4}-\d{2}-\d{2}/.test(v)) continue;
    const days = Math.round((Date.parse(v.slice(0, 10)) - t) / 86400000);
    if (days < 0 || days > (a.days_in_advance ?? 0) || !ok(a, d)) continue;
    const key = `CND-${slug(a.name)}-${d.name}-${v.slice(0, 10)}`;
    if (!adapter.get("Notification Log", `${key}-0`)) { write(a, d, key); n++; }
  }
  return n;
}
