/**
 * Shared e-mail composer (frappe CommunicationComposer): To / CC / BCC, Email Template, subject, message, send-me-a-copy
 * and attach-print options, with the v16 Undo Send window. One branded dialog used by every app's document screens;
 * logic lives in lib/emailCompose.ts.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Doc } from "@/lib/adapter";
import { applyTemplate, commitEmail, draftErrors, scheduleSend, templatesFor, UNDO_SECONDS, type Draft } from "@/lib/emailCompose";
import { useSessionUser } from "@/lib/session";
import { useLang } from "@/i18n";

const blank = (subject: string): Draft => ({ to: "", cc: "", bcc: "", subject, content: "", template: "", sendMeCopy: false, attachPrint: false });

export function EmailComposer({ open, onClose, doctype, doc, initial }: { open: boolean; onClose: () => void; doctype: string; doc: Doc; initial?: Partial<Draft> }) {
  const ar = useLang() === "ar"; const user = useSessionUser();
  const [d, setD] = useState<Draft>(() => ({ ...blank(`${doctype}: ${doc.name}`), ...initial }));
  const [showBcc, setShowBcc] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [note, setNote] = useState<string[]>([]);
  useEffect(() => { if (open) { setD({ ...blank(`${doctype}: ${doc.name}`), to: String(doc["contact_email"] ?? doc["email_id"] ?? ""), ...initial }); setErrs([]); setNote([]); } }, [open, doc.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const tpls = templatesFor(doctype);
  const set = (k: keyof Draft, v: string | boolean) => setD((x) => ({ ...x, [k]: v }));
  const useTpl = (name: string) => {
    set("template", name); if (!name) return;
    const r = applyTemplate(name, doc); if (!r) return;
    setD((x) => ({ ...x, template: name, subject: r.subject || x.subject, content: r.content }));
    setNote(r.unsupported);
  };
  const send = () => {
    const e = draftErrors(d); setErrs(e); if (e.length) return;
    const draft = d; onClose();
    const job = scheduleSend(() => {
      const r = commitEmail(doctype, doc.name, draft, user);
      if (r.errors.length) toast.error(r.errors.join("\n"));
      else toast.success(ar ? `أُرسل البريد إلى ${r.provider} (${r.status === "Queued" ? "في قائمة الإرسال" : "بانتظار ربط المزوّد"}) وسُجّل في الخط الزمني` : `Email handed to ${r.provider} (${r.status}) and recorded on the timeline`);
    });
    toast(ar ? `سيُرسل البريد خلال ${UNDO_SECONDS} ثوانٍ` : `Sending in ${UNDO_SECONDS} seconds`, {
      duration: UNDO_SECONDS * 1000,
      action: { label: ar ? "تراجع" : "Undo", onClick: () => { if (job.cancel()) { toast(ar ? "أُلغي الإرسال — المسودة محفوظة" : "Sending cancelled — draft kept"); reopen(draft); } } },
    });
  };
  const reopen = (draft: Draft) => { pendingDraft = draft; window.dispatchEvent(new CustomEvent("digit:email-reopen", { detail: { doctype, name: doc.name } })); };
  const lbl = "text-xs font-medium text-muted-foreground";
  const inp = "mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm";
  return <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="max-w-2xl" data-email-composer={`${doctype}:${doc.name}`}>
      <DialogHeader>
        <DialogTitle>{ar ? "بريد جديد" : "New Email"}</DialogTitle>
        <DialogDescription><span>{ar ? "يُسجَّل في الخط الزمني لـ" : "Recorded on the timeline of"}</span> <bdi data-no-i18n>{doc.name}</bdi></DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <label className="block"><span className={lbl}>{ar ? "إلى" : "To"}</span><input className={inp} value={d.to} onChange={(e) => set("to", e.target.value)} placeholder="name@example.com" data-email-to dir="ltr" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={lbl}>{ar ? "نسخة" : "CC"}</span><input className={inp} value={d.cc ?? ""} onChange={(e) => set("cc", e.target.value)} data-email-cc dir="ltr" /></label>
          {showBcc ? <label className="block"><span className={lbl}>{ar ? "نسخة مخفية" : "BCC"}</span><input className={inp} value={d.bcc ?? ""} onChange={(e) => set("bcc", e.target.value)} data-email-bcc dir="ltr" /></label>
            : <button type="button" className="self-end text-start text-xs text-primary hover:underline" onClick={() => setShowBcc(true)} data-email-show-bcc>{ar ? "إضافة نسخة مخفية" : "Add BCC"}</button>}
        </div>
        <label className="block"><span className={lbl}>{ar ? "قالب البريد" : "Email Template"}</span>
          <select className={inp} value={d.template ?? ""} onChange={(e) => useTpl(e.target.value)} data-email-template>
            <option value="">{ar ? "— بدون قالب —" : "— No template —"}</option>
            {tpls.map((t) => <option key={t.name} value={t.name} data-no-i18n>{t.name}</option>)}
          </select></label>
        <label className="block"><span className={lbl}>{ar ? "الموضوع" : "Subject"}</span><input className={inp} value={d.subject} onChange={(e) => set("subject", e.target.value)} data-email-subject /></label>
        <label className="block"><span className={lbl}>{ar ? "الرسالة" : "Message"}</span><textarea className={`${inp} min-h-40`} value={d.content} onChange={(e) => set("content", e.target.value)} data-email-message /></label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!d.sendMeCopy} onChange={(e) => set("sendMeCopy", e.target.checked)} data-email-copy />{ar ? "أرسل لي نسخة" : "Send me a copy"}</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!d.attachPrint} onChange={(e) => set("attachPrint", e.target.checked)} data-email-attach />{ar ? "إرفاق نسخة الطباعة" : "Attach document print"}</label>
        </div>
        {note.length > 0 && <p className="text-xs text-muted-foreground" data-email-template-note>{ar ? "أجزاء من القالب تحتاج خادم القوالب ولم تُدرج:" : "Template parts that need the template server were left out:"} <bdi data-no-i18n>{note.join(" · ")}</bdi></p>}
        {errs.length > 0 && <ul className="rounded-md bg-destructive/10 p-2 text-sm text-destructive" data-email-errors>{errs.map((x) => <li key={x}>{x}</li>)}</ul>}
      </div>
      <DialogFooter>
        <button type="button" className="btn-ghost" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button>
        <button type="button" className="btn-primary" onClick={send} data-email-send>{ar ? "إرسال" : "Send"}</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
/** The draft restored by Undo (read once by the next composer the record screen opens). */
let pendingDraft: Draft | null = null;
export function takePendingDraft(): Draft | null { const d = pendingDraft; pendingDraft = null; return d; }
