/** Saved criteria bar for query / script reports (src/lib/coreShared/reportCriteria.ts): apply, save, open-with default and delete — the user's own sets only. */
import { useState } from "react";
import { toast } from "sonner";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { useLang } from "@/i18n";
import * as RC from "@/lib/coreShared/reportCriteria";

export function SavedCriteria({ report, filters, onApply }: { report: string; filters: RC.Criteria; onApply: (f: RC.Criteria) => void }) {
  useStoreVersion(); const user = useSessionUser(); const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const [saving, setSaving] = useState(false); const [title, setTitle] = useState(""); const [def, setDef] = useState(false);
  const mine = RC.criteriaFor(report, user); const cur = RC.matchingCriteria(report, filters, user);
  const save = () => { const r = RC.saveCriteria(report, title, filters, { isDefault: def }, user); if (r.ok) { toast.success(t("Criteria saved.", "حُفظت المعايير.")); setSaving(false); setTitle(""); setDef(false); } else toast.error(ar ? r.reason[1] : r.reason[0]); };
  return <div className="mt-3 flex flex-wrap items-end gap-2" data-saved-criteria={mine.length}>
    <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground"><span>{t("Saved criteria", "المعايير المحفوظة")}</span>
      <select className="field-input w-56" value={cur?.name ?? ""} data-criteria-pick onChange={(e) => { const d = mine.find((x) => x.name === e.target.value); if (d) onApply(RC.criteriaValues(d)); }}>
        <option value="">{mine.length ? t("Choose saved criteria", "اختر معايير محفوظة") : t("None saved yet", "لا توجد معايير محفوظة")}</option>
        {mine.map((d) => <option key={d.name} value={d.name} data-no-i18n>{String(d["title"])}{Number(d["is_default"] ?? 0) ? " ★" : ""}</option>)}
      </select></label>
    {cur && <><button type="button" className="btn-ghost" data-criteria-default={cur.name} onClick={() => { RC.setDefaultCriteria(cur.name, !Number(cur["is_default"] ?? 0), user); }}>{Number(cur["is_default"] ?? 0) ? t("Stop opening with these", "إلغاء الفتح بهذه المعايير") : t("Open with these", "الفتح بهذه المعايير")}</button>
      <button type="button" className="btn-ghost" data-criteria-delete={cur.name} onClick={() => { RC.deleteCriteria(cur.name, user); toast.success(t("Criteria deleted.", "حُذفت المعايير.")); }}>{t("Delete", "حذف")}</button></>}
    {saving ? <><input className="field-input w-48" placeholder={t("Title", "العنوان")} value={title} onChange={(e) => setTitle(e.target.value)} data-criteria-title />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={def} onChange={(e) => setDef(e.target.checked)} data-criteria-isdefault />{t("Open with these", "الفتح بهذه المعايير")}</label>
      <button type="button" className="btn-primary" data-criteria-save onClick={save}>{t("Save", "حفظ")}</button><button type="button" className="btn-ghost" onClick={() => setSaving(false)}>{t("Cancel", "إلغاء")}</button></>
      : <button type="button" className="btn-ghost" data-criteria-new onClick={() => setSaving(true)}>{t("Save criteria", "حفظ المعايير")}</button>}
  </div>;
}
