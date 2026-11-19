/**
 * Rich sample layer (owner 2026-10-19 "lots of data that does not affect the apps but fills every department's screens
 * and reports"). Built once per visit, after the standard seeds, inside adapter.ephemeral(): the records live in
 * memory only, are never written to browser storage, never overwrite an existing / renamed / deleted record, and every
 * submitted voucher is posted by posting.ts, so ledgers, outstanding, stock and reports stay consistent.
 * Apps may contribute their own sample records through registerVolumeProvider (app-owned code, enabled apps only).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { deletedIndex, deletedKey } from "@/lib/deletedDocs";
import { postVouchers } from "@/lib/posting";
import { wasRenamed } from "@/lib/rename";

import { erpVolume } from "./erp";
import { hrVolume } from "./hr";
import type { Rec } from "./kit";

const FLAG = "digit-virtual-core:sample-volume";

/** Context handed to app providers: insert-if-missing and voucher registration for posting. */
export interface VolumeContext {
  put(doctype: string, name: string, data: Record<string, unknown>): boolean;
  voucher(doctype: string, name: string): void;
}
type Provider = { app: string; run: (ctx: VolumeContext) => void; enabled: () => boolean };
const providers: Provider[] = [];
/** Apps register a sample provider from their boot module; it runs only while `enabled()` is true. */
export function registerVolumeProvider(app: string, run: (ctx: VolumeContext) => void, enabled: () => boolean) {
  if (!providers.some((p) => p.app === app)) providers.push({ app, run, enabled });
}

/** Whether the rich sample layer is switched on for this browser (default on). */
export function volumeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(FLAG) !== "off"; } catch { return true; }
}
/** Switch the layer on/off; off removes it now, on rebuilds it now. */
export function setVolumeEnabled(on: boolean): number {
  try { localStorage.setItem(FLAG, on ? "on" : "off"); } catch { /* storage blocked */ }
  if (!on) { built = false; return adapter.clearEphemeral(); }
  return seedVolume().inserted;
}

let built = false;
export interface VolumeStats { inserted: number; vouchers: number; ms: number; byDoctype: Record<string, number> }
let lastStats: VolumeStats = { inserted: 0, vouchers: 0, ms: 0, byDoctype: {} };
export const volumeStats = () => lastStats;

/** Build the layer (idempotent per visit). */
export function seedVolume(): VolumeStats {
  if (typeof window === "undefined" || import.meta.env.MODE === "test" || built || !volumeEnabled()) return lastStats;
  built = true;
  const t0 = performance.now();
  const stats: VolumeStats = { inserted: 0, vouchers: 0, ms: 0, byDoctype: {} };
  try {
    adapter.ephemeral(() => {
      const gone = deletedIndex();
      const vouchers = new Set<string>();
      const put = (dt: string, name: string, data: Record<string, unknown>) => {
        if (dt === "Contact") return false; // owner decision: CRM contacts start empty
        if (adapter.get(dt, name) || wasRenamed(dt, name) || gone.has(deletedKey(dt, name))) return false;
        adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1, __sample: "volume" });
        stats.inserted++; stats.byDoctype[dt] = (stats.byDoctype[dt] ?? 0) + 1;
        return true;
      };
      const all = (recs: Rec[]) => { for (const [dt, name, data] of recs) put(dt, name, data); };
      const hr = hrVolume(); all(hr.records);
      const erp = erpVolume(hr.payroll); all(erp.records); erp.vouchers.forEach((v) => vouchers.add(v));
      // owner decision: DIGIT CRM starts empty, so no CRM sample volume is built
      const ctx: VolumeContext = { put, voucher: (dt, name) => vouchers.add(`${dt}|${name}`) };
      for (const p of providers) { try { if (p.enabled()) p.run(ctx); } catch (e) { console.warn(`[sample volume] ${p.app}`, e); } }
      // post every registered voucher that exists and is submitted (a user-edited copy is posted as it is now)
      const list: [string, Doc][] = [];
      for (const v of vouchers) { const i = v.indexOf("|"); const dt = v.slice(0, i); const d = adapter.get(dt, v.slice(i + 1)); if (d && Number(d.docstatus) === 1) list.push([dt, d]); }
      postVouchers(list); stats.vouchers = list.length;
    });
  } catch (e) { console.warn("[sample volume] build failed; standard demo data is unchanged", e); }
  stats.ms = Math.round(performance.now() - t0);
  lastStats = stats;
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>)["__digitVolume"] = stats;
  return stats;
}

/**
 * Run one app's provider now (e.g. after the app's demo data was loaded again from its settings): same rules as the
 * visit build — memory only, insert-if-missing, never a renamed / deleted record, submitted vouchers posted by posting.ts.
 */
export function runVolumeProvider(app: string): VolumeStats {
  const stats: VolumeStats = { inserted: 0, vouchers: 0, ms: 0, byDoctype: {} };
  const p = providers.find((x) => x.app === app);
  if (typeof window === "undefined" || !p || !volumeEnabled() || !p.enabled()) return stats;
  const t0 = performance.now();
  try {
    adapter.ephemeral(() => {
      const gone = deletedIndex();
      const vouchers = new Set<string>();
      const put = (dt: string, name: string, data: Record<string, unknown>) => {
        if (dt === "Contact") return false; // owner decision: CRM contacts start empty
        if (adapter.get(dt, name) || wasRenamed(dt, name) || gone.has(deletedKey(dt, name))) return false;
        adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1, __sample: "volume" });
        stats.inserted++; stats.byDoctype[dt] = (stats.byDoctype[dt] ?? 0) + 1;
        return true;
      };
      p.run({ put, voucher: (dt, name) => vouchers.add(`${dt}|${name}`) });
      const list: [string, Doc][] = [];
      for (const v of vouchers) { const i = v.indexOf("|"); const dt = v.slice(0, i); const d = adapter.get(dt, v.slice(i + 1)); if (d && Number(d.docstatus) === 1) list.push([dt, d]); }
      postVouchers(list); stats.vouchers = list.length;
    });
  } catch (e) { console.warn(`[sample volume] ${app}`, e); }
  stats.ms = Math.round(performance.now() - t0);
  return stats;
}
