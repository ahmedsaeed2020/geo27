/**
 * Shared DIGIT Enterprise account footer (owner enterprise UI goal 2026-10-21, Lock 1): the same company / role / profile /
 * preferences / display-width / admin shortcuts block DIGIT Pro shows, for every DIGIT app and the Enterprise Home. Company
 * comes from the shared Session Defaults resolver and the role from the simulated session user, so it is display only; the
 * Core user menu below keeps Switch User / Logout. Admin shortcuts appear only when the user may read their DocType.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { indexQuery } from "@/lib/catalog";
import { canReadType } from "@/lib/scope";
import { ADMIN, useSessionUser, userRoles } from "@/lib/session";
import { defaultCompany } from "@/lib/sessionDefaults";
import { usePageCompanyValue } from "./RecordProfile";
import { openShellDialog, setSettings, useSettings } from "@/lib/userSettings";
import { useLang } from "@/i18n";

const L = {
  title: ["Account & preferences", "الحساب والتفضيلات"], company: ["Company", "الشركة"], role: ["Role", "الدور"], profile: ["Profile", "الملف الشخصي"],
  prefs: ["My Preferences", "تفضيلاتي"], width: ["Display width", "عرض الشاشة"], full: ["Full Width", "عرض كامل"], compact: ["Compact", "مضغوط"],
  defaults: ["Company Defaults", "الإعدادات الافتراضية للشركة"], users: ["Users & Permissions", "المستخدمون والصلاحيات"], admin: ["Administrator", "مسؤول النظام"],
} as const;

export function EnterpriseAccount({ account }: { account?: ReactNode }) {
  const ar = useLang() === "ar"; const t = (k: keyof typeof L) => L[k][ar ? 1 : 0];
  const [open, setOpen] = useState(false);
  const s = useSettings(); const user = useSessionUser(); const roles = userRoles(user);
  const idx = useQuery(indexQuery);
  // a record page names its company (usePageCompany), so the account menu, the top bar and the record agree (owner H1-07)
  const pageCompany = usePageCompanyValue();
  const company = pageCompany || defaultCompany(user);
  const role = user === ADMIN ? t("admin") : roles.filter((x) => !["All", "Guest", "Desk User"].includes(x)).join(", ") || "—";
  const slot = (dt: string) => idx.data?.find((e) => e.name === dt);
  const gd = slot("Global Defaults"); const us = slot("User");
  const sysMgr = user === ADMIN || roles.includes("System Manager");
  return (
    <div className="dx-acct" data-dx-account>
      {open && <div id="dx-acct-body" className="dx-acct-body" data-dx-account-body>
        <div className="dx-acct-row"><span className="dx-acct-k">{t("company")}</span><span className="truncate" data-no-i18n>{company || "—"}</span></div>
        <div className="dx-acct-row"><span className="dx-acct-k">{t("role")}</span><span className="truncate" data-no-i18n>{role}</span></div>
        <div className="dx-acct-actions">
          <button type="button" className="dx-acct-btn" onClick={() => openShellDialog("settings", "Profile")} data-dx-account-item="profile">{t("profile")}</button>
          <button type="button" className="dx-acct-btn" onClick={() => openShellDialog("settings")} data-dx-account-item="preferences">{t("prefs")}</button>
        </div>
        <div className="dx-acct-seg" role="radiogroup" aria-label={t("width")} data-dx-width>
          <span className="dx-acct-k">{t("width")}</span>
          {(["Full Width", "Compact"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={s.layout === v} className="dx-acct-opt" onClick={() => setSettings({ layout: v })} data-dx-width-opt={v}>{v === "Full Width" ? t("full") : t("compact")}</button>)}
        </div>
        <div className="dx-acct-actions">
          {gd && canReadType("Global Defaults", user) && <Link to="/app/$app/$doctype/$name" params={{ app: gd.app, doctype: gd.slug, name: "Global Defaults" }} className="dx-acct-btn" data-dx-account-item="defaults">{t("defaults")}</Link>}
          {us && sysMgr && canReadType("User", user) && <Link to="/app/$app/$doctype" params={{ app: us.app, doctype: us.slug }} className="dx-acct-btn" data-dx-account-item="users">{t("users")}</Link>}
        </div>
      </div>}
      <button type="button" className="dx-acct-toggle" aria-expanded={open} aria-controls="dx-acct-body" onClick={() => setOpen(!open)} data-dx-account-toggle>
        <span className="min-w-0 flex-1 text-start"><span className="block text-[11px] opacity-70">{t("title")}</span><span className="block truncate" data-no-i18n>{company || "—"}</span></span>
        <img src="/icons/digit/ui/digit-ui-chevron-dark.svg" alt="" aria-hidden className={`dx-acct-chev ${open ? "dx-acct-chev-up" : ""}`} />
      </button>
      {account && <div className="dx-acct-user">{account}</div>}
    </div>
  );
}
