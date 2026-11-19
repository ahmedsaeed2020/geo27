import { useEffect, useState } from "react";
import { Modal } from "./CrmShell";
import { useL } from "./crmI18n";

/** Keyboard shortcuts dialog (Ctrl+/), listing the CRM global shortcuts. */
export const SHORTCUTS: [string, string][] = [["Ctrl+K", "Open command palette"], ["Ctrl+/", "Show keyboard shortcuts"], ["Esc", "Close dialog"]];

export function CrmShortcuts() {
  const { L } = useL(); const [open, setOpen] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); setOpen(o => !o); } if (e.key === "Escape") setOpen(false); }; const o = () => setOpen(true); window.addEventListener("keydown", h); window.addEventListener("crm-open-shortcuts", o); return () => { window.removeEventListener("keydown", h); window.removeEventListener("crm-open-shortcuts", o); }; }, []);
  if (!open) return null;
  return <Modal title={L("Keyboard Shortcuts")} onClose={() => setOpen(false)}><ul className="space-y-2 text-sm">{SHORTCUTS.map(([k, d]) => <li key={k} className="flex justify-between"><span>{L(d)}</span><kbd dir="ltr" className="rounded border border-crm-line px-1.5">{k}</kbd></li>)}</ul></Modal>;
}
