import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Site Explorer (blueprint priority C) — the HR Organization Explorer pattern (selectable hierarchy + source-bound side
 * panels) applied to the FSM physical graph: native Customer → FSM Service Site → FSM Location Node tree (building /
 * floor / zone via parent_node) → FSM Service System (location) → FSM Device (system, location). Selecting a node keeps
 * `sel=<type>:<name>` in the URL and filters the related devices, visits, jobs and open findings through their own Link
 * fields; every count opens its filtered register / portfolio / report and every row its 360 or form. Nothing is copied.
 */
import { useState, type ReactNode } from "react";
import { SignalCard } from "@/components/digit/Experience";
import type { Doc } from "@/lib/adapter";
import { list, titleOf } from "../domain/data";
import { OPEN_DEFICIENCY, s } from "../domain/rules";
import { visitFacts, visitIndex } from "../domain/visits";
import { destinationByKey } from "../screens";
import { DestinationShell } from "./destination";
import { LeadTag, ArrivalTag } from "./operations";
import { AppLink, BAND, DataTable, DocRef, INPUT, ListRef, NewDoc, Panel, SignalGrid, StateChip, dtTxt, numTxt, opt, useFx, useUrlState } from "./kit";
import { PageInsights } from "./ov/ded";

type Kind = "customer" | "site" | "loc" | "system" | "device";
const KIND: Record<Kind, [string, string]> = { customer: ["Customer", "العميل"], site: ["Site", "الموقع"], loc: ["Location", "المكان"], system: ["System", "النظام"], device: ["Device", "الجهاز"] };

