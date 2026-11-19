/**
 * One booted Virtual Core for the test-list suites: browser storage stubs, Core seed, the Construction plugin enabled
 * and its demo installed — the same sequence parity.test.ts uses — plus meta() for app and native DocTypes
 * (native = frozen catalog JSON through the plugin overlay, exactly what forms render).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { REPO } from "./rows";
import type { DocTypeMeta } from "@/lib/catalog";

const mem: Record<string, string> = {};
export function stubBrowser() {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g["__conStub"]) return;
  g["window"] = globalThis;
  g["localStorage"] = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, clear: () => {}, key: () => null, length: 0 } as Storage;
  g["sessionStorage"] = g["localStorage"];
  g["__conStub"] = true;
}

let booted: Awaited<ReturnType<typeof doBoot>> | null = null;
async function doBoot() {
  stubBrowser();
  const { adapter } = await import("@/lib/adapter");
  await import("@/plugins/builtinBoot");
  const R = await import("@/plugins/runtime");
  const { seedErp } = await import("@/lib/seed");
  seedErp();
  if (!R.isEnabled("digit_construction")) R.setEnabled("digit_construction", true);
  const seed = await import("../seed");
  seed.installConstructionDemo();
  const catalog = await import("@/lib/catalog");
  const S = await import("@/lib/session");
  const index = JSON.parse(readFileSync(path.join(REPO, "public/catalog/index.json"), "utf8")) as { name: string; app: string; slug: string }[];
  const native = new Map<string, DocTypeMeta | null>();
  /** Effective meta: plugin DocTypes from the manifest, native ones from the frozen catalog + overlay (primed for session checks). */
  const meta = (dt: string): DocTypeMeta | undefined => {
    const own = catalog.cachedMeta(dt); if (own && String(own.source ?? "").startsWith("plugin:")) return own;
    if (!native.has(dt)) {
      const e = index.find((i) => i.name === dt);
      const file = e ? path.join(REPO, "public/catalog", e.app, `${e.slug}.json`) : "";
      if (e && existsSync(file)) { const raw = JSON.parse(readFileSync(file, "utf8")) as DocTypeMeta; catalog.primeMeta({ ...raw, name: dt }); native.set(dt, catalog.cachedMeta(dt) ?? null); }
      else native.set(dt, null);
    }
    return native.get(dt) ?? undefined;
  };
  return { adapter, R, seed, catalog, S, meta };
}
export async function boot() { booted ??= await doBoot(); return booted; }
