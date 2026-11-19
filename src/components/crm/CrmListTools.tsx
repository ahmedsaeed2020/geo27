import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { userRoles } from "@/lib/session";
import { useL } from "./crmI18n";

/**
 * Standard list tools menu (frappe list_view.js "Menu": Import, Export, Print, Customize Form,
 * DocType settings, Role Permissions). Administrative entries render only for System Manager,
 * as in the source; data security itself is enforced by src/lib/session.ts, not by hiding.
 * Import uses the canonical CRM Data Import; Export/Customize/DocType use the shared Core routes,
 * which stay inside the active app shell (ACTIVE_APP_PERSISTENCE).
 */
export function CrmListTools({ doctype, app = "crm" }: { doctype: string; app?: string }) {
  const [open, setOpen] = useState(false);
  const { L } = useL();
  const admin = userRoles().includes("System Manager");
  const item = "block w-full rounded px-3 py-1.5 text-start text-sm hover:bg-crm-hover";
  return (
    <div className="relative">
      <button className="crm-input w-auto" aria-label={L("List tools")} aria-haspopup="menu" onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div role="menu" aria-label={L("List tools")} className="absolute end-0 z-30 mt-1 w-60 rounded-lg border border-crm-line bg-crm-surface p-1 shadow-lg" onClick={() => setOpen(false)}>
          <Link to="/app/data-import/new" className={item}>{L("Import")}</Link>
          <Link to="/app/data-export" search={{ doctype }} className={item}>{L("Export")}</Link>
          <button className={item} onClick={() => window.print()}>{L("Print")}</button>
          {admin && <div className="my-1 border-t border-crm-line" />}
          {admin && <Link to="/customize-form" search={{ doctype }} className={item}>{L("Customize Form")}</Link>}
          {admin && <Link to="/app/$app/$doctype/$name" params={{ app, doctype: "DocType", name: doctype }} className={item}>{L("DocType Settings")}</Link>}
          {admin && <Link to="/page/$name" params={{ name: "permission-manager" }} className={item}>{L("Role Permissions")}</Link>}
        </div>
      )}
    </div>
  );
}
