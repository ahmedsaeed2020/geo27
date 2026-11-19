import { adapter, type Doc } from "./adapter";
import { cachedMeta, metaCount } from "./catalog";
import { pluginsEpoch, pluginsVersion } from "@/plugins/runtime";
import { scopedGet, scopedList } from "./scope";
import { currentUser } from "./session";

/** Event time, not document modification or a future follow-up deadline. */
const sources = [["Communication", "communication_date"], ["Email Queue", "creation"], ["CRM Task", "creation"], ["FCRM Note", "creation"], ["CRM Call Log", "start_time"], ["Event", "starts_on"], ["Comment", "creation"]] as const;
type ActivityRow = { doc: Doc; when: string };
let activityCache: { version: number; user: string; metaKey: string; rows: Map<string, ActivityRow[]> } | undefined;
/** The meta/plugin signature is the costly part of a lookup (plugin overlay per source DocType), and lists call this once
 *  per row. It is recomputed whenever a record write, a plugin change or a newly loaded meta could change it, and at the
 *  latest at the end of the current task, so one render pass computes it once. */
let keyMemo: { key: string; version: number; epoch: number; metas: number } | null = null;
function activityMetaKey() {
  const version = adapter.version(), epoch = pluginsEpoch(), metas = metaCount();
  if (keyMemo && keyMemo.version === version && keyMemo.epoch === epoch && keyMemo.metas === metas) return keyMemo.key;
  const key = `${pluginsVersion()}|${sources.map(([dt]) => Boolean(cachedMeta(dt))).join(",")}`;
  if (!keyMemo) queueMicrotask(() => { keyMemo = null; });
  keyMemo = { key, version, epoch, metas };
  return key;
}
export function crmActivityRows(doctype: string, name: string, user = currentUser()) {
  if (!scopedGet(doctype, name, user)) return [];
  const metaKey = activityMetaKey();
  if (!activityCache || activityCache.version !== adapter.version() || activityCache.user !== user || activityCache.metaKey !== metaKey) {
    const rows = new Map<string, ActivityRow[]>();
    for (const [dt, field] of sources) for (const doc of scopedList(dt, user)) {
      const when = String(doc[field] ?? doc["creation"] ?? ""); if (!Number.isFinite(Date.parse(when))) continue;
      const refs = [doc, ...(dt === "Event" && Array.isArray(doc["event_participants"]) ? doc["event_participants"] as Doc[] : [])];
      for (const key of new Set(refs.map(r => `${r["reference_doctype"] ?? r["reference_type"]}|${r["reference_docname"] ?? r["reference_name"]}`))) {
        const group = rows.get(key) ?? []; group.push({ doc, when }); rows.set(key, group);
      }
    }
    for (const group of rows.values()) group.sort((a, b) => Date.parse(b.when) - Date.parse(a.when));
    activityCache = { version: adapter.version(), user, metaKey, rows };
  }
  return activityCache.rows.get(`${doctype}|${name}`) ?? [];
}

export function lastCrmActivity(doctype: string, name: string, now = Date.now()) {
  return crmActivityRows(doctype, name).find(row => Date.parse(row.when) <= now)?.when ?? "";
}

/** Native first response wins; queued mail, inbound mail and scheduled tasks are not evidence of a response. */
export function firstCrmContact(lead: Doc): number | null {
  const created = Date.parse(String(lead["creation"] ?? ""));
  if (!Number.isFinite(created)) return null;
  const native = Date.parse(String(lead["first_responded_on"] ?? ""));
  if (Number.isFinite(native) && native >= created) return native;
  const times = crmActivityRows("CRM Lead", lead.name).filter(({ doc }) =>
    doc.doctype === "CRM Call Log" ? doc["status"] === "Completed" :
    doc.doctype === "Communication" && doc["sent_or_received"] === "Sent" && !["Queued", "Not Sent", "Error"].includes(String(doc["delivery_status"] ?? ""))
  ).map(row => Date.parse(row.when)).filter(time => time >= created && time <= Date.now());
  return times.length ? Math.min(...times) : null;
}