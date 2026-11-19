/**
 * Shared Overview blocks (Slice C). App-agnostic presentation of the blocks an app registered for a screen in the
 * shared-experience registry (src/plugins/experience). The host app places <ExperienceBlocks app screen company /> once;
 * every figure comes from the owning app's adapter through resolveBlock (discovery, roles, source read permission), and
 * each block claims one authoritative mount (mount.ts) so it can never stack. States are explicit — loading, empty,
 * denied, error, not-ready — and never shown as a zero. Drills open the native list with the same filters the adapter
 * counted, inside the host app's context.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { DevOnly } from "@/components/DevOnly";
import { useLang } from "@/i18n";
import { useStoreVersion } from "@/lib/adapter";
import { cachedMeta, indexQuery } from "@/lib/catalog";
import { useDevMode } from "@/lib/mode";
import { useScopeMetas } from "@/lib/scope";
import { ADMIN, useSessionUser } from "@/lib/session";
import { WidgetView, type LinkFor } from "@/components/dashboards/views";
import type { Bi } from "@/lib/dashboards/views";
import type { BlockExperience } from "@/plugins/experience/contract";
import { experienceRegistry, resolveBlock, type BlockOutcome } from "@/plugins/experience/registry";
import { claimMount, mountKey, releaseMount } from "@/plugins/experience/mount";
import { pluginIndexEntries } from "@/plugins/runtime";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);

export function ExperienceBlocks({ app, screen, company }: { app: string; screen: string; company?: string | undefined }) {
  const dev = useDevMode();
  const s = experienceRegistry().apps.get(app)?.screens.find((x) => x.screenId === screen);
  const blocks = (s?.blocks ?? []).filter((b) => b.visibility === "ALWAYS" || dev);
  if (!blocks.length) return null;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2" data-experience-blocks={screen}>
      {blocks.map((b) => <ExperienceBlock key={b.semanticBlockId} app={app} screen={screen} block={b} company={company} />)}
    </div>
  );
}

function ExperienceBlock({ app, screen, block, company }: { app: string; screen: string; block: BlockExperience; company?: string | undefined }) {
  const key = mountKey(app, screen, block.semanticBlockId);
  const id = useId();
  const [owner, setOwner] = useState(true);
  useIsoLayoutEffect(() => { setOwner(claimMount(key, id)); return () => releaseMount(key, id); }, [key, id]);
  if (!owner) return <DevOnly><p className="text-xs text-muted-foreground" data-experience-duplicate={key} data-no-i18n>DUPLICATE_MOUNT {key}</p></DevOnly>;
  return <BlockBody app={app} screen={screen} block={block} company={company} mount={key} />;
}

function BlockBody({ app, screen, block, company, mount }: { app: string; screen: string; block: BlockExperience; company?: string | undefined; mount: string }) {
  const ar = useLang() === "ar";
  const user = useSessionUser();
  const version = useStoreVersion();
  const metasV = useScopeMetas([...block.permission.doctypes, ...block.reads]);
  const metasReady = user === ADMIN || [...block.permission.doctypes, ...block.reads].every((d) => !!cachedMeta(d));
  const [retry, setRetry] = useState(0);
  const out = useMemo(() => resolveBlock(app, screen, block.semanticBlockId, { company }, { metasReady, user }),
    // version / metasV / retry re-run the owning adapter when records, definitions or the user's retry change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, screen, block.semanticBlockId, company, metasReady, user, version, metasV, retry]);
  const link = useDrillLink(app);
  const titleId = `xb-${block.semanticBlockId.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm" aria-labelledby={titleId}
      data-experience-block={block.semanticBlockId} data-experience-app={app} data-experience-state={out.state} data-experience-mount={mount}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-sm font-semibold">{pick(ar, block.title)}</h2>
        {out.state === "OK" && out.total !== undefined && (
          <span className="text-xs text-muted-foreground">{ar ? "الإجمالي" : "Total"} <span className="font-semibold tabular-nums text-foreground" data-no-i18n>{out.total}</span></span>
        )}
      </header>
      <p className="mt-1 text-xs text-muted-foreground">{pick(ar, block.source.definition)}</p>
      <ScopeLine ar={ar} out={out} />
      <div className="mt-3">{body(out, block, ar, link, () => setRetry((n) => n + 1))}</div>
      <Diagnostics out={out} block={block} mount={mount} />
    </section>
  );
}

function ScopeLine({ ar, out }: { ar: boolean; out: BlockOutcome }) {
  if (out.state !== "OK" && out.state !== "EMPTY") return null;
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" data-experience-scope>
      <span>{out.company ? <>{ar ? "الشركة:" : "Company:"} <span data-no-i18n>{out.company}</span></> : ar ? "كل الشركات المتاحة لك" : "All companies you can access"}</span>
      <span>{ar ? "حتى تاريخ" : "As of"} <span className="tabular-nums" data-no-i18n>{out.asOf}</span></span>
      {out.limited && <span className="font-medium text-foreground" data-experience-limited>{ar ? "مقصور على السجلات التي يمكنك رؤيتها" : "Limited to records you can see"}</span>}
    </p>
  );
}

function body(out: BlockOutcome, block: BlockExperience, ar: boolean, link: LinkFor, retry: () => void): ReactNode {
  switch (out.state) {
    case "LOADING":
      return <div className="space-y-2" role="status" aria-label={ar ? "جارٍ التحميل" : "Loading"}><div className="h-4 w-full animate-pulse rounded bg-muted" /><div className="h-3 w-2/3 animate-pulse rounded bg-muted" /></div>;
    case "OK":
    case "PARTIAL":
    case "TRUE_ZERO":
      return out.data ? <WidgetView data={localized(out, ar)} view="status" ar={ar} link={link} /> : <Note text={ar ? "لا توجد بيانات." : "No data."} />;
    case "EMPTY":
    case "NO_HISTORY":
      return <Note text={pick(ar, out.reason ?? block.states.empty)} />;
    case "DENIED":
      return <Note text={pick(ar, out.reason ?? block.states.denied)} tone="denied" />;
    case "NOT_CONFIGURED":
      return <Note text={out.reason ? pick(ar, out.reason) : ar ? "لم يُضبط هذا المصدر بعد." : "This source is not configured yet."} />;
    case "ERROR":
      return (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <span className="text-sm text-destructive">{ar ? "تعذّر حساب هذه النظرة العامة." : "This overview could not be computed."}</span>
          <button type="button" onClick={retry} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">{ar ? "إعادة المحاولة" : "Retry"}</button>
        </div>
      );
    case "CONTRACT_NOT_READY":
    default:
      return <Note text={ar ? "هذه النظرة العامة غير متاحة في هذا النظام بعد." : "This overview is not available in this system yet."} />;
  }
}

/** Apply the owning app's labels (display only); a labelled point is marked as data so the DOM translator leaves it alone. */
function localized(out: BlockOutcome, ar: boolean): NonNullable<BlockOutcome["data"]> {
  const d = out.data!;
  if (d.kind !== "series" || !out.labels) return d;
  return { ...d, points: d.points.map((p) => (out.labels![p.key] ? { ...p, label: pick(ar, out.labels![p.key]!), data: true } : p)) };
}

