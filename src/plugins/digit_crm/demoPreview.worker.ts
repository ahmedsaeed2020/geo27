/**
 * DIGIT CRM sample-dataset preview worker. Runs the source demo generator (demoGenerator.ts) in this worker's own module
 * instance of the adapter — separate memory from the app; browser storage is not reachable here — then answers paged,
 * read-only queries. Terminating the worker discards the whole corpus. Messages:
 *   → { type: "generate", asOf }            ← { type: "ready", counts, total, ms, version, asOf } | { type: "error", message }
 *   → { type: "query", id, query }          ← { type: "page", id, page }
 *   → { type: "record", id, preview, name } ← { type: "record", id, record }
 */
import { adapter } from "@/lib/adapter";
import { enterPreviewWorker, CRM_DEMO_PROFILE } from "./dataContext";
import { DEMO_VERSION, seedEnterpriseDemo } from "./demoGenerator";
import { buildPreviewIndex, previewRecord, queryPreview, type PreviewIndex, type PreviewQuery, type PreviewTypeId } from "./demoPreviewIndex";

type In = { type: "generate"; asOf: string } | { type: "query"; id: number; query: PreviewQuery } | { type: "record"; id: number; preview: PreviewTypeId; name: string };
const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<In>) => void) | null };
let index: PreviewIndex | null = null;

ctx.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === "generate") {
      if (!index) {
        const t0 = performance.now();
        enterPreviewWorker();
        adapter.batch(() => seedEnterpriseDemo(m.asOf));
        const fixtureRows = (dt: string) => adapter.list(dt).filter((d) => d["__fixture_id"] === CRM_DEMO_PROFILE);
        index = buildPreviewIndex(adapter.doctypes(), fixtureRows);
        ctx.postMessage({ type: "ready", counts: index.counts, total: index.total, ms: Math.round(performance.now() - t0), version: DEMO_VERSION, asOf: m.asOf });
      } else ctx.postMessage({ type: "ready", counts: index.counts, total: index.total, ms: 0, version: DEMO_VERSION, asOf: m.asOf });
    } else if (m.type === "query") {
      if (index) ctx.postMessage({ type: "page", id: m.id, page: queryPreview(index, m.query) });
    } else if (m.type === "record") {
      if (index) ctx.postMessage({ type: "record", id: m.id, record: previewRecord(index, m.preview, m.name) ?? null });
    }
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
