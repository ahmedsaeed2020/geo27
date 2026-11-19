/** Native Maintenance Visit semantics, shared by migration, seeds and controller writes. */
import { adapter } from '@/lib/adapter';
import { VISIT_DT, VISIT_FIELD_MAP } from './schema';
export function nativeVisit(data: Record<string, unknown>): Record<string, unknown> {
  const d = { ...data };
  for (const [old, field] of Object.entries(VISIT_FIELD_MAP)) if (old in d) { d[field] = d[old]; delete d[old]; }
  const job = adapter.get('FSM Job', String(d["job"] ?? ''));
  const site = adapter.get('FSM Service Site', String(d["site"] || job?.["site"] || ''));
  const customer = d["customer"] || job?.["customer"] || site?.["customer"];
  const cust = adapter.get('Customer', String(customer ?? ''));
  const stamp = String(d["arrived_on"] || d["scheduled_start"] || d["completed_on"] || d["creation"] || job?.["creation"] || site?.["creation"] || '').replace('T', ' ');
  return { ...d, customer, customer_name: d["customer_name"] || cust?.["customer_name"],
    company: d["company"] || job?.["company"] || site?.["company"], site: d["site"] || job?.["site"],
    naming_series: d["naming_series"] || 'MAT-MVS-.YYYY.-',
    mntc_date: d["mntc_date"] || stamp.slice(0, 10), mntc_time: d["mntc_time"] || stamp.slice(11, 19),
    completion_status: d["workflow_state"] === 'Completed' ? 'Fully Completed' : d["completion_status"] || 'Partially Completed',
    maintenance_type: d["maintenance_type"] || (d["visit_purpose"] === 'Emergency' ? 'Breakdown' : d["scheduled_start"] ? 'Scheduled' : 'Unscheduled'),
    status: d["status"] || 'Draft', customer_address: d["customer_address"] || site?.["address"],
    contact_person: d["contact_person"] || (site?.["contacts"] as Record<string, unknown>[] | undefined)?.find(c => c["contact"])?.["contact"] };
}
/** Legacy rows are retained as a rollback archive; never replace an existing native row. */
export function migrateFsmVisits() {
  return adapter.batch(() => {
    let count = 0;
    for (const d of adapter.list('FSM Visit')) if (!adapter.get(VISIT_DT, d["name"])) {
      adapter.insertDocQuiet(VISIT_DT, { ...nativeVisit(d), name: d["name"], doctype: VISIT_DT }); count++;
    }
    return count;
  });
}
