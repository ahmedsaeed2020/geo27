import { createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { Loading, Shell } from "@/components/Shell";
import { useLang } from "@/i18n";
import { useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { useScopeMetas } from "@/lib/scope";
import { ADMIN, useSessionUser } from "@/lib/session";
import { usePluginsVersion } from "@/plugins/runtime";
import { EXPERIENCE_CONTRACT_VERSION } from "@/plugins/experience/contract";
import { ENTERPRISE_ARCHIVE, HOST_APP_CONTRACTS, HOST_APP_IDS, HOST_UI_SOURCES } from "@/plugins/experience/hostApps";
import { accessLabel, experienceRegistry, featureCoverage, resolveBlock } from "@/plugins/experience/registry";
import { duplicateMounts } from "@/plugins/experience/mount";
import { useScreenReceipts } from "@/plugins/experience/screenHost";
import { ENTERPRISE_PATCH_SOURCE, LEGACY_PATCHES } from "@/plugins/experience/legacyPatches";

export const Route = createFileRoute("/developer/experience")({
  head: () => ({ meta: [
    { title: "App experience registry — Developer Mode" },
    { name: "description", content: "Traceability of every DIGIT app's registered screens, shared blocks, owning adapters, permissions and runtime state." },
    { property: "og:title", content: "App experience registry — Developer Mode" },
    { property: "og:description", content: "Source → route → block → adapter → permission → runtime state for every DIGIT app." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ExperienceTrace,
});

const T = (ar: boolean, en: string, a: string) => (ar ? a : en);

/** App access, enabled plugins and the session user are browser state: render the trace only after hydration. */
function ExperienceTrace() {
  const hydrated = useHydrated();
  return hydrated ? <TraceBody /> : <Shell crumbs={[{ label: "Developer Mode" }]}><Loading what="app experience registry" /></Shell>;
}

function TraceBody() {
  const ar = useLang() === "ar";
  const user = useSessionUser(); const version = useStoreVersion(); const plugins = usePluginsVersion();
  const nav = useNavigate();
  const reg = experienceRegistry();
  const blocks = useMemo(() => [...reg.apps.values()].flatMap((a) => a.screens.flatMap((s) => s.blocks.map((b) => ({ app: a, screen: s, block: b })))), [reg]);
  const metasV = useScopeMetas(blocks.flatMap((x) => [...x.block.permission.doctypes, ...x.block.reads]));
  const resolved = useMemo(() => blocks.map((x) => {
    const need = [...x.block.permission.doctypes, ...x.block.reads];
    return { ...x, out: resolveBlock(x.app.appId, x.screen.screenId, x.block.semanticBlockId, {}, { metasReady: user === ADMIN || need.every((d) => !!cachedMeta(d)), user }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [blocks, user, version, metasV, plugins]);
  const coverage = useMemo(() => [...reg.apps.values()].filter((a) => a.registers.length).map(featureCoverage), [reg]);
  const adoptions = reg.adoptions;
  const dupes = Object.entries(duplicateMounts());
  const receipts = useScreenReceipts();
  const open = (to: string) => void nav({ href: to });
  return (
    <Shell crumbs={[{ label: T(ar, "Developer Mode", "وضع المطوّر") }, { label: T(ar, "App experience registry", "سجل تجربة التطبيقات") }]}>
      <div data-page="developer-experience">
        <h1 className="text-xl font-semibold text-dev">{T(ar, "App experience registry", "سجل تجربة التطبيقات")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {T(ar, "Contract version", "إصدار العقد")} <span data-no-i18n>v{EXPERIENCE_CONTRACT_VERSION}</span> ·{" "}
          {T(ar, "State for the current user", "الحالة للمستخدم الحالي")} <span data-no-i18n>{user}</span> ·{" "}
          {T(ar, "DIGIT host mirror", "مرآة مضيف DIGIT")} <span className="font-mono text-xs" data-no-i18n>{ENTERPRISE_ARCHIVE.file} {ENTERPRISE_ARCHIVE.sha256.slice(0, 16)}…</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{T(ar, "Preview evidence only: DIGIT server methods listed here are labels and are not called in this preview.", "دليل معاينة فقط: دوال خادم DIGIT المذكورة هنا تسميات ولا تُستدعى في هذه المعاينة.")}</p>

        <Panel title={T(ar, "Apps", "التطبيقات")}>
          <Table head={[T(ar, "App", "التطبيق"), T(ar, "Runtime", "التشغيل"), T(ar, "Access", "الوصول"), T(ar, "Screens", "الشاشات"), T(ar, "Blocks", "الكتل"), T(ar, "Registers", "السجلات"), T(ar, "Shared patterns", "الأنماط المشتركة")]}>
            {[...reg.apps.values()].map((a) => (
              <tr key={a.appId} className="border-t border-border align-top" data-experience-app-row={a.appId}>
                <td className="px-2 py-1" data-no-i18n><div className="font-medium">{a.appId}</div><div className="text-[11px] text-muted-foreground">{a.sourceVersion}</div></td>
                <td className="px-2 py-1" data-no-i18n>{a.runtime}</td>
                <td className="px-2 py-1" data-no-i18n><State s={accessLabel(a.appId, user)} /></td>
                <td className="px-2 py-1 tabular-nums" data-no-i18n>{a.screens.length}</td>
                <td className="px-2 py-1 tabular-nums" data-no-i18n>{a.screens.reduce((n, s) => n + s.blocks.length, 0)}</td>
                <td className="px-2 py-1 text-[11px]" data-no-i18n>{a.registers.length ? featureCoverage(a).registers.map((r) => (
                  <div key={r.id} data-experience-register={r.id}>{r.id}: {r.listed ? <span className={r.unlinked.length ? "text-warning-text" : "text-success-text"}>{r.linked}/{r.count}</span> : <>{r.count} <span className="text-muted-foreground">COUNT_ONLY</span></>} <span className="text-muted-foreground">({r.evidence})</span></div>
                )) : "NOT_INSPECTED"}</td>
                <td className="px-2 py-1 text-[11px]" data-no-i18n>{a.supportedSharedPatterns.join(", ")}</td>
              </tr>
            ))}
            <tr className="border-t border-border"><td className="px-2 py-1" data-no-i18n>digit_itm</td><td className="px-2 py-1" data-no-i18n>—</td><td className="px-2 py-1" data-no-i18n><State s={accessLabel("digit_itm", user)} /></td><td colSpan={4} className="px-2 py-1 text-[11px] text-muted-foreground">{T(ar, "ITM screens ship inside DIGIT FSM + ITM.", "شاشات إدارة تقنية المعلومات ضمن تطبيق الخدمة الميدانية.")}</td></tr>
          </Table>
          {reg.rejected.length > 0 && (
            <div className="mt-3 rounded-md border border-destructive/40 p-2 text-xs" data-experience-rejected data-no-i18n>
              {reg.rejected.map((r, i) => <div key={i}><b>{r.appId}</b>: {r.errors.join(" · ")}</div>)}
            </div>
          )}
        </Panel>

        <Panel title={T(ar, "Feature register coverage: source ids → registered screens", "تغطية سجلات الميزات: معرّفات المصدر ← الشاشات المسجّلة")}>
          <p className="mb-2 text-xs text-muted-foreground">{T(ar, "Which register ids at least one registered screen links. Linking traces source to a screen; it does not prove the feature works on a DIGIT server.", "معرّفات السجل التي تربطها شاشة مسجّلة واحدة على الأقل. الربط يتتبع المصدر إلى شاشة ولا يثبت عمل الميزة على خادم DIGIT.")}</p>
          <Table head={[T(ar, "App", "التطبيق"), T(ar, "Register", "السجل"), T(ar, "Linked", "المرتبط"), T(ar, "Not linked", "غير المرتبط"), T(ar, "Source required", "يتطلب مصدراً"), T(ar, "Evidence status", "حالة الدليل"), T(ar, "Unknown screen ids", "معرّفات شاشات غير معروفة")]}>
            {coverage.flatMap((c) => c.registers.map((r, i) => (
              <tr key={`${c.appId}.${r.id}`} className="border-t border-border align-top" data-no-i18n data-experience-coverage={`${c.appId}.${r.id}`} data-linked={r.linked} data-count={r.count} data-blocked={r.blocked.length}>
                <td className="px-2 py-1">{i === 0 ? c.appId : ""}</td>
                <td className="px-2 py-1">{r.id}<div className="text-[11px] text-muted-foreground">{r.evidence}</div></td>
                <td className="px-2 py-1 tabular-nums">{r.listed ? `${r.linked}/${r.count}` : <span className="text-muted-foreground">COUNT_ONLY{i === 0 && c.registers.every((x) => !x.listed) ? <> · {T(ar, `screens link ${c.linkedFeatureIds} ids`, `الشاشات تربط ${c.linkedFeatureIds} معرّفاً`)}</> : null}</span>}</td>
                <td className="px-2 py-1 text-[11px]">{r.listed ? (r.unlinked.length ? <IdList ids={r.unlinked} /> : <span className="text-success-text">0</span>) : "—"}</td>
                <td className="px-2 py-1 text-[11px]">{r.blocked.length ? r.blocked.map((id) => <div key={id} data-experience-blocked={id}><span className="font-mono font-semibold text-warning-text">{id}</span> <span className="text-muted-foreground">UNMATCHED_SOURCE_REQUIRED — {r.reasons[id]}</span></div>) : "0"}</td>
                <td className="px-2 py-1 text-[11px]">{Object.keys(r.byStatus).length ? Object.entries(r.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => <div key={s} data-experience-status={s}><State s={s} /> <span className="tabular-nums">{n}</span></div>) : "—"}</td>
                <td className="px-2 py-1 text-[11px]">{i === 0 ? (c.unknown.length ? <IdList ids={c.unknown} /> : "0") : ""}</td>
              </tr>
            )))}
          </Table>
        </Panel>

        <Panel title={T(ar, "Shared blocks: source → route → adapter → permission → state", "الكتل المشتركة: المصدر ← المسار ← المحوّل ← الصلاحية ← الحالة")}>
          <Table head={[T(ar, "Block", "الكتلة"), T(ar, "Screen / route", "الشاشة / المسار"), T(ar, "Owner", "المالك"), T(ar, "Source", "المصدر"), T(ar, "Permission", "الصلاحية"), T(ar, "State", "الحالة")]}>
            {resolved.map(({ app, screen, block, out }) => (
              <tr key={block.semanticBlockId} className="border-t border-border align-top" data-experience-trace={block.semanticBlockId}>
                <td className="px-2 py-1" data-no-i18n><div>{block.semanticBlockId}</div><div className="text-[11px] text-muted-foreground">{block.componentKind}/{block.presentationVariant} · {block.visibility}</div></td>
                <td className="px-2 py-1" data-no-i18n><div>{screen.screenId}</div><button type="button" dir="ltr" className="text-[11px] text-primary hover:underline" onClick={() => open(screen.route)}>{screen.route}</button></td>
                <td className="px-2 py-1" data-no-i18n>{block.ownerApiOrAdapterId}<div className="text-[11px] text-muted-foreground">{app.appId}</div></td>
                <td className="px-2 py-1 text-[11px]" data-no-i18n>{block.source.kind} {block.source.name}</td>
                <td className="px-2 py-1 text-[11px]" data-no-i18n>{block.permission.doctypes.join(", ")}<div className="text-muted-foreground">{block.permission.roles.length ? block.permission.roles.slice(0, 4).join(", ") + (block.permission.roles.length > 4 ? ` +${block.permission.roles.length - 4}` : "") : "—"}</div></td>
                <td className="px-2 py-1" data-no-i18n><State s={out.state} />{out.diagnostics.map((d) => <div key={d} className="text-[11px] text-muted-foreground">{d}</div>)}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title={T(ar, "Adoption decisions", "قرارات الاعتماد")}>
          <Table head={[T(ar, "Pattern", "النمط"), T(ar, "From", "من"), T(ar, "To", "إلى"), T(ar, "Decision", "القرار"), T(ar, "Owner approval", "موافقة المالك"), T(ar, "State", "الحالة"), T(ar, "Evidence", "الدليل")]}>
            {adoptions.map((x, i) => (
              <tr key={i} className="border-t border-border align-top" data-no-i18n>
                <td className="px-2 py-1">{x.sharedPatternId}</td><td className="px-2 py-1">{x.sourceApp}</td><td className="px-2 py-1">{x.targetApp}</td>
                <td className="px-2 py-1">{x.decision}</td><td className="px-2 py-1">{x.ownerApproval}</td><td className="px-2 py-1"><State s={x.implementationState} /></td>
                <td className="px-2 py-1 text-[11px] text-muted-foreground">{x.evidence}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title={T(ar, "DIGIT host contracts (archive mirror, not called here)", "عقود مضيف DIGIT (مرآة الأرشيف، لا تُستدعى هنا)")}>
          <Table head={[T(ar, "App", "التطبيق"), T(ar, "Capability → server method", "القدرة ← دالة الخادم"), T(ar, "Host UI sources", "مصادر واجهة المضيف")]}>
            {HOST_APP_IDS.map((id) => (
              <tr key={id} className="border-t border-border align-top" data-no-i18n>
                <td className="px-2 py-1">{id}</td>
                <td className="px-2 py-1 text-[11px]">{Object.entries(HOST_APP_CONTRACTS[id]).map(([k, v]) => <div key={k}>{k} → {v ?? <span className="text-muted-foreground">BACKEND_CONTRACT_MISSING</span>}</div>)}</td>
                <td className="px-2 py-1 text-[11px] text-muted-foreground">{(HOST_UI_SOURCES[id] ?? []).join(", ") || "—"}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title={T(ar, "Screens per app", "الشاشات لكل تطبيق")}>
          {[...reg.apps.values()].filter((a) => a.screens.length).map((a) => (
            <details key={a.appId} className="border-t border-border py-1">
              <summary className="cursor-pointer text-sm" data-no-i18n>{a.appId} · {a.screens.length}</summary>
              <Table head={[T(ar, "Screen", "الشاشة"), T(ar, "Kind", "النوع"), T(ar, "Route", "المسار"), T(ar, "Tabs", "التبويبات"), T(ar, "Feature ids", "معرّفات الميزات"), T(ar, "Renderer", "العارض")]}>
                {a.screens.map((s) => (
                  <tr key={s.screenId} className="border-t border-border align-top" data-no-i18n data-experience-screen={s.screenId} data-screen-kind={s.kind ?? "WORKSPACE"}>
                    <td className="px-2 py-1">{s.screenId}</td>
                    <td className="px-2 py-1 font-mono text-[11px]">{s.kind ?? "WORKSPACE"}</td>
                    <td className="px-2 py-1" dir="ltr">{s.route.includes("$") ? s.route : <button type="button" className="text-primary hover:underline" onClick={() => open(s.route)}>{s.route}</button>}</td>
                    <td className="px-2 py-1 text-[11px]">{s.approvedTabs.length ? `${s.approvedTabs.length}: ${s.approvedTabs.join(" · ")}` : "—"}</td>
                    <td className="px-2 py-1 text-[11px]">{s.featureIds.length ? <><span className="tabular-nums">{s.featureIds.length}</span> <IdList ids={s.featureIds} /></> : "—"}</td>
                    <td className="px-2 py-1 text-[11px] text-muted-foreground">{s.rendererOwner}</td>
                  </tr>
                ))}
              </Table>
            </details>
          ))}
        </Panel>

        <Panel title={T(ar, "Screen hosts seen this session: route → registered screen → shared Shell host", "مضيفات الشاشات في هذه الجلسة: المسار ← الشاشة المسجّلة ← مضيف الهيكل المشترك")}>
          <p className="mb-2 text-xs text-muted-foreground">{T(ar, "Recorded by the shared Shell's content host after each page renders. More than one host on a page means a nested Shell.", "يسجّلها مضيف المحتوى في الهيكل المشترك بعد عرض كل صفحة. أكثر من مضيف في الصفحة يعني هيكلاً متداخلاً.")}</p>
          {receipts.length ? <Table head={[T(ar, "Path", "المسار"), T(ar, "State", "الحالة"), T(ar, "Screen", "الشاشة"), T(ar, "Kind", "النوع"), T(ar, "Hosts", "المضيفات")]}>
            {[...receipts].reverse().map((x) => (
              <tr key={x.path} className="border-t border-border align-top" data-no-i18n data-screen-receipt={x.path}>
                <td className="px-2 py-1 font-mono text-[11px]" dir="ltr">{x.path}</td>
                <td className="px-2 py-1"><State s={x.state} /></td>
                <td className="px-2 py-1 text-[11px]">{x.screenId ?? (x.conflict ? x.conflict.join(" · ") : "—")}<div className="text-muted-foreground">{x.appId ?? ""}</div></td>
                <td className="px-2 py-1 font-mono text-[11px]">{x.kind ?? "—"}</td>
                <td className="px-2 py-1 tabular-nums"><span className={x.hosts === 1 ? "text-success-text" : "text-destructive"}>{x.hosts}</span></td>
              </tr>
            ))}
          </Table> : <p className="text-sm text-muted-foreground">{T(ar, "Open app pages in this tab; each page's host is recorded here.", "افتح صفحات التطبيقات في هذا التبويب؛ يُسجَّل مضيف كل صفحة هنا.")}</p>}
        </Panel>

        <Panel title={T(ar, "Enterprise host patches → source ownership", "ترقيعات مضيف Enterprise ← ملكية المصدر")}>
          <p className="mb-2 text-xs text-muted-foreground" data-no-i18n>{ENTERPRISE_PATCH_SOURCE}</p>
          <Table head={[T(ar, "Patch", "الترقيع"), T(ar, "Behaviour", "السلوك"), T(ar, "Status", "الحالة"), T(ar, "Owner / replacement", "المالك / البديل"), T(ar, "Evidence", "الدليل"), T(ar, "Retire in host", "الإيقاف في المضيف")]}>
            {LEGACY_PATCHES.map((p) => (
              <tr key={p.id} className="border-t border-border align-top" data-no-i18n data-legacy-patch={p.id} data-legacy-status={p.status}>
                <td className="px-2 py-1 text-[11px]"><div className="font-medium">{p.id}</div><div className="text-muted-foreground">{p.script} · {p.functions}</div><div className="font-mono text-muted-foreground">{p.selector}</div></td>
                <td className="px-2 py-1 text-[11px]">{p.behaviour}</td>
                <td className="px-2 py-1"><State s={p.status} /></td>
                <td className="px-2 py-1 text-[11px]">{p.owner}{p.replacement && <div className="text-muted-foreground">{p.replacement}</div>}{p.test && <div className="text-muted-foreground">{p.test}</div>}</td>
                <td className="px-2 py-1 text-[11px] text-muted-foreground">{p.evidence}{p.rollback && <div>↩ {p.rollback}</div>}</td>
                <td className="px-2 py-1 text-[11px] text-muted-foreground">{p.retire}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title={T(ar, "Duplicate mounts seen this session", "تكرارات التركيب في هذه الجلسة")}>
          {dupes.length ? <ul className="text-xs" data-no-i18n>{dupes.map(([k, n]) => <li key={k}>{k}: {n}</li>)}</ul> : <p className="text-sm text-muted-foreground" data-experience-dupes="0">{T(ar, "None.", "لا يوجد.")}</p>}
        </Panel>
      </div>
    </Shell>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel mt-4 overflow-x-auto p-3"><h2 className="mb-2 text-sm font-semibold">{title}</h2>{children}</section>;
}
function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return <table className="w-full text-xs"><thead className="bg-muted text-start"><tr>{head.map((h) => <th key={h} className="px-2 py-1 text-start font-medium">{h}</th>)}</tr></thead><tbody>{children}</tbody></table>;
}
/** Feature ids, first 12 inline and the rest behind a disclosure, so long registers stay readable. */
function IdList({ ids }: { ids: string[] }) {
  const head = ids.slice(0, 12), rest = ids.slice(12);
  return (
    <span className="font-mono text-muted-foreground" dir="ltr">
      {head.join(" · ")}
      {rest.length > 0 && <details className="inline"><summary className="inline cursor-pointer text-primary"> +{rest.length}</summary>{" "}{rest.join(" · ")}</details>}
    </span>
  );
}
function State({ s }: { s: string }) {
  const tone = /^(OK|VERIFIED|VISIBLE_VERIFIED|REGISTERED|SOURCE_OWNED|MIGRATED)/.test(s) ? "text-success-text" : /DENIED|ERROR|INCOMPATIBLE|BLOCKED|CONFLICT|PROVEN_MISSING|HIDDEN_AFTER_LOAD/.test(s) ? "text-destructive" : /UNMATCHED|POLICY_REQUIRED/.test(s) ? "text-warning-text" : "text-muted-foreground";
  return <span className={`font-mono text-[11px] font-semibold ${tone}`}>{s}</span>;
}
