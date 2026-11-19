/**
 * F3-01 inspection walk (N39–N41): the run's devices placed on the site's location tree (building → floor → zone) with a
 * progress ring per node, then one card per device with big Pass / Fail / N/A / «تعذر الوصول» buttons per check (the
 * last asks for a reason), the measurement with its template min / max, and a photo taken from the camera. Untested
 * devices are outlined; the run coverage ring is the same formula as K07 (inspected ÷ expected devices, frozen snapshot).
 * Every change goes through domain/services (recordResult / bulkOutcome / attachResultPhoto), so the results table,
 * the audit events and the review read the same rows.
 */
import { useMemo, useRef, useState } from "react";
import type { Doc } from "@/lib/adapter";
import { BigRing, LocationTree, OutcomePad, Pill, type OutcomeOpt, type TreeNode } from "@/components/enterprise/kit";
import { raw, rows } from "../domain/data";
import { runCoverage, s, type Row } from "../domain/rules";
import * as svc from "../domain/services";
import { nm } from "./dayBoard";
import { fsmNameAr } from "../demo/names";
/** A sample value in the reader's language (display only; stored values stay as they are). */
export const tv = (v: unknown, ar: boolean) => { const x = s(v); return ar ? fsmNameAr(x) ?? x : x; };
import { INPUT, notify, numTxt, unitTxt, useFx } from "./kit";

type DevState = "done" | "fail" | "inacc" | "untested" | "na";
const SYS = "__sys";
export const outcomeOptions = (ar: boolean): OutcomeOpt[] => [
  { key: "Pass", label: ar ? "ناجح" : "Pass", tone: "ok" }, { key: "Fail", label: ar ? "راسب" : "Fail", tone: "bad" },
  { key: "Not Applicable", label: ar ? "لا ينطبق" : "N/A", tone: "neutral" }, { key: "Inaccessible", label: ar ? "تعذر الوصول" : "Inaccessible", tone: "warn", needsReason: true },
];
/** One device's state from its result rows (the runCoverage rule: inspected = every applicable check Pass / Fail). */
export function deviceState(rs: Row[]): DevState {
  const o = rs.map((r) => s(r["outcome"]) || "Untested"); const app = o.filter((x) => x !== "Not Applicable");
  if (o.includes("Fail")) return "fail";
  if (!app.length) return "na";
  if (app.every((x) => x === "Pass" || x === "Fail")) return "done";
  if (o.includes("Untested")) return "untested";
  return "inacc";
}
/** The location chain of a node, top first (building → floor → zone). */
function chainOf(loc: string): Doc[] { const out: Doc[] = []; let n = raw("FSM Location Node", loc); let guard = 0; while (n && guard++ < 8) { out.unshift(n); n = raw("FSM Location Node", n["parent_node"]); } return out; }

