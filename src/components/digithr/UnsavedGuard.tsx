/**
 * Unsaved-change protection for DIGIT HR editing surfaces (HR-owned copy of the snapshot helper; native forms inside
 * DIGIT HR are protected by the Core experience-slot guard declared in src/plugins/digit_hr/slots.tsx). Blocks in-app navigation (links, Back/Forward) with a Stay / Discard dialog
 * and asks the browser's native reload/close prompt while `dirty`. Nothing is persisted: discarding loses the draft, and
 * no recovery of unsaved input is promised. Callers that navigate right after a successful save call `release()` first.
 * Opt-in only (HR editing surfaces and native forms inside apps listed in UNSAVED_GUARD_APPS), so Desk and CRM keep
 * their current behaviour.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLang } from "@/i18n";

export function useUnsavedGuard(dirty: boolean): { release: () => void; dialog: ReactNode } {
  const live = useRef(dirty); live.current = dirty;
  const bypass = useRef(false);
  useEffect(() => { if (dirty) bypass.current = false; }, [dirty]);
  const blocker = useBlocker({
    shouldBlockFn: () => { if (bypass.current) { bypass.current = false; return false; } return live.current; },
    enableBeforeUnload: () => live.current && !bypass.current,
    withResolver: true,
  });
  return { release: () => { bypass.current = true; }, dialog: <UnsavedDialog blocker={blocker} /> };
}

function UnsavedDialog({ blocker }: { blocker: { status: "blocked"; proceed: () => void; reset: () => void } | { status: "idle" } }) {
  const ar = useLang() === "ar";
  if (blocker.status !== "blocked") return null;
  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) blocker.reset(); }}>
      <AlertDialogContent dir={ar ? "rtl" : "ltr"} data-unsaved-navigation>
        <AlertDialogTitle>{ar ? "تغييرات غير محفوظة" : "Unsaved changes"}</AlertDialogTitle>
        <AlertDialogDescription>{ar ? "لديك تغييرات غير محفوظة. مغادرة هذه الصفحة ستتجاهلها ولا يمكن استرجاعها." : "You have unsaved changes. Leaving this page discards them and they cannot be recovered."}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus onClick={() => blocker.reset()} data-unsaved-stay>{ar ? "البقاء ومتابعة التحرير" : "Stay and keep editing"}</AlertDialogCancel>
          <AlertDialogAction onClick={() => blocker.proceed()} data-unsaved-leave>{ar ? "تجاهل التغييرات والمغادرة" : "Discard and leave"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