function Note({ text, tone }: { text: string; tone?: "denied" }) {
  return <p className={`text-sm ${tone === "denied" ? "text-foreground" : "text-muted-foreground"}`} data-experience-note={tone ?? "info"}>{text}</p>;
}

function Diagnostics({ out, block, mount }: { out: BlockOutcome; block: BlockExperience; mount: string }) {
  return (
    <DevOnly>
    <details className="mt-3 text-xs text-muted-foreground" data-experience-diagnostics data-no-i18n>
      <summary className="cursor-pointer">Contract · {out.state}</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>block</dt><dd>{block.semanticBlockId}</dd>
        <dt>owner</dt><dd>{block.ownerApiOrAdapterId}</dd>
        <dt>source</dt><dd>{block.source.kind} {block.source.name}</dd>
        <dt>permission</dt><dd>{block.permission.doctypes.join(", ")} · {block.permission.roles.length} roles</dd>
        <dt>mount</dt><dd>{mount}</dd>
        {out.diagnostics.map((d, i) => <Fragment key={i}><dt>note</dt><dd>{d}</dd></Fragment>)}
      </dl>
    </details>
    </DevOnly>
  );
}

/** Drill `{ doctype, filters }` → the native list (permission-checked by the list itself), host app context kept. */
function useDrillLink(app: string): LinkFor {
  const idx = useQuery(indexQuery);
  return (drill, children, attrs = {}) => {
    const d = drill as { doctype?: string; filters?: unknown[] } | undefined;
    if (!d?.doctype) return children;
    const route = pluginIndexEntries().find((e) => e.name === d.doctype) ?? idx.data?.find((e) => e.name === d.doctype);
    if (!route) return children;
    const { className, ...rest } = attrs;
    const search = { app, ...(d.filters?.length ? { filters: JSON.stringify(d.filters) } : {}) };
    return <Link to="/app/$app/$doctype" params={{ app: route.app, doctype: route.slug }} search={search as never} className={className ?? "hover:underline"} {...rest} data-experience-drill={d.doctype}>{children}</Link>;
  };
}