export interface WalkModel { tree: TreeNode[]; all: TreeNode; devices: { id: string; rows: Row[]; state: DevState; path: string[] }[] }
/** Tree + device list of a run (pure; the test reads it). */
export function walkModel(run: Doc, ar: boolean): WalkModel {
  const results = rows(run, "results");
  const byDev = new Map<string, Row[]>(); for (const r of results) { const k = s(r["device"]) || SYS; const l = byDev.get(k) ?? []; l.push(r); byDev.set(k, l); }
  const devices = [...byDev].map(([id, rs]) => { const d = id === SYS ? undefined : raw("FSM Device", id); const chain = d ? chainOf(s(d["location"])) : []; return { id, rows: rs, state: deviceState(rs), path: chain.map((n) => n.name) }; });
  const nodes = new Map<string, TreeNode & { children: TreeNode[] }>(); const roots: (TreeNode & { children: TreeNode[] })[] = [];
  const nodeOf = (n: Doc, parent?: TreeNode & { children: TreeNode[] }) => {
    let x = nodes.get(n.name);
    if (!x) { x = { key: n.name, label: <span data-no-i18n>{nm("FSM Location Node", n.name, ar)}</span>, kind: ar ? ({ Building: "مبنى", Floor: "طابق", Zone: "منطقة", Room: "غرفة" } as Record<string, string>)[s(n["node_type"])] ?? s(n["node_type"]) : s(n["node_type"]), done: 0, total: 0, fail: 0, untested: 0, children: [] }; nodes.set(n.name, x); (parent ? parent.children : roots).push(x); }
    return x;
  };
  const add = (x: TreeNode, st: DevState) => { if (st === "na") return; x.total++; if (st === "done" || st === "fail") x.done++; if (st === "fail") x.fail = (x.fail ?? 0) + 1; if (st === "untested") x.untested = (x.untested ?? 0) + 1; };
  let sys: (TreeNode & { children: TreeNode[] }) | undefined;
  for (const d of devices) {
    if (d.id === SYS || !d.path.length) { sys ??= { key: SYS, label: ar ? (d.id === SYS ? "بنود مستوى النظام" : "بدون مكان") : d.id === SYS ? "System-level checks" : "No location", done: 0, total: 0, fail: 0, untested: 0, children: [] }; add(sys, d.state); continue; }
    let parent: (TreeNode & { children: TreeNode[] }) | undefined;
    for (const id of d.path) { const n = raw("FSM Location Node", id); if (!n) break; parent = nodeOf(n, parent); add(parent, d.state); }
  }
  if (sys) roots.push(sys);
  const cov = runCoverage(results, Number(run["expected_devices"]) || undefined);
  const all: TreeNode = { key: "", label: ar ? "كل الأماكن" : "All locations", done: cov.inspected, total: cov.expected, fail: cov.failedDevices, untested: devices.filter((d) => d.state === "untested").length };
  return { tree: roots, all, devices };
}

/** Downscale a picked image to a small JPEG data URL (≤ 640 px) so the evidence travels with the virtual record. */
export async function shrink(file: File): Promise<{ name: string; url: string; size: number }> {
  const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const k = Math.min(1, 640 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.72); return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", url, size: Math.round((url.length * 3) / 4) };
}

function Measure({ run, row, chk, locked }: { run: string; row: Row; chk: Row | undefined; locked: boolean }) {
  const { t, ar } = useFx(); const cur = row["measurement"] == null ? "" : String(row["measurement"]); const [v, setV] = useState(cur);
  if (!chk || (chk["min_value"] === undefined && chk["max_value"] === undefined && !chk["unit"])) return null;
  const out = cur !== "" && ((chk["min_value"] !== undefined && Number(cur) < Number(chk["min_value"])) || (chk["max_value"] !== undefined && Number(cur) > Number(chk["max_value"])));
  const commit = () => { if (v === cur) return; notify(svc.recordResult(run, s(row["name"]), { measurement: v === "" ? "" : Number(v) }), ar); };
  return <label className="fsm-walk-m" data-out={out || undefined}>
    <span className="text-xs text-muted-foreground">{t("Measurement", "القياس")}</span>
    <input type="number" inputMode="decimal" step="any" className={`${INPUT} min-h-10 w-28`} value={v} disabled={locked} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} data-walk-measure={s(row["name"])} />
    <span className="text-xs" data-no-i18n>{unitTxt(s(chk["unit"]), ar)}</span>
    <span className="fsm-walk-range" data-no-i18n>{[chk["min_value"] !== undefined ? `${ar ? "أدنى" : "min"} ${s(chk["min_value"])}` : "", chk["max_value"] !== undefined ? `${ar ? "أقصى" : "max"} ${s(chk["max_value"])}` : ""].filter(Boolean).join(" · ")}</span>
  </label>;
}

