/**
 * EXT-03 writes: issue a controlled copy of a construction document (Digit Print Artifact) and void it. Issuing never
 * changes the source; an identical copy (same source revision, template version and content) is returned instead of
 * duplicated, so a retried click never creates a second artifact. Writes go through the shared document API, so the
 * DocType permissions and the checkArtifact hook apply.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { createDraft, saveDocument, updateDocument } from "@/lib/documentApi";
import { currentUser, hasPerm } from "@/lib/session";
import { finality, formatByName, renderPrint, sha256, templateVersion } from "./print";

export interface PrintResult { ok: boolean; name?: string | undefined; reused?: boolean; errors: string[] }
const ART = "Digit Print Artifact";
const now = () => new Date().toISOString();
export const artifactsOf = (doctype: string, name: string): Doc[] => adapter.list(ART).filter((a) => a["source_doctype"] === doctype && a["source_name"] === name && !a["__islocal"]).sort((a, b) => String(b["generated_at"] ?? "").localeCompare(String(a["generated_at"] ?? "")));

export async function issuePrint(req: { doctype: string; name: string; format: string; as_of: string; copy_reason?: string }, user = currentUser()): Promise<PrintResult> {
  const src = adapter.get(req.doctype, req.name);
  const sm = cachedMeta(req.doctype);
  if (!src || !sm) return { ok: false, errors: [`${req.doctype} ${req.name} not found`] };
  if (!hasPerm(sm, "read", src, user)) return { ok: false, errors: ["You cannot read the source document"] };
  const pf = formatByName(req.format);
  if (!pf || pf.doc_type !== req.doctype) return { ok: false, errors: [`Template ${req.format} does not match ${req.doctype}`] };
  const b = finality(req.doctype, src).blocked; if (b) return { ok: false, errors: [b[0]] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.as_of)) return { ok: false, errors: ["As of must be a date (YYYY-MM-DD)"] };
  const r = renderPrint(pf, src, req.as_of);
  const hash = await sha256(r.html);
  const same = artifactsOf(req.doctype, req.name).find((a) => a["status"] === "Issued" && a["print_format"] === pf.name && a["template_version"] === r.template_version && a["content_hash"] === hash);
  if (same) return { ok: true, name: same.name, reused: true, errors: [] };
  const meta = cachedMeta(ART); if (!meta) return { ok: false, errors: [`${ART}: metadata unavailable`] };
  const d = createDraft(meta); if (!d.doc) return { ok: false, errors: d.errors };
  const values = { source_doctype: req.doctype, source_name: req.name, print_format: pf.name, template_version: templateVersion(pf), language: "Bilingual", finality: r.finality, status: "Issued",
    source_state: r.source_state, source_docstatus: Number(src["docstatus"] ?? 0), source_modified: r.source_modified, as_of: req.as_of, generated_at: now(), content_hash: hash, copy_reason: req.copy_reason ?? "", html_snapshot: r.html };
  const saved = saveDocument(meta, d.doc.name, values, { user });
  if (saved.errors.length) { if (adapter.get(ART, d.doc.name)?.["__islocal"]) adapter.remove(ART, d.doc.name); return { ok: false, errors: saved.errors }; }
  return { ok: true, name: saved.name, errors: [] };
}

export function voidPrint(name: string, reason: string, user = currentUser()): PrintResult {
  const meta = cachedMeta(ART); if (!meta) return { ok: false, errors: [`${ART}: metadata unavailable`] };
  const a = adapter.get(ART, name); if (!a) return { ok: false, errors: [`${ART} ${name} not found`] };
  if (a["status"] === "Void") return { ok: false, name, errors: ["This copy is already void"] };
  const errs = updateDocument(meta, name, { status: "Void", void_reason: reason.trim() }, user);
  return errs.length ? { ok: false, name, errors: errs } : { ok: true, name, errors: [] };
}

export interface Verification { hashOk: boolean; template: "same" | "changed" | "missing"; source: "same" | "changed" | "missing" }
/** Re-check an issued copy: snapshot still matches its SHA-256, template version unchanged, source unchanged since issue. */
export async function verifyArtifact(a: Doc): Promise<Verification> {
  const hashOk = (await sha256(String(a["html_snapshot"] ?? ""))) === a["content_hash"];
  const pf = formatByName(String(a["print_format"] ?? ""));
  const src = adapter.get(String(a["source_doctype"] ?? ""), String(a["source_name"] ?? ""));
  return { hashOk, template: !pf ? "missing" : templateVersion(pf) === a["template_version"] ? "same" : "changed", source: !src ? "missing" : String(src["modified"] ?? "") === a["source_modified"] ? "same" : "changed" };
}