export function SiteExplorerPage() {
  const fx = useFx(); const { t, ar } = fx; const dest = destinationByKey("site-explorer")!;
  const [f, set] = useUrlState();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sites = list("FSM Service Site"); const nodes = list("FSM Location Node"); const systems = list("FSM Service System"); const devices = list("FSM Device");
  const defs = list("FSM Deficiency"); const jobs = list("FSM Job"); const runs = list("FSM Inspection Run");
  const needle = (f["q"] ?? "").toLowerCase();
  const visibleSites = sites.filter((x) => !needle || [x.name, x["site_name"], x["site_code"], x["city"], x["customer"]].some((v) => s(v).toLowerCase().includes(needle)));
  const customers = [...new Set(visibleSites.map((x) => s(x["customer"])))].sort();
  const [selKind, ...rest] = (f["sel"] ?? "").split(":"); const selName = rest.join(":");
  const toggle = (k: string) => { const n = new Set(open); if (n.has(k)) n.delete(k); else n.add(k); setOpen(n); };
  const pick = (k: Kind, name: string) => set({ sel: `${k}:${name}` });

  // ---- scope of the selected node (sets of canonical names)
  const subtree = (root: string) => { const out = new Set([root]); let grew = true; while (grew) { grew = false; for (const n of nodes) if (out.has(s(n["parent_node"])) && !out.has(n.name)) { out.add(n.name); grew = true; } } return out; };
  let scopeSites = new Set<string>(), scopeSystems = new Set<string>(), scopeDevices = new Set<string>(); let siteLevel = true;
  const sel = selKind as Kind;
  if (sel === "customer") { scopeSites = new Set(sites.filter((x) => s(x["customer"]) === selName).map((x) => x.name)); }
  else if (sel === "site") { scopeSites = new Set([selName]); }
  else if (sel === "loc") { const tree = subtree(selName); const node = nodes.find((n) => n.name === selName); scopeSites = new Set(node ? [s(node["site"])] : []); siteLevel = false;
    scopeSystems = new Set(systems.filter((x) => tree.has(s(x["location"]))).map((x) => x.name)); scopeDevices = new Set(devices.filter((d) => tree.has(s(d["location"])) || scopeSystems.has(s(d["system"]))).map((d) => d.name)); }
  else if (sel === "system") { const sy = systems.find((x) => x.name === selName); scopeSites = new Set(sy ? [s(sy["site"])] : []); siteLevel = false; scopeSystems = new Set([selName]); scopeDevices = new Set(devices.filter((d) => s(d["system"]) === selName).map((d) => d.name)); }
  else if (sel === "device") { const d = devices.find((x) => x.name === selName); scopeSites = new Set(d ? [s(d["site"])] : []); siteLevel = false; scopeDevices = new Set([selName]); scopeSystems = new Set(d ? [s(d["system"])] : []); }
  if (siteLevel && scopeSites.size) { scopeSystems = new Set(systems.filter((x) => scopeSites.has(s(x["site"]))).map((x) => x.name)); scopeDevices = new Set(devices.filter((d) => scopeSites.has(s(d["site"]))).map((d) => d.name)); }
  const has = scopeSites.size > 0;
  const runsIn = runs.filter((r) => scopeSystems.has(s(r["system"])));
  const jobsIn = siteLevel ? jobs.filter((j) => scopeSites.has(s(j["site"]))) : jobs.filter((j) => runsIn.some((r) => s(r["job"]) === j.name) || ((j["obligations"] as { system?: string }[] | undefined) ?? []).some((o) => scopeSystems.has(s(o.system))));
  const ix = visitIndex();
  const visitNames = new Set(runsIn.map((r) => s(r["visit"])).filter(Boolean));
  const visitsIn = list(VISIT_DT).filter((v) => (siteLevel ? scopeSites.has(s(v["site"])) : visitNames.has(v.name)));
  const defsIn = defs.filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"])) && (siteLevel ? scopeSites.has(s(d["site"])) : scopeDevices.has(s(d["device"])) || (sel !== "device" && scopeSystems.has(s(d["system"])))));
  const devicesIn = devices.filter((d) => scopeDevices.has(d.name));
  const oneSite = scopeSites.size === 1 ? [...scopeSites][0]! : "";

  // ---- tree
  const Row = ({ k, name, label, depth, kids, count }: { k: Kind; name: string; label: ReactNode; depth: number; kids: boolean; count?: number }) => {
    const key = `${k}:${name}`; const on = f["sel"] === key; const exp = open.has(key);
    return <div className={`flex items-center gap-1 rounded-md pe-2 text-sm ${on ? "bg-primary/10 font-semibold text-foreground" : "hover:bg-muted"}`} style={{ paddingInlineStart: `${depth * 14 + 4}px` }} data-tree-node={key}>
      {kids ? <button type="button" className="h-7 w-6 shrink-0 text-muted-foreground" aria-expanded={exp} aria-label={exp ? t("Collapse", "طي") : t("Expand", "توسيع")} onClick={() => toggle(key)}><span aria-hidden className={`inline-block transition-transform ${exp ? "rotate-90" : "rtl:rotate-180"}`}>›</span></button> : <span className="w-6 shrink-0" />}
      <button type="button" className="min-w-0 flex-1 truncate py-1.5 text-start" aria-current={on ? "true" : undefined} onClick={() => pick(k, name)}>{label}</button>
      {count !== undefined && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground" data-no-i18n>{count}</span>}
    </div>;
  };
  const sysRows = (list_: Doc[], depth: number): ReactNode[] => list_.flatMap((sy) => {
    const devs = devices.filter((d) => s(d["system"]) === sy.name);
    return [<Row key={sy.name} k="system" name={sy.name} label={<span data-no-i18n>{s(sy["system_name"]) || sy.name}</span>} depth={depth} kids={devs.length > 0} count={devs.length} />,
      ...(open.has(`system:${sy.name}`) ? devs.map((d) => <Row key={d.name} k="device" name={d.name} label={<span data-no-i18n>{s(d["device_label"]) || d.name}</span>} depth={depth + 1} kids={false} />) : [])];
  });
  const nodeRows = (site: string, parent: string, depth: number): ReactNode[] => nodes.filter((n) => s(n["site"]) === site && s(n["parent_node"]) === parent).flatMap((n) => {
    const kidsN = nodes.some((x) => s(x["parent_node"]) === n.name); const sys = systems.filter((x) => s(x["location"]) === n.name);
    return [<Row key={n.name} k="loc" name={n.name} label={<><span className="text-xs text-muted-foreground">{opt(n["node_type"], ar)} · </span><span data-no-i18n>{s(n["node_label"])}</span></>} depth={depth} kids={kidsN || sys.length > 0} />,
      ...(open.has(`loc:${n.name}`) ? [...nodeRows(site, n.name, depth + 1), ...sysRows(sys, depth + 1)] : [])];
  });
  const tree = customers.flatMap((c) => {
    const cs = visibleSites.filter((x) => s(x["customer"]) === c);
    return [<Row key={c} k="customer" name={c} label={<span data-no-i18n>{titleOf("Customer", c)}</span>} depth={0} kids count={cs.length} />,
      ...(open.has(`customer:${c}`) || needle ? cs.flatMap((st) => [<Row key={st.name} k="site" name={st.name} label={<span data-no-i18n>{s(st["site_name"]) || st.name}</span>} depth={1} kids />,
        ...(open.has(`site:${st.name}`) ? [...nodeRows(st.name, "", 2), ...sysRows(systems.filter((x) => s(x["site"]) === st.name && !s(x["location"])), 2)] : [])]) : [])];
  });

  const kpi = (label: string, value: number, basis: string, link: (b: ReactNode, cls: string) => ReactNode, tone: "neutral" | "bad" | "warn" | "good" = "neutral") =>
    <SignalCard label={label} value={numTxt(value)} tone={tone} basis={basis} footer={<>{t("Open", "فتح")} ›</>} link={link} attrs={{ "data-kpi": label }} />;
  const devFilter: [string, string, unknown][] = sel === "system" ? [["FSM Device", "system", selName]] : oneSite ? [["FSM Device", "site", oneSite]] : [];
  const overview = (
    <>
    <PageInsights k="site-explorer" blocks={[{ id: "explorer", title: ["Portfolio tree and node detail", "شجرة المحفظة وتفاصيل العقدة"], node: (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      <Panel title={t("Portfolio tree", "شجرة المحفظة")} subtitle={t("Customer → site → building / floor / zone → system → device", "العميل ← الموقع ← المبنى/الطابق/المنطقة ← النظام ← الجهاز")}>
        <input type="search" className={`${INPUT} mb-2 w-full`} value={f["q"] ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} placeholder={t("Filter sites, city, customer", "فلترة المواقع أو المدينة أو العميل")} aria-label={t("Filter sites", "فلترة المواقع")} />
        <div className="max-h-[36rem] overflow-y-auto" role="tree" aria-label={t("Portfolio tree", "شجرة المحفظة")} data-site-tree>{tree.length ? tree : <p className="py-4 text-center text-sm text-muted-foreground">{t("No site matches.", "لا موقع مطابق.")}</p>}</div>
      </Panel>
      <div className="min-w-0">
        {!has ? <Panel title={t("Select a customer, site, place, system or device", "اختر عميلاً أو موقعاً أو مكاناً أو نظاماً أو جهازاً")}><p className="text-sm text-muted-foreground">{t("The panels then show only the devices, visits, jobs and open findings linked to that node.", "تعرض اللوحات عندها الأجهزة والزيارات وأوامر العمل والملاحظات المفتوحة المرتبطة بهذه العقدة فقط.")}</p></Panel> : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-3" data-selected-node={f["sel"]}>
              <span className="text-xs text-muted-foreground">{t(...KIND[sel])}</span>
              <strong className="min-w-0 truncate"><DocLabel dt={sel === "customer" ? "Customer" : sel === "site" ? "FSM Service Site" : sel === "loc" ? "FSM Location Node" : sel === "system" ? "FSM Service System" : "FSM Device"} name={selName} /></strong>
              <span className="ms-auto flex flex-wrap gap-2 text-xs">
                {oneSite && <AppLink to={`site/${encodeURIComponent(oneSite)}`}>{t("Site 360", "الموقع 360")} ›</AppLink>}
                {sel === "device" && <AppLink to={`device/${encodeURIComponent(selName)}`}>{t("Device 360", "الجهاز 360")} ›</AppLink>}
                {(sel === "customer" || sel === "loc" || sel === "system") && <DocRef doctype={sel === "customer" ? "Customer" : sel === "loc" ? "FSM Location Node" : "FSM Service System"} name={selName} form>{t("Open form", "فتح النموذج")} ›</DocRef>}
              </span>
            </div>
            <SignalGrid>
              {kpi(t("Systems", "الأنظمة"), scopeSystems.size, t("FSM Service System", "أنظمة الخدمة"), (b, cls) => <ListRef doctype="FSM Service System" filters={oneSite ? [["FSM Service System", "site", oneSite]] : undefined} className={cls}>{b}</ListRef>)}
              {kpi(t("Devices", "الأجهزة"), devicesIn.length, t("FSM Device in this node", "الأجهزة في هذه العقدة"), (b, cls) => <ListRef doctype="FSM Device" filters={devFilter} className={cls}>{b}</ListRef>)}
              {kpi(t("Open jobs", "أوامر عمل مفتوحة"), jobsIn.filter((j) => !["Closed", "Cancelled", "Completed"].includes(s(j["workflow_state"]))).length, siteLevel ? t("FSM Job.site", "أوامر العمل حسب الموقع") : t("Jobs with a run or obligation on these systems", "أوامر عمل بجولة أو التزام على هذه الأنظمة"), (b, cls) => <ListRef doctype="FSM Job" filters={oneSite ? [["FSM Job", "site", oneSite]] : undefined} className={cls}>{b}</ListRef>)}
              {kpi(t("Visits", "الزيارات"), visitsIn.length, siteLevel ? t("Maintenance Visit.site", "الزيارات حسب الموقع") : t("Visits with a run on these systems", "زيارات بجولة على هذه الأنظمة"), (b, cls) => <AppLink to={oneSite ? `visits?site=${encodeURIComponent(oneSite)}` : "visits"} className={cls}>{b}</AppLink>)}
              {kpi(t("Open findings", "ملاحظات مفتوحة"), defsIn.length, t("Distinct open FSM Deficiency", "ملاحظات مفتوحة مميزة"), (b, cls) => (oneSite && siteLevel ? <AppLink to={`reports/RP05?site=${encodeURIComponent(oneSite)}`} className={cls}>{b}</AppLink> : <ListRef doctype="FSM Deficiency" filters={sel === "device" ? [["FSM Deficiency", "device", selName]] : sel === "system" ? [["FSM Deficiency", "system", selName]] : oneSite ? [["FSM Deficiency", "site", oneSite]] : undefined} className={cls}>{b}</ListRef>), defsIn.some((d) => s(d["severity"]) === "Critical") ? "bad" : defsIn.length ? "warn" : "good")}
            </SignalGrid>
            <Panel title={t("Devices", "الأجهزة")} actions={oneSite ? <NewDoc doctype="FSM Device" label={t("Add device", "إضافة جهاز")} defaults={{ site: oneSite, ...(sel === "system" ? { system: selName } : {}), ...(sel === "loc" ? { location: selName } : {}), lifecycle: "Active" }} /> : undefined}>
              <DataTable id="explorer-devices" rows={devicesIn} pageSize={10} empty={t("No device under this node.", "لا جهاز تحت هذه العقدة.")} cols={[
                { key: "device_label", label: t("Device", "الجهاز"), value: (r) => s(r["device_label"]), render: (r) => <DocRef doctype="FSM Device" name={r.name} title /> },
                { key: "system", label: t("System", "النظام"), value: (r) => s(r["system"]), render: (r) => <DocRef doctype="FSM Service System" name={r["system"]} title form /> },
                { key: "location", label: t("Location", "المكان"), value: (r) => s(r["location"]), render: (r) => <DocRef doctype="FSM Location Node" name={r["location"]} title form /> },
                { key: "lifecycle", label: t("Lifecycle", "دورة الحياة"), render: (r) => <StateChip value={r["lifecycle"]} /> },
              ]} />
            </Panel>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
              <Panel title={t("Visits", "الزيارات")}>
                <DataTable id="explorer-visits" searchable={false} pageSize={8} rows={visitsIn.sort((a, b) => s(b["scheduled_start"]).localeCompare(s(a["scheduled_start"]))).map((v) => ({ name: v.name, f: visitFacts(v, ix) } as { name: string; f: ReturnType<typeof visitFacts> } & Record<string, unknown>))} empty={t("No visit linked.", "لا زيارة مرتبطة.")} cols={[
                  { key: "name", label: t("Visit", "الزيارة"), render: (r) => <AppLink to={`visit/${encodeURIComponent(r.name)}`}><span data-no-i18n>{r.name}</span></AppLink> },
                  { key: "when", label: t("Scheduled", "الموعد"), render: (r) => <span data-no-i18n>{dtTxt(r.f.visit["scheduled_start"])}</span> },
                  { key: "lead", label: t("Lead", "الرئيسي"), render: (r) => <LeadTag f={r.f} fx={fx} /> },
                  { key: "arrival", label: t("Arrival", "الوصول"), render: (r) => <ArrivalTag f={r.f} fx={fx} /> },
                ]} />
              </Panel>
              <Panel title={t("Open findings", "الملاحظات المفتوحة")}>
                <DataTable id="explorer-defs" searchable={false} pageSize={8} rows={defsIn} empty={t("No open finding.", "لا ملاحظة مفتوحة.")} cols={[
                  { key: "name", label: t("Finding", "الملاحظة"), render: (r) => <DocRef doctype="FSM Deficiency" name={r.name} /> },
                  { key: "severity", label: t("Severity", "الخطورة"), render: (r) => <span className={s(r["severity"]) === "Critical" ? "font-semibold text-dx-bad" : ""}>{opt(r["severity"], ar)}</span> },
                  { key: "workflow_state", label: t("Stage", "المرحلة"), render: (r) => <StateChip value={r["workflow_state"]} /> },
                  { key: "device", label: t("Device", "الجهاز"), render: (r) => <DocRef doctype="FSM Device" name={r["device"]} title /> },
                ]} />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div> ) }]} />
    </>
  );
  return <DestinationShell dest={dest} overview={overview} band={{
    basis: t("Hierarchy from FSM Service Site.customer, FSM Location Node.parent_node, FSM Service System.location and FSM Device.system / location. Site-level selections use each record's site field; narrower selections follow systems, devices and the inspection runs on them.", "التسلسل من عميل الموقع وعقدة المكان الأم ومكان النظام ونظام/مكان الجهاز. اختيار الموقع يستخدم حقل الموقع في كل سجل؛ الاختيار الأضيق يتبع الأنظمة والأجهزة وجولات الفحص عليها."),
    meta: [{ label: t("Customers", "العملاء"), value: <span data-no-i18n>{numTxt(new Set(sites.map((x) => s(x["customer"]))).size)}</span> }, { label: t("Sites", "المواقع"), value: <span data-no-i18n>{numTxt(sites.length)}</span> }, { label: t("Devices", "الأجهزة"), value: <span data-no-i18n>{numTxt(devices.length)}</span> }],
    actions: <><AppLink to="sites" className={BAND.secondary}>{t("Sites portfolio", "محفظة المواقع")}</AppLink><NewDoc doctype="FSM Service Site" band label={t("New site", "موقع جديد")} /></>,
  }} />;
}

function DocLabel({ dt, name }: { dt: string; name: string }) {
  return <DocRef doctype={dt} name={name} title className="text-inherit" />;
}
