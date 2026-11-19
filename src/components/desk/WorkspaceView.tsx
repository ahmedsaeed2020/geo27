import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { OnboardingBlock } from "@/components/desk/OnboardingBlock";
import { DESK_PAGES } from "@/components/pages/registry";
import { ChartWidget, NumberCardWidget } from "@/components/desk/Widgets";
import { reportsQuery, type IndexEntry } from "@/lib/catalog";
import { chartsQuery, numberCardsQuery, type WorkspaceFull } from "@/lib/desk";

const strip = (h: unknown) => String(h ?? "").replace(/<[^>]+>/g, "").trim();

/** Renders workspace `content` blocks in source order (frappe/public/js/frappe/views/workspace/blocks). */
export function WorkspaceView({ w, dt }: { w: WorkspaceFull; dt: (n?: string) => IndexEntry | undefined }) {
  const cards = useQuery(numberCardsQuery);
  const charts = useQuery(chartsQuery);
  const reps = useQuery(reportsQuery);
  const cardGroups: Record<string, WorkspaceFull["links"]> = {};
  let cur = "";
  w.links.forEach((l) => { if (l.type === "Card Break") { cur = l.label; cardGroups[cur] = []; } else (cardGroups[cur] ??= []).push(l); });
  const linkTo = (l: { link_type?: string | undefined; link_to?: string | undefined; label: string; type?: string | undefined }, k: number) => {
    const e = l.link_type === "DocType" || l.type === "DocType" ? dt(l.link_to) : undefined;
    if (e) return <Link key={k} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className="block py-0.5 text-sm text-primary hover:underline">{l.label}</Link>;
    if ((l.link_type === "Page" || l.type === "Page") && l.link_to && DESK_PAGES[l.link_to]) return <Link key={k} to="/page/$name" params={{ name: l.link_to }} className="block py-0.5 text-sm text-primary hover:underline">{l.label}</Link>;
    if ((l.link_type === "Report" || l.type === "Report") && reps.data?.some((r) => r.name === l.link_to)) return <Link key={k} to="/report/$name" params={{ name: l.link_to! }} className="block py-0.5 text-sm text-primary hover:underline">{l.label}</Link>;
    if ((l.link_type === "Dashboard" || l.type === "Dashboard") && l.link_to) return <Link key={k} to="/dashboard/$name" params={{ name: l.link_to }} className="block py-0.5 text-sm text-primary hover:underline">{l.label}</Link>;
    return <div key={k} className="py-0.5 text-sm text-muted-foreground" title="Page/URL target not reconstructed">{l.label} <span className="text-[10px]">{(l.link_type ?? l.type ?? "").toLowerCase()}</span></div>;
  };
  return (
    <div className="grid grid-cols-12 gap-4">
      {w.content.map((b) => {
        const col = Math.min(12, Number(b.data["col"] ?? 12));
        // phones stack blocks (number cards two per row); larger screens use the source column width
        const span = { "--ws-col": col, "--ws-col-sm": b.type === "number_card" ? 6 : 12 } as CSSProperties;
        switch (b.type) {
          case "header": return <h2 key={b.id} style={span} className="ws-block mt-2 text-lg font-semibold">{strip(b.data["text"])}</h2>;
          case "spacer": return <div key={b.id} style={span} className="ws-block" />;
          case "paragraph": return <p key={b.id} style={span} className="ws-block text-sm text-muted-foreground">{strip(b.data["text"])}</p>;
          case "number_card": { const n = String(b.data["number_card_name"]); return <div key={b.id} style={span} className="ws-block min-w-0"><NumberCardWidget card={cards.data?.[n]} label={w.number_cards.find((c) => c.number_card_name === n)?.label ?? n} /></div>; }
          case "chart": { const n = String(b.data["chart_name"]); return <div key={b.id} style={span} className="ws-block min-w-0"><ChartWidget chart={charts.data?.[n]} label={w.charts.find((c) => c.chart_name === n)?.label ?? n} /></div>; }
          case "shortcut": {
            const s = w.shortcuts.find((x) => x.label === b.data["shortcut_name"]);
            return <div key={b.id} style={span} className="ws-block panel px-3 py-2">{s ? linkTo({ ...s, link_type: s.type }, 0) : <span className="text-xs text-muted-foreground">{String(b.data["shortcut_name"])}</span>}</div>;
          }
          case "card": {
            const n = String(b.data["card_name"]);
            return <div key={b.id} style={span} className="ws-block panel p-4"><h3 className="mb-2 text-sm font-semibold">{n}</h3>{(cardGroups[n] ?? []).filter((l) => !l.hidden).map(linkTo)}</div>;
          }
          case "onboarding": return <div key={b.id} style={span} className="ws-block min-w-0"><OnboardingBlock name={String(b.data["onboarding_name"])} /></div>;
          case "quick_list": return <div key={b.id} style={span} className="ws-block panel p-3 text-xs text-muted-foreground">Quick list: {String(b.data["quick_list_name"] ?? "")}</div>;
          default: return <div key={b.id} style={span} className="ws-block text-xs text-muted-foreground">[{b.type} block — pending]</div>;
        }
      })}
      {!w.content.length && Object.entries(cardGroups).map(([n, ls]) => <div key={n} className="panel col-span-4 p-4"><h3 className="mb-2 text-sm font-semibold">{n}</h3>{ls.map(linkTo)}</div>)}
    </div>
  );
}
