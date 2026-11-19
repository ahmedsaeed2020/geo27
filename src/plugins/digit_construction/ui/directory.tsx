/**
 * Module directory ("All <module>"): every navigation entry of a rail module, categorized into workspaces & tools,
 * documents (with live record counts) and reports, plus the folded groups (Reports, Settings) of module 9. The module
 * rail layout lists only frequent sections in the sidebar; this page keeps the rest one click away, so no destination
 * is lost. Reads the registered manifest navigation — never a second menu definition.
 */
import type { PluginPageProps } from "@/plugins/pages";
import { allPlugins } from "@/plugins/runtime";
import { railModules, type RailModule } from "@/plugins/appModules";
import type { PluginNavItem } from "@/plugins/types";
import { DirectoryGroups, DxState, type DirItem } from "@/components/digit/Experience";
import { APP, list } from "../domain/data";
import { CONSTRUCTION_DOCTYPES, DOCTYPE_AR } from "../schema";
import { AppLink, DocRef, ListRef, PageHeader, useCx } from "./kit";

const SINGLE = new Set(CONSTRUCTION_DOCTYPES.filter((d) => d.issingle).map((d) => d.name));
export function constructionModules(): RailModule[] {
  const app = allPlugins().find((p) => p.name === APP);
  return app ? railModules(app) : [];
}

/** Categorized directory of one module (embedded in department workspaces and the "All <module>" page). */
export function ModuleDirectory({ moduleKey }: { moduleKey: string }) {
  const { t, ar } = useCx();
  const m = constructionModules().find((x) => x.key.toLowerCase() === moduleKey.toLowerCase());
  if (!m) return <DxState kind="empty" title={t("Unknown module", "وحدة غير معروفة")} detail={<span data-no-i18n>{moduleKey}</span>} />;
  const label = (n: PluginNavItem) => (ar ? n.label_ar ?? n.label : n.label);
  const item = (n: PluginNavItem): DirItem => {
    if (n.to.startsWith("doctype:")) {
      const dt = n.to.slice(8);
      // the canonical DocType under the menu label (Arabic shows only app DocTypes that have an Arabic name)
      const meta = ar ? DOCTYPE_AR[dt] : dt;
      if (SINGLE.has(dt)) return { key: n.to, label: label(n), meta, node: (cls, inner) => <DocRef doctype={dt} name={dt} className={cls}>{inner}</DocRef> };
      return { key: n.to, label: label(n), meta, count: list(dt).length, node: (cls, inner) => <ListRef doctype={dt} className={cls}>{inner}</ListRef> };
    }
    return { key: n.to || "home", label: label(n), node: (cls, inner) => <AppLink to={n.to} className={cls}>{inner}</AppLink> };
  };
  // the module's own group splits by type; groups folded into the module (Reports, Settings) stay one panel each
  const groups = m.groups.flatMap((g, gi) => {
    if (gi > 0) return [{ key: g.key, title: ar ? g.label_ar ?? g.label : g.label, items: g.items.map(item) }];
    const pages = g.items.filter((n) => !n.to.startsWith("doctype:") && !n.to.startsWith("reports/"));
    const docs = g.items.filter((n) => n.to.startsWith("doctype:"));
    const reps = g.items.filter((n) => n.to.startsWith("reports/"));
    return [
      { key: `${g.key}-pages`, title: t("Workspaces & tools", "المساحات والأدوات"), items: pages.map(item) },
      { key: `${g.key}-docs`, title: t("Documents", "المستندات"), items: docs.map(item) },
      { key: `${g.key}-reports`, title: t("Reports", "التقارير"), items: reps.map(item) },
    ];
  });
  return <div data-module-directory={m.key}><DirectoryGroups groups={groups} /></div>;
}

export function ModuleDirectoryPage({ params }: PluginPageProps) {
  const { t, ar } = useCx();
  const key = String(params["key"] ?? "");
  const m = constructionModules().find((x) => x.key.toLowerCase() === key.toLowerCase());
  const name = m ? (ar ? m.label_ar ?? m.label : m.label) : key;
  const total = m ? m.groups.reduce((s, g) => s + g.items.length, 0) : 0;
  return (
    <div className="w-full min-w-0" data-page="construction-module-directory">
      <PageHeader title={t(`All ${name.toLowerCase()}`, `كل ${name}`)} crumbs={m?.overview && m.overview.to ? [{ label: name, to: m.overview.to }] : []}
        band={{ question: t(`Where is every ${name.toLowerCase()} workspace, document and report?`, `أين كل مساحات ومستندات وتقارير ${name}؟`),
          basis: t("Every menu entry of this module, grouped by type. Document counts are the records you can open from here.", "كل عناصر قائمة هذه الوحدة مصنفة حسب النوع. أعداد المستندات هي السجلات التي يمكنك فتحها من هنا."),
          meta: [{ label: t("Entries", "العناصر"), value: <span data-no-i18n>{total}</span> }, { label: t("Groups", "المجموعات"), value: <span data-no-i18n>{m?.groups.length ?? 0}</span> }],
          actions: m?.overview ? <AppLink to={m.overview.to} className="inline-flex min-h-9 items-center rounded-md border border-dx-on-band/30 bg-dx-on-band/10 px-3.5 text-sm font-medium text-dx-on-band hover:bg-dx-on-band/20">{t("Module overview", "نظرة عامة على الوحدة")}</AppLink> : undefined }} />
      <ModuleDirectory moduleKey={key} />
    </div>
  );
}
