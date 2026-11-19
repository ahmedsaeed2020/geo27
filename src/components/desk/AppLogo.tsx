import { CrmIcon } from "@/components/crm/icons/CrmIcon";

/** Source app icons; source SVG colors and opacity are intentionally preserved. */
const MARKS: Record<string, { cls: string; path: React.ReactNode }> = {
  home: { cls: "bg-foreground text-background", path: <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /> },
  erpnext: { cls: "bg-primary text-primary-foreground", path: <path d="M7 5h10v2.6H10v3.1h6v2.6h-6v3.1h7V19H7z" /> },
  frappe: { cls: "bg-foreground text-background", path: <path d="M8 5h9v2.6h-6v3.2h5v2.6h-5V19H8z" /> },
  hrms: { cls: "bg-success text-primary-foreground", path: <><circle cx="12" cy="8" r="3" /><path d="M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6z" /></> },
  crm: { cls: "bg-primary text-primary-foreground", path: <><circle cx="9" cy="9" r="2.6" /><circle cx="15.5" cy="10" r="2.2" /><path d="M4 18c0-2.8 2.2-5 5-5s5 2.2 5 5zM13.5 18c.1-1.6-.4-3-1.4-4 .9-.6 1.9-.9 3-.9 2.4 0 4.4 2 4.4 4.9z" /></> },
  insights: { cls: "bg-warning text-foreground", path: <path d="M5 19V11h3v8zm5.5 0V6h3v13zM16 19v-5h3v5z" /> },
  hrapp: { cls: "bg-success text-primary-foreground", path: <path d="M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zm1 3v11h6V6zm3 12.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z" /> },
  reports: { cls: "bg-foreground text-background", path: <path d="M6 3h9l4 4v14H6zm8 1.5V8h3.5zM8.5 12h8v1.5h-8zm0 3h8v1.5h-8zm0-6h4v1.5h-4z" /> },
};
export function AppLogo({ id }: { id: string }) {
  const urls: Record<string, string> = { erpnext: "/icons/erpnext/app-logo.svg", frappe: "/icons/frappe/app-logo.svg", hrms: "/icons/hrms/app-logo.svg", hrapp: "/icons/hrms/app-logo.svg", insights: "/icons/insights/app-logo.svg" };
  if (id === "crm") return <span data-app-logo={id} className="flex h-9 w-9 items-center justify-center"><CrmIcon name="CRMLogo" className="h-9 w-9" /></span>;
  const url = urls[id];
  if (url) return <span data-app-logo={id} className="flex h-9 w-9 items-center justify-center"><img src={url} alt="" className="h-9 w-9" /></span>;
  const m = MARKS[id] ?? MARKS["home"];
  if (!m) return null;
  return <span data-app-logo={id} className="flex h-9 w-9 items-center justify-center text-muted-foreground"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>{m["path"]}</svg></span>;
}
