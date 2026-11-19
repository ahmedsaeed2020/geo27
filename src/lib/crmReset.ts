import { adapter } from "@/lib/adapter";
import { supabase } from "@/integrations/supabase/client";

/** Owner decision: DIGIT CRM starts empty (no sample data); website sign-ups arrive as CRM Leads. */
export const isCrmDoctype = (dt: string) => dt.startsWith("CRM ") || dt === "FCRM Note";
const FLAG = "digit-crm:reset-v3";

export function resetCrmOnce() {
  if (typeof localStorage === "undefined" || localStorage.getItem(FLAG)) return;
  const types = new Set<string>();
  for (const dt of ["CRM Lead", "CRM Deal", "CRM Organization", "CRM Contact", "Contact", "CRM Task", "CRM Note", "FCRM Note", "CRM Call Log", "CRM Notification", "CRM Campaign", "CRM Target", "CRM Commission"]) types.add(dt);
  for (const dt of types) { try { for (const d of adapter.list(dt)) if (dt !== "Contact" || d["__synthetic"]) adapter.remove(dt, d.name); } catch { /* unknown doctype */ } }
  // activities logged against CRM records (emails, to-dos, events, comments, versions)
  for (const dt of ["Communication", "ToDo", "Event", "Comment", "Version", "Notification Log", "Activity Log"]) {
    try { for (const d of adapter.list(dt)) { const ref = String(d["reference_doctype"] ?? d["ref_doctype"] ?? d["document_type"] ?? ""); if (isCrmDoctype(ref)) adapter.remove(dt, d.name); } } catch { /* unknown doctype */ }
  }
  localStorage.setItem(FLAG, "1");
}

/** Copies website sign-ups (admin-readable leads) into DIGIT CRM as new, unassigned CRM Leads. */
export async function syncSiteLeads() {
  const { data, error } = await supabase.from("leads").select("id,name,email,phone,company,source,created_at").is("merged_into", null).order("created_at", { ascending: false }).limit(500);
  if (error || !data) return;
  for (const l of data) {
    const name = `WEB-${l.id.slice(0, 8)}`;
    if (adapter.get("CRM Lead", name)) continue;
    adapter.insertDocQuiet("CRM Lead", { name, first_name: l.name, lead_name: l.name, email: l.email ?? "", mobile_no: l.phone ?? "", organization: l.company ?? "", source: l.source || "Website", status: "New", lead_owner: "", converted: 0, creation: l.created_at });
  }
}
