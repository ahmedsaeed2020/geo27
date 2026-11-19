/** D7-b / PU11-b / SEL-003-b — "Submit & create next" and "Create with selected lines" over the source Create ▸ mappings. */
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta, indexQuery, loadMeta, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { createDraft, submitDocument } from "@/lib/documentApi";
import { formActionsQuery, mapDoc, type FormAction } from "@/lib/engines";
import { useSessionUser } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { can } from "./finance";
import { useLang, t as tr } from "@/i18n";
import { completeMapping, fromDraft, keepRows, nextActions, NEXT_STEPS, pickableRows, pickKey, type PickRow } from "./nextDoc";

export function NextDocPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  useStoreVersion();
  const ar = useLang() === "ar"; const user = useSessionUser();
  const t = (en: string, a: string) => (ar ? a : en);
  const { data: all } = useQuery(formActionsQuery);
  const { data: index } = useQuery(indexQuery);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  useScopeMetas([doctype, ...(NEXT_STEPS[doctype] ?? [])]); // create/submit permission checks read the target metas
  const [pick, setPick] = useState<{ target: string; rows: PickRow[]; keep: Set<string>; mapped: Record<string, unknown>; tm: DocTypeMeta } | null>(null);
  const acts = nextActions(doctype, all?.[doctype]).filter((a) => can(a.target!, "create", undefined, user));
  const ds = Number(doc.docstatus ?? 0);
  const saved = !!adapter.get(doctype, doc.name) && !doc["__islocal"];
  if (!acts.length || ds === 2 || !index) return null;

  const mapFor = async (a: FormAction, src: Doc) => {
    const entry = index.find((e) => e.name === a.target); const sm = cachedMeta(doctype);
    const tm = entry && (await loadMeta(index, entry.name)); if (!tm || !sm) return null;
    const childMetas: Record<string, DocTypeMeta> = {};
    for (const f of tm.fields.filter((x) => TABLE_TYPES.has(x.fieldtype) && x.options)) { const m = await loadMeta(index, f.options!); if (m) childMetas[f.options!] = m; }
    return { entry, tm, mapped: completeMapping(doctype, tm.name, src, mapDoc(sm, src, tm, childMetas, a.field_map), (dt, n) => adapter.get(dt, n)) };
  };
  const open = (tm: DocTypeMeta, mapped: Record<string, unknown>) => {
    const entry = index.find((e) => e.name === tm.name)!;
    const r = createDraft(tm, { mapped });
    if (!r.doc) { toast.error(r.errors.map((x) => tr(x)).join("\n")); return; }
    void nav({ to: "/app/$app/$doctype/$name", params: { app: entry.app, doctype: entry.slug, name: r.doc.name } });
  };
  const submitAndNext = async (a: FormAction) => {
    if (busy) return; setBusy(true);
    try {
      const sm = cachedMeta(doctype); if (!sm) return;
      const errs = submitDocument(sm, doc.name, user);
      if (errs.length) { toast.error(errs.map((x) => tr(x)).join("\n")); return; }
      toast.success(t(`${doc.name} submitted`, `تم اعتماد ${doc.name}`));
      const m = await mapFor(a, adapter.get(doctype, doc.name)!); if (m) open(m.tm, m.mapped);
    } finally { setBusy(false); }
  };
  const startPick = async (a: FormAction) => {
    if (busy) return; setBusy(true);
    try {
      const m = await mapFor(a, { ...(adapter.get(doctype, doc.name) ?? {}), ...doc } as Doc); if (!m) return;
      const rows = pickableRows(m.mapped);
      // no item lines to pick (e.g. a Delivery Trip's one stop per note): open the mapped draft directly
      if (!rows.length && Object.values(m.mapped).some((v) => Array.isArray(v) && v.length)) { open(m.tm, m.mapped); return; }
      if (!rows.length) { toast.info(t(`Nothing left to copy into a ${a.target}.`, `لا يوجد ما يُنسخ إلى ${tr(a.target!)}.`)); return; }
      setPick({ target: a.target!, rows, keep: new Set(rows.map(pickKey)), mapped: m.mapped, tm: m.tm });
    } finally { setBusy(false); }
  };

  return <section className="dp-card" data-dp-next-doc={doctype} aria-label={t("Next step", "الخطوة التالية")}>
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold">{t("Next step", "الخطوة التالية")}</h3>
      {ds === 0 && <span className="text-xs text-muted-foreground">{saved ? t("Submit this document and open the next one in one step.", "اعتمد هذا المستند وافتح التالي بخطوة واحدة.") : t("Save first, then submit and create the next document.", "احفظ أولًا ثم اعتمد وأنشئ المستند التالي.")}</span>}
      {ds === 1 && <span className="text-xs text-muted-foreground">{t("Pick the lines to copy into the next document.", "اختر البنود التي تُنسخ إلى المستند التالي.")}</span>}
    </div>
    <div className="mt-2 flex flex-wrap gap-2">{acts.filter((a) => ds === 0 || !fromDraft(doctype, a.target!)).map((a) => ds === 0 && !fromDraft(doctype, a.target!)
      ? <button key={a.label} className="btn-ghost" disabled={busy || !saved || !can(doctype, "submit", undefined, user)} onClick={() => void submitAndNext(a)} data-dp-submit-next={a.target}>{t("Submit & create", "اعتماد وإنشاء")} {tr(a.target!)}</button>
      : <button key={a.label} className="btn-ghost" disabled={busy || (ds === 0 && !saved)} onClick={() => void startPick(a)} data-dp-pick-next={a.target}>{t("Create", "إنشاء")} {tr(a.target!)} {t("with selected lines", "بالبنود المختارة")}</button>)}</div>
    {pick && <div className="mt-3 rounded-md border border-border p-2" data-dp-line-pick={pick.target}>
      <table className="dp-cc-table text-xs"><thead><tr><th scope="col"><span className="sr-only">{t("Copy", "نسخ")}</span></th><th scope="col">{t("Line", "البند")}</th><th scope="col">{t("Item", "الصنف")}</th><th scope="col">{t("Remaining qty", "الكمية المتبقية")}</th></tr></thead>
        <tbody>{pick.rows.map((r) => { const k = pickKey(r); return <tr key={k} data-dp-pick-row={k}>
          <td><input type="checkbox" aria-label={`${t("Copy line", "نسخ البند")} ${r.idx}`} checked={pick.keep.has(k)} onChange={(e) => { const keep = new Set(pick.keep); if (e.target.checked) keep.add(k); else keep.delete(k); setPick({ ...pick, keep }); }} /></td>
          <td className="tabular-nums" data-no-i18n>#{r.idx}</td><td data-no-i18n>{r.item}</td><td className="tabular-nums" data-no-i18n>{r.qty}</td></tr>; })}</tbody></table>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!pick.keep.size} onClick={() => { open(pick.tm, keepRows(pick.mapped, pick.keep)); setPick(null); }} data-dp-pick-create>{t("Create", "إنشاء")} {tr(pick.target)} ({pick.keep.size})</button>
        <button className="btn-ghost" onClick={() => setPick(null)}>{t("Cancel", "إلغاء")}</button>
      </div>
    </div>}
  </section>;
}
