import { Link } from "@tanstack/react-router";
import { KPI_TILE } from "@/components/enterprise/kit";
import { useState } from "react";
import { openShellDialog } from "@/lib/userSettings";
import { ProFrame } from "./ProFrame";
import { useNavResolver } from "./ProSidebar";
import { NAV_AR, targetHref, type NavItem, type Service } from "./nav";
import { useLang } from "@/i18n";
import { useStoreVersion } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";

/**
 * Shared-service landing (Reports & Compliance, Settings & Configuration, Support & Help).
 * Groups come from SERVICES in nav.ts; each item opens its native Core destination, is hidden when the
 * session user lacks permission, and `missing` items render as an honest "Not available" state with the dependency.
 */
export function ServicePage({ s }: { s: Service }) {
  const r = useNavResolver();
  const [q, setQ] = useState("");
  return (
    <ProFrame title={s.label} subtitle={s.subtitle} tabs={false} icon={s.icon}>
      {() => {
        const ql = q.trim().toLowerCase();
        const match = (i: NavItem) => !ql || i.label.toLowerCase().includes(ql);
        const groups = s.groups.map((g) => ({ ...g, items: g.items.filter((i) => r.state(i) !== "denied" && match(i)) }));
        const hidden = s.groups.reduce((n, g) => n + g.items.filter((i) => r.state(i) === "denied").length, 0);
        return (
          <div className="dp-ws" data-dp-service={s.id}>
            <section className="dp-ws-scope">
              <input type="search" className="field-input dp-ws-search" placeholder="Find a document, report or setting" aria-label="Find a document, report or setting" value={q} onChange={(e) => setQ(e.target.value)} data-dp-ws-search />
              {hidden > 0 && <p className="text-xs text-muted-foreground" data-dp-hidden><span data-no-i18n>{hidden}</span> <span>items hidden by your permissions</span></p>}
            </section>
            {s.id === "settings" && !ql && <SetupStatus s={s} r={r} />}
            <div className="dp-ws-grid">
              {groups.map((g) => g.items.length === 0 ? (ql ? null : <div key={g.label} className="dp-card" data-dp-group={g.label}><h3 className="text-sm font-semibold">{g.label}</h3><p className="mt-2 text-sm text-muted-foreground" data-dp-group-denied>Not Permitted</p></div>) : (
                <div key={g.label} className="dp-card" data-dp-group={g.label}>
                  <h3 className="text-sm font-semibold">{g.label}</h3>
                  {g.hint && <p className="mt-1 text-xs text-muted-foreground">{g.hint}</p>}
                  <ul className="mt-2 grid gap-1.5 text-sm">{g.items.map((i) => <ServiceLink key={i.label} i={i} r={r} />)}</ul>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </ProFrame>
  );
}

/** OWN-12: the organisation set-up at a glance — each figure opens its list; a figure the user may not read is not shown. */
const SETUP: { dt: string; label: [string, string]; count: (rows: Record<string, unknown>[], today: string) => { value: string; warn?: boolean; meta: [string, string] } }[] = [
  { dt: "Company", label: ["Companies", "الشركات"], count: (r) => ({ value: String(r.length), warn: !r.length, meta: r.length ? ["set up", "مُعدّة"] : ["add the first company", "أضف الشركة الأولى"] }) },
  { dt: "Fiscal Year", label: ["Current fiscal year", "السنة المالية الحالية"], count: (r, today) => { const cur = r.find((y) => String(y["year_start_date"] ?? "") <= today && today <= String(y["year_end_date"] ?? "") && !Number(y["disabled"] ?? 0));
    return cur ? { value: String(cur["name"]), meta: [`${r.length} fiscal years`, `${r.length} سنوات مالية`] } : { value: "—", warn: true, meta: ["no fiscal year covers today", "لا توجد سنة مالية تغطي اليوم"] }; } },
  { dt: "Branch", label: ["Branches", "الفروع"], count: (r) => ({ value: String(r.length), warn: !r.length, meta: ["branches", "فروع"] }) },
  { dt: "Department", label: ["Departments", "الأقسام"], count: (r) => ({ value: String(r.length), warn: !r.length, meta: ["departments", "أقسام"] }) },
  { dt: "User", label: ["Active users", "المستخدمون النشطون"], count: (r) => { const on = r.filter((u) => Number(u["enabled"] ?? 1) && !["Guest"].includes(String(u["name"]))); return { value: String(on.length), meta: [`${r.length - on.length} disabled`, `${r.length - on.length} معطّل`] }; } },
  { dt: "Role", label: ["Roles", "الأدوار"], count: (r) => ({ value: String(r.filter((x) => !Number(x["disabled"] ?? 0)).length), meta: ["roles in use", "أدوار مفعّلة"] }) },
];
function SetupStatus({ s, r }: { s: Service; r: ReturnType<typeof useNavResolver> }) {
  useStoreVersion(); const user = useSessionUser(); const ar = useLang() === "ar";
  const today = new Date().toISOString().slice(0, 10);
  const items = s.groups.flatMap((g) => g.items);
  const cards = SETUP.flatMap((c) => {
    const i = items.find((x) => x.label === c.dt); if (!i || r.state(i) !== "ok") return [];
    const h = targetHref(i.target, r.appOf); if (!h) return [];
    return [{ ...c, h, v: c.count(scopedList(c.dt, user), today) }];
  });
  if (!cards.length) return null;
  return <section className="dp-cc-signals" aria-label={ar ? "حالة الإعداد" : "Set-up status"} data-dp-setup-status={cards.length}>
    {cards.map((c) => <Link key={c.dt} to={c.h.to as never} params={c.h.params as never} search={c.h.search as never} className={KPI_TILE} data-dp-setup={c.dt} {...(c.v.warn ? { "data-tone": "warn" } : {})}>
      <span className="dp-cc-label">{ar ? c.label[1] : c.label[0]}</span>
      <span className="dp-cc-value" data-no-i18n>{c.v.value}</span>
      <span className="dp-cc-meta">{ar ? c.v.meta[1] : c.v.meta[0]}</span>
    </Link>)}
  </section>;
}

export function ServiceLink({ i, r }: { i: NavItem; r: ReturnType<typeof useNavResolver> }) {
  const ar = useLang() === "ar";
  const t = i.target;
  if (t.kind === "missing") return <li className="dp-ws-link" data-dp-missing={i.label}><span className="text-muted-foreground"><span>{i.label}</span> · <span>Not available</span><span className="block text-xs">{t.reason}</span></span></li>;
  if (t.kind === "dialog") return <li className="dp-ws-link"><button type="button" className="text-start hover:underline" onClick={() => openShellDialog(t.dialog)} data-dp-resource={i.label}>{i.label}</button></li>;
  const st = r.state(i);
  const h = st === "ok" ? targetHref(t, r.appOf) : undefined;
  // Pro's own Arabic label wins where the shared field dictionary keeps the English term (e.g. "Webhook").
  const own = ar ? NAV_AR[i.label] : undefined;
  return <li className="dp-ws-link">
    {h ? <Link to={h.to as never} params={h.params as never} search={h.search as never} data-dp-resource={i.label}>{own ? <span data-no-i18n>{own}</span> : i.label}</Link> : <span className="text-muted-foreground" data-dp-unavailable>{i.label} · <span>Unavailable</span></span>}
    {t.kind === "pro" && <span className="chip bg-primary/10 text-primary" title="Premium enhancement">Pro</span>}
    {t.kind === "report" && <span className="text-[10px] text-muted-foreground">report</span>}
  </li>;
}