function Photo({ run, row, locked }: { run: string; row: Row; locked: boolean }) {
  const { t, ar } = useFx(); const ref = useRef<HTMLInputElement>(null);
  const photos = svc.resultPhotos(run, s(row["name"]));
  const need = !!row["evidence_required"] && !photos.length && ["Pass", "Fail"].includes(s(row["outcome"]));
  return <span className="fsm-walk-photo" data-need={need || undefined}>
    {photos.slice(0, 3).map((p) => <img key={p.name} src={s(p["file_url"])} alt={s(p["file_name"])} className="fsm-walk-thumb" />)}
    {!locked && <><input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" aria-label={t("Take a photo", "التقاط صورة")} data-walk-photo-input={s(row["name"])}
      onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { const x = await shrink(f); notify(svc.attachResultPhoto(run, s(row["name"]), x), ar); } catch { notify({ ok: false, message: "The photo could not be read", message_ar: "تعذر قراءة الصورة" }, ar); } }} />
      <button type="button" className="fsm-walk-cam" onClick={() => ref.current?.click()} data-walk-photo={s(row["name"])}>📷 {photos.length ? numTxt(photos.length) : t("Photo", "صورة")}</button></>}
    {locked && photos.length > 0 && <span className="text-xs text-muted-foreground" data-no-i18n>📷 {photos.length}</span>}
    {need && <span className="fsm-walk-needtxt">{t("Photo required", "الصورة مطلوبة")}</span>}
  </span>;
}

const STATE_PILL: Record<DevState, { en: string; ar: string; tone: "ok" | "bad" | "warn" | "neutral" | "info" }> = {
  done: { en: "Inspected", ar: "تم فحصه", tone: "ok" }, fail: { en: "Failed", ar: "راسب", tone: "bad" }, inacc: { en: "Inaccessible", ar: "تعذر الوصول", tone: "warn" }, untested: { en: "Untested", ar: "لم يُفحص", tone: "warn" }, na: { en: "Not applicable", ar: "لا ينطبق", tone: "neutral" },
};
const FILTERS: { key: "all" | DevState; en: string; ar: string }[] = [{ key: "all", en: "All", ar: "الكل" }, { key: "untested", en: "Untested", ar: "لم يُفحص" }, { key: "fail", en: "Failed", ar: "راسب" }, { key: "inacc", en: "Inaccessible", ar: "تعذر الوصول" }, { key: "done", en: "Inspected", ar: "تم فحصه" }];

