import { migrateFsmVisits } from "../visitNative";
/**
 * Installs the DIGIT FSM demo v2 (demo/v2.ts) relative to today:
 *  - normal path: the shared memory-only sample layer (src/lib/volume) runs fsmVolume on every visit, so dates always
 *    follow today and nothing is written to browser storage until a user edits a record;
 *  - once per browser, the earlier fixed-date demo (seed.ts v1, installed in one batch with «FSM Settings») is removed
 *    when none of its records was edited after installation — records a user created or changed are never touched;
 *  - when the sample layer is switched off, the same set is written to the store (insert-if-missing) instead.
 * Arabic / English display of the demo names registers here (display only; stored values stay as generated).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { addSampleNameResolver, addSampleNameResolverEn } from "@/i18n";
import { deletedIndex, deletedKey } from "@/lib/deletedDocs";
import { postVouchers } from "@/lib/posting";
import { wasRenamed } from "@/lib/rename";
import { volumeEnabled, type VolumeContext } from "@/lib/volume";
import { FSM_DOCTYPE_NAMES } from "../schema";
import { buildFsmDemo, type DemoStats } from "./v2";
import { fsmNameAr, fsmNameEn } from "./names";

addSampleNameResolver(fsmNameAr);
addSampleNameResolverEn(fsmNameEn);
// FSM notes written by the preview (offline conflict reasons, charge basis) are stored "English ‖ Arabic"; each screen shows its own half
const BI = " ‖ ";
addSampleNameResolver((v) => (v.includes(BI) ? v.split(BI)[1] : undefined));
addSampleNameResolverEn((v) => (v.includes(BI) ? v.split(BI)[0] : undefined));

const V2_FLAG = "digit-fsm:demo-v2";
const NATIVE_FSM = ["Maintenance Visit", "Customer", "Supplier", "Item", "Employee", "Issue", "Quotation", "Material Request"];
const MIN5 = 5 * 60000;
const ms = (v: unknown) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
/** The fixed-date v1 demo records that nobody edited: same install moment as «FSM Settings», never modified after it. */
export function v1DemoRecords(): [string, string][] {
  const set = adapter.get("FSM Settings", "FSM Settings");
  if (!set || set["__fsm_demo"] === 2 || adapter.isEphemeral("FSM Settings", "FSM Settings")) return [];
  const t0 = ms(set["creation"]); if (!Number.isFinite(t0)) return [];
  const untouched = (d: Doc) => { const c = ms(d["creation"]), m = ms(d["modified"] ?? d["creation"]); return !d["__sample"] && Math.abs(c - t0) < MIN5 && Math.abs(m - c) < MIN5; };
  const out: [string, string][] = [];
  for (const dt of [...FSM_DOCTYPE_NAMES, ...NATIVE_FSM]) for (const d of adapter.list(dt)) {
    if (!FSM_DOCTYPE_NAMES.has(dt) && !d.name.startsWith("FSM-")) continue;
    if (adapter.isEphemeral(dt, d.name)) continue;
    if (untouched(d)) out.push([dt, d.name]);
  }
  return out;
}
function retireV1(): number {
  if (typeof localStorage === "undefined") return 0;
  try { if (localStorage.getItem(V2_FLAG)) return 0; } catch { return 0; }
  const recs = v1DemoRecords(); const keys = new Set(recs.map(([dt, n]) => `${dt}\u0001${n}`));
  const set = adapter.get("FSM Settings", "FSM Settings"); const t0 = ms(set?.["creation"]);
  const n = keys.size ? adapter.purge((dt, d) => keys.has(`${dt}\u0001${d.name}`) || (dt === "Version" && String(d["ref_doctype"] ?? "").startsWith("FSM ") && Math.abs(ms(d["creation"]) - t0) < MIN5)) : 0;
  try { localStorage.setItem(V2_FLAG, new Date().toISOString()); } catch { /* storage blocked */ }
  return n;
}

let lastStats: DemoStats | null = null;
export const fsmDemoStats = () => lastStats;
/** Sample-layer provider (registered in boot.ts). */
export function fsmVolume(ctx: VolumeContext) {
  retireV1();
  lastStats = buildFsmDemo((dt, name, data) => ctx.put(dt, name, data), (dt, name) => ctx.voucher(dt, name));
}
/** Build now: in memory when the sample layer is on (the app was enabled after the layer was built), else in the store. */
export function installFsmDemoV2(): number {
  migrateFsmVisits();
  const gone = deletedIndex(); let n = 0; const vouchers: [string, Doc][] = [];
  const mem = volumeEnabled();
  const put = (dt: string, name: string, data: Record<string, unknown>) => {
    if (adapter.get(dt, name) || wasRenamed(dt, name) || gone.has(deletedKey(dt, name))) return false;
    adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1, ...(mem ? { __sample: "volume" } : {}) }); n++; return true;
  };
  const run = () => { retireV1(); lastStats = buildFsmDemo(put, (dt, name) => { const d = adapter.get(dt, name); if (d && Number(d.docstatus) === 1) vouchers.push([dt, d]); }); postVouchers(vouchers); };
  if (mem) adapter.ephemeral(run); else adapter.batch(run);
  return n;
}
