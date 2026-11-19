/**
 * SH-025 / ENT-10 Smart Guide — the one permitted next step for the document on screen, shared by every app's forms.
 * It never runs its own logic: required fields come from the Save check (formRules.missingMandatory), Save / Submit /
 * Amend press the document header's own buttons (the single owner of those actions), and "continue" choices are the
 * header's permitted source actions (FormActions.visibleFormActions) run by the same runner, only where the user may
 * create the target document.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Compass } from "lucide-react";
import type { ReactNode } from "react";
import { cachedMeta, indexQuery, type DocTypeMeta } from "@/lib/catalog";
import type { Doc } from "@/lib/adapter";
import { formActionsQuery, type FormAction } from "@/lib/engines";
import { missingMandatory } from "@/lib/formRules";
import { hasPerm, useSessionUser } from "@/lib/session";
import { useLang } from "@/i18n";
import { useFormActionRunner, visibleFormActions } from "@/components/FormActions";

type Over = Parameters<typeof missingMandatory>[1]["over"];
export type GuideKind = "fill" | "save" | "submit" | "await-submit" | "workflow" | "continue" | "amend";

/** Roles that may submit (permlevel 0 DocPerm rows with submit). */
export function submitRoles(meta: DocTypeMeta): string[] {
  const perms = (meta as unknown as { permissions?: { role?: string; submit?: number; permlevel?: number }[] }).permissions ?? [];
  return [...new Set(perms.filter((p) => Number(p.submit ?? 0) === 1 && Number(p.permlevel ?? 0) === 0 && p.role).map((p) => p.role!))].sort();
}

/** Source actions that continue the flow into another document the user may create (Create ▸ group or ungrouped mappings). */
export function continueActions(acts: FormAction[], user: string): FormAction[] {
  return acts.filter((a) => !!a.target && a.kind !== "route" && (!a.group || a.group === "Create")).filter((a) => {
    if (user === "Administrator") return true;
    const m = cachedMeta(a.target!); return !!m && hasPerm(m, "create", undefined, user);
  });
}

const press = (sel: string) => document.querySelector<HTMLButtonElement>(`[data-form-head] ${sel}`)?.click();
const focusField = (fieldname: string) => {
  const el = document.querySelector<HTMLElement>(`[data-field="${fieldname}"]`);
  el?.scrollIntoView({ block: "center" });
  el?.querySelector<HTMLElement>("input, select, textarea, button, [contenteditable=true]")?.focus();
};

export function NextStepGuide({ meta, doc, over, local, dirty, canWrite, canSubmit, submitServerOnly, workflowActions, hide, onPatch }: {
  meta: DocTypeMeta; doc: Doc; over: Over; local: boolean; dirty: boolean; canWrite: boolean; canSubmit: boolean; submitServerOnly: boolean;
  workflowActions: string[]; hide?: string[] | undefined; onPatch?: (p: Record<string, unknown>) => void;
}) {
  const ar = useLang() === "ar"; const tx = (en: string, a: string) => (ar ? a : en);
  const user = useSessionUser();
  const { data: all } = useQuery(formActionsQuery);
  const { data: index } = useQuery(indexQuery);
  const { run, busy } = useFormActionRunner(meta, doc, onPatch);
  const ds = Number(doc.docstatus ?? 0);
  let kind: GuideKind | null = null; let title = ""; let body: ReactNode = null; let act: ReactNode = null;
  const btn = (label: string, onClick: () => void, key?: string, quiet = false) => (
    <button key={key ?? label} type="button" className={`${quiet ? "btn-ghost border border-border" : "btn-primary"} h-8 px-3 text-xs`} onClick={onClick} disabled={busy} data-guide-next={key ?? label}>
      <span>{label}</span><ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden /></button>);

  if (ds === 0 && (local || dirty)) {
    if (!canWrite) return null;
    const miss = missingMandatory(meta, { doc, over });
    if (miss.length) {
      kind = "fill"; title = tx("Next: fill the required fields, then save", "الخطوة التالية: أكمل الحقول الإلزامية ثم احفظ");
      body = <div className="flex flex-wrap items-center gap-1.5" data-guide-missing={miss.length}>
        {miss.slice(0, 6).map((f) => <button key={f.fieldname} type="button" className="chip border border-border bg-card hover:bg-muted" onClick={() => focusField(f.fieldname!)} data-guide-field={f.fieldname}>{f.label || f.fieldname}</button>)}
        {miss.length > 6 && <bdi dir="ltr" className="text-xs text-muted-foreground" data-no-i18n>+{miss.length - 6}</bdi>}
      </div>;
    } else {
      kind = "save"; title = tx("Ready to save — every required field is filled", "جاهز للحفظ — كل الحقول الإلزامية مكتملة");
      act = btn(tx("Save", "حفظ"), () => press("[data-save]"), "save");
    }
  } else if (ds === 0) {
    if (workflowActions.length) {
      kind = "workflow"; title = tx("Next: a workflow step you can take", "الخطوة التالية: إجراء سير عمل متاح لك");
      body = <div className="flex flex-wrap gap-1.5">{[...new Set(workflowActions)].map((a) => <span key={a} className="chip bg-muted" data-guide-action={a}>{a}</span>)}</div>;
      act = btn(tx("Open actions", "فتح الإجراءات"), () => press("[data-workflow-actions] > button"), "workflow");
    } else if (meta.is_submittable) {
      if (canSubmit && !submitServerOnly) {
        kind = "submit"; title = tx("Next: submit — it becomes final and posts its entries", "الخطوة التالية: الاعتماد — يصبح المستند نهائيًا وتُرحَّل قيوده");
        act = btn(tx("Submit", "اعتماد"), () => press("[data-submit]"), "submit");
      } else if (!canSubmit) {
        const roles = submitRoles(meta);
        kind = "await-submit"; title = tx("Saved — waiting for someone allowed to submit it", "تم الحفظ — بانتظار من يملك صلاحية الاعتماد");
        body = roles.length ? <p className="text-xs text-muted-foreground" data-guide-roles={roles.length}>{tx("Can submit:", "يستطيع الاعتماد:")} {roles.map((r, i) => <span key={r}>{i ? (ar ? "، " : ", ") : ""}<span>{r}</span></span>)}</p> : null;
      }
    }
  } else if (ds === 1) {
    const next = continueActions(visibleFormActions(meta, doc, all, index, hide), user).slice(0, 4);
    if (next.length) {
      kind = "continue"; title = tx("Next: continue the flow", "الخطوة التالية: أكمل الدورة");
      act = <div className="flex flex-wrap gap-1.5">{next.map((a, i) => btn(a.label, () => void run(a), a.label, i > 0))}</div>;
    }
  } else if (ds === 2 && canSubmit) {
    kind = "amend"; title = tx("Cancelled — amend to make a corrected copy", "ملغى — عدّل لإنشاء نسخة مصحّحة");
    act = btn(tx("Amend", "تعديل"), () => press("[data-amend]"), "amend");
  }
  if (!kind) return null;
  return (
    <section className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm" aria-label={tx("Next step", "الخطوة التالية")} data-smart-guide={kind}>
      <Compass className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1"><p className="font-medium" data-guide-title>{title}</p>{body}</div>
      {act}
    </section>
  );
}
