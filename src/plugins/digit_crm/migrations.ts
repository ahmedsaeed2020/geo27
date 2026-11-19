import { adapter } from "@/lib/adapter";
/** Stable names preserve references; never overwrite a user-edited migrated document. */
export function migrateCrmAnalytics() {
  adapter.batch(() => {
    for (const suffix of ["Forecast", "Campaign Spend", "Commission"]) {
      for (const record of adapter.list(`DIGIT CRM Demo ${suffix}`)) {
        const dt = `DIGIT CRM ${suffix}`;
        if (!adapter.get(dt, record.name)) adapter.insertDocQuiet(dt, { ...record, doctype: dt });
      }
    }
    // Annual native targets always win; sum historical monthly amounts only for a missing year.
    for (const record of adapter.list("DIGIT CRM Demo Target")) {
      const sp = adapter.get("Sales Person", String(record['sales_person'])); if (!sp) continue;
      const targets = Array.isArray(sp['targets']) ? sp['targets'] as Record<string, unknown>[] : [];
      const year = String(record['period']).slice(0, 4);
      if (targets.some(t => t['fiscal_year'] === year)) continue;
      const sameYear = adapter.list("DIGIT CRM Demo Target").filter(t => t['sales_person'] === sp.name && String(t['period']).slice(0, 4) === year);
      adapter.update("Sales Person", sp.name, { targets: [...targets, { fiscal_year: year, target_amount: sameYear.reduce((s, t) => s + Number(t['target_amount'] ?? 0), 0), target_qty: 0, item_group: "" }] });
    }
  });
}
