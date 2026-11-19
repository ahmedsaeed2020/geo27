/**
 * In-app guide (owner OWN-63): the knowledge base on Help and the header "?" that opens the articles for the current
 * screen in the shared brand drawer. Articles are the "Digit Knowledge Article" records (seeded from
 * src/lib/coreShared/knowledge.ts; administrators may add more), so every app reads the same guide.
 */
import { useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { articlesFor, KNOWLEDGE, searchArticles, type Article } from "@/lib/coreShared/knowledge";
import { useLang } from "@/i18n";
import { EntDrawer } from "./Surfaces";
import { DigitIcon } from "./DigitIcon";

const s = (v: unknown) => String(v ?? "");
/** Stored articles (admin-added included) over the shipped guide; a stored row with the same id wins. */
export function knowledgeArticles(): Article[] {
  const stored = adapter.list(CORE_DT.knowledge).map((d): Article => ({ id: s(d["article_id"]) || d.name, area: s(d["area"]) || "General", route: s(d["route"]) || "/",
    title: [s(d["title_en"]), s(d["title_ar"]) || s(d["title_en"])], what: [s(d["what_en"]), s(d["what_ar"])], why: [s(d["why_en"]), s(d["why_ar"])], how: [s(d["how_en"]), s(d["how_ar"])] }));
  const ids = new Set(stored.map((a) => a.id));
  return [...stored, ...KNOWLEDGE.filter((a) => !ids.has(a.id))].sort((a, b) => a.id.localeCompare(b.id));
}

function ArticleCard({ a, ar }: { a: Article; ar: boolean }) {
  const i = ar ? 1 : 0;
  return <article className="ent-kb-card" data-kb-article={a.id}>
    <header className="flex items-start gap-2"><span className="ent-mint-chip" data-no-i18n>{a.area}</span><h3 className="ent-title text-sm" data-no-i18n>{a.title[i] || a.title[0]}</h3></header>
    <dl className="mt-2 space-y-1.5 text-sm" data-no-i18n>
      <div><dt className="ent-kb-dt">{ar ? "ما هي" : "What it is"}</dt><dd>{a.what[i] || a.what[0]}</dd></div>
      <div><dt className="ent-kb-dt">{ar ? "لماذا تهم" : "Why it matters"}</dt><dd>{a.why[i] || a.why[0]}</dd></div>
      <div><dt className="ent-kb-dt">{ar ? "أين تنقر وماذا يفتح" : "Where to click and what opens"}</dt><dd>{a.how[i] || a.how[0]}</dd></div>
    </dl>
    {a.route !== "/" && <a href={a.route} className="mt-2 inline-block text-xs font-medium text-primary hover:underline" data-kb-open={a.route}>{ar ? "افتح الشاشة ›" : "Open the screen ›"}</a>}
  </article>;
}

/** Help page section: searchable guide grouped by area. */
export function KnowledgeBase() {
  useStoreVersion();
  const ar = useLang() === "ar";
  const [q, setQ] = useState(""); const [area, setArea] = useState("");
  const all = knowledgeArticles();
  const areas = useMemo(() => [...new Set(all.map((a) => a.area))], [all]);
  const shown = searchArticles(q, all).filter((a) => !area || a.area === area);
  return <section className="ent-frame mb-4" data-knowledge-base={all.length}>
    <header className="ent-frame-h flex-col"><h2 className="ent-title text-base">{ar ? "دليل الاستخدام" : "How-to guide"}</h2>
      <p className="text-xs text-muted-foreground">{ar ? "لكل ميزة: ما هي، لماذا تهم، أين تنقر وماذا يفتح." : "For every feature: what it is, why it matters, where to click and what opens."}</p></header>
    <div className="ent-frame-b">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "ابحث في الدليل" : "Search the guide"} aria-label={ar ? "ابحث في الدليل" : "Search the guide"} className="ent-colfilter h-9 max-w-xs text-sm" data-kb-search />
        <button type="button" className="ent-kb-area" data-on={!area ? "" : undefined} onClick={() => setArea("")}>{ar ? "الكل" : "All"}</button>
        {areas.map((x) => <button key={x} type="button" className="ent-kb-area" data-on={area === x ? "" : undefined} data-kb-area={x} onClick={() => setArea(area === x ? "" : x)}><span data-no-i18n>{x}</span></button>)}
      </div>
      {shown.length ? <div className="grid gap-3 md:grid-cols-2" data-kb-results={shown.length}>{shown.map((a) => <ArticleCard key={a.id} a={a} ar={ar} />)}</div>
        : <p className="text-sm text-muted-foreground" data-kb-empty>{ar ? "لا نتائج." : "No articles match."}</p>}
    </div>
  </section>;
}

/** Header "?" — the guide for the screen on display, in the brand drawer. */
export function ScreenHelp() {
  useStoreVersion();
  const ar = useLang() === "ar";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [open, setOpen] = useState(false);
  const list = open ? articlesFor(path, knowledgeArticles()) : [];
  return <>
    <button type="button" className="dx-hdr-btn" aria-label={ar ? "دليل هذه الشاشة" : "Guide for this screen"} aria-expanded={open} onClick={() => setOpen(true)} data-screen-help><DigitIcon name="ui-info" size={20} /></button>
    <EntDrawer open={open} onOpenChange={setOpen} id="screen-help" kicker={ar ? "دليل الاستخدام" : "How-to guide"} title={ar ? "هذه الشاشة" : "This screen"} icon={<DigitIcon name="ui-info" size={18} />}
      footer={<a href="/help" className="btn-ghost" data-screen-help-all onClick={() => setOpen(false)}>{ar ? "كل الدليل" : "Full guide"}</a>}>
      <div className="space-y-3" data-screen-help-list={list.length}>{list.map((a) => <ArticleCard key={a.id} a={a} ar={ar} />)}</div>
    </EntDrawer>
  </>;
}