export function RunWalk({ run, locked }: { run: Doc; locked: boolean }) {
  const fx = useFx(); const { t, ar } = fx; const id = run.name;
  const [node, setNode] = useState(""); const [f, setF] = useState<"all" | DevState>("all"); const [devWhy, setDevWhy] = useState<{ dev: string; text: string } | null>(null);
  const m = walkModel(run, ar);
  const tpl = raw("FSM Inspection Template", run["template"]);
  const checks = useMemo(() => new Map(rows(tpl, "checks").map((c) => [s(c["check_code"]), c])), [tpl]);
  const cov = runCoverage(rows(run, "results"), Number(run["expected_devices"]) || undefined);
  const inNode = m.devices.filter((d) => !node || (node === SYS ? d.id === SYS || !d.path.length : d.path.includes(node)));
  const counts = Object.fromEntries(FILTERS.map((x) => [x.key, x.key === "all" ? inNode.length : inNode.filter((d) => d.state === x.key).length]));
  const shown = inNode.filter((d) => f === "all" || d.state === f).sort((a, b) => (a.state === "untested" ? 0 : 1) - (b.state === "untested" ? 0 : 1));
  const opts = outcomeOptions(ar);
  return (
    <section className="fsm-walk" data-run-walk={id}>
      <div className="fsm-walk-side">
        <div className="fsm-walk-cov"><BigRing value={cov.coverage} label={t("Run coverage", "تغطية التشغيل")} sub={t(`${cov.inspected} of ${cov.expected} devices inspected`, `فُحص ${cov.inspected} من ${cov.expected} جهاز`)} code="K07" size={104} /></div>
        <LocationTree nodes={m.tree} all={m.all} selected={node} onPick={setNode} ar={ar} title={t("Building → floor → zone", "المبنى ← الطابق ← المنطقة")} />
      </div>
      <div className="fsm-walk-main min-w-0">
        <div className="fsm-walk-bar" role="tablist" aria-label={t("Device filter", "تصفية الأجهزة")}>
          {FILTERS.map((x) => <button key={x.key} type="button" role="tab" aria-selected={f === x.key} data-on={f === x.key || undefined} onClick={() => setF(x.key)} data-walk-filter={x.key}>{ar ? x.ar : x.en} <b data-no-i18n>{counts[x.key]}</b></button>)}
        </div>
        {!shown.length && <p className="fsm-walk-empty">{f === "untested" ? t("No untested device here — every device has a result.", "لا جهاز بلا نتيجة هنا — كل الأجهزة لها نتائج.") : t("No device matches this filter here.", "لا جهاز يطابق هذا التصفية هنا.")}</p>}
        <ul className="fsm-walk-list">
          {shown.map((d) => { const dev = d.id === SYS ? undefined : raw("FSM Device", d.id); const pill = STATE_PILL[d.state];
            const untestedN = d.rows.filter((r) => !s(r["outcome"]) || s(r["outcome"]) === "Untested").length;
            return <li key={d.id} className="fsm-walk-dev" data-state={d.state} data-walk-device={d.id}>
              <header className="fsm-walk-dh">
                <div className="min-w-0 flex-1">
                  <p className="fsm-walk-dn" data-no-i18n>{dev ? nm("FSM Device", d.id, ar) : t("System-level checks", "بنود مستوى النظام")}</p>
                  <p className="fsm-walk-ds" data-no-i18n>{[dev ? tv(dev["device_type"], ar) : "", dev ? s(dev["serial_no"]) : "", d.path.map((p) => nm("FSM Location Node", p, ar)).join(" › ")].filter(Boolean).join(" · ")}</p>
                </div>
                <Pill tone={pill.tone}>{ar ? pill.ar : pill.en}</Pill>
              </header>
              {!locked && untestedN > 0 && <div className="fsm-walk-quick">
                <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => notify(svc.bulkOutcome(id, "Pass", d.id === SYS ? undefined : d.id), ar)} data-walk-allpass={d.id}>{t(`All ${untestedN} remaining checks pass`, `كل البنود المتبقية (${untestedN}) ناجحة`)}</button>
                {devWhy?.dev === d.id ? <span className="fsm-walk-why"><input className={`${INPUT} min-h-9`} autoFocus value={devWhy.text} onChange={(e) => setDevWhy({ dev: d.id, text: e.target.value })} placeholder={t("Why could the device not be reached?", "لماذا تعذر الوصول إلى الجهاز؟")} data-walk-dev-why />
                  <button type="button" className="btn-primary min-h-9 px-3 text-sm" disabled={!devWhy.text.trim()} onClick={() => { notify(svc.bulkOutcome(id, "Inaccessible", d.id === SYS ? undefined : d.id, devWhy.text.trim()), ar); setDevWhy(null); }}>{t("Record", "تسجيل")}</button></span>
                  : <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => setDevWhy({ dev: d.id, text: "" })} data-walk-dev-inacc={d.id}>{t("Device inaccessible…", "تعذر الوصول للجهاز…")}</button>}
              </div>}
              <ol className="fsm-walk-checks">
                {d.rows.map((r) => { const chk = checks.get(s(r["check_code"])); const o = s(r["outcome"]) || "Untested";
                  return <li key={s(r["name"])} data-check={s(r["check_code"])} data-untested={o === "Untested" || undefined}>
                    <p className="fsm-walk-ct"><span className="fsm-walk-cc" data-no-i18n>{s(r["check_code"])}</span> <span data-no-i18n>{tv(r["check_text"], ar)}</span>{r["evidence_required"] ? <span className="fsm-walk-ev" title={t("Photo required", "الصورة مطلوبة")}>📷</span> : null}</p>
                    <div className="fsm-walk-cr">
                      <OutcomePad id={s(r["name"])} value={o === "Untested" ? "" : o} options={opts} disabled={locked} ar={ar} note={s(r["note"])} onPick={(k, why) => notify(svc.recordResult(id, s(r["name"]), why ? { outcome: k, note: why } : { outcome: k }), ar)} />
                      <Measure run={id} row={r} chk={chk} locked={locked} />
                      <Photo run={id} row={r} locked={locked} />
                    </div>
                  </li>; })}
              </ol>
            </li>; })}
        </ul>
      </div>
    </section>
  );
}
