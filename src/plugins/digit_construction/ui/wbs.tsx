/**
 * WBS explorer (Phase 15 E, PRJ): the project's WBS version as a tree beside the native Tasks of the selected node.
 * Read only — every count opens the records it counts; edits stay in the WBS Version, Work Package and Task forms.
 * URL state (?project=&version=&node=) keeps the view across reload, Back and deep links; phone width stacks the panes.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useRef, useState, type KeyboardEvent } from "react";
import type { Doc } from "@/lib/adapter";
import { formatRowAnchor } from "@/lib/rowAnchor";
import type { PluginPageProps } from "@/plugins/pages";
import { APP, linkTitle, projectTitle, today } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { isOverdue, visibleNodes, wbsTree, type WbsNode } from "../domain/wbs";
import { OPTION_AR } from "../schema";
import { AppLink, DataTable, DocRef, Empty, Field, Filters, inputCls, Kpi, KpiGrid, ListRef, Note, PageHeader, Progress, Section, useCx, BTN, type Col } from "./kit";
import { reportLink } from "./reports";

type R = Record<string, unknown>;

export function WbsPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const val = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const projects = constructionProjects();
  const project = val("project");
  const go = (patch: Record<string, string | undefined>) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: "wbs" }, search: Object.fromEntries(Object.entries({ project, version: val("version") || undefined, node: val("node") || undefined, ...patch }).filter(([, v]) => !!v)) as never, replace: true });
  const header = <PageHeader title={t("WBS explorer", "مستكشف هيكل تجزئة العمل")} crumbs={[{ label: t("Projects workspace", "مساحة المشاريع"), to: "dept/prj" }, ...(project ? [{ label: t("Project 360", "المشروع 360"), to: `project/${encodeURIComponent(project)}?tab=execution` }] : [])]}
    subtitle={t("Work breakdown of the project beside its native tasks. Read only: edit the WBS version, work packages and tasks in their own forms.", "تجزئة أعمال المشروع بجانب مهامه الأصلية. للعرض فقط: تُعدّل نسخة الهيكل وحزم العمل والمهام من نماذجها.")} />;

  if (!project || !projects.some((p) => p.name === project)) {
    return (
      <div className="w-full min-w-0" data-page="construction-wbs">
        {header}
        {project && <Note tone="bad"><span>{t("This project is not available here: it is not a construction project, or your role cannot read it.", "هذا المشروع غير متاح هنا: ليس مشروع مقاولات أو أن دورك لا يسمح بقراءته.")}</span> <span data-no-i18n>{project}</span></Note>}
        {projects.length
          ? <Section title={t("Select a project", "اختر مشروعاً")}><div className="flex flex-wrap gap-2" data-wbs-project-picker>{projects.map((p) => <button key={p.name} type="button" className={BTN.secondary} data-pick-project={p.name} onClick={() => go({ project: p.name, version: undefined, node: undefined })}><span data-no-i18n>{projectTitle(p, !ar)}</span></button>)}</div></Section>
          : <Empty>{t("No construction project is available to you.", "لا يوجد مشروع مقاولات متاح لك.")}</Empty>}
      </div>
    );
  }
  return <WbsBody project={project} version={val("version")} node={val("node")} go={go} header={header} />;
}

function WbsBody({ project, version, node, go, header }: { project: string; version: string; node: string; go: (p: Record<string, string | undefined>) => void; header: React.ReactNode }) {
  const { t, ar } = useCx();
  const projects = constructionProjects();
  const tree = wbsTree(project, version || undefined);
  const unknownVersion = !!version && !tree.version;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sel = node ? tree.byCode.get(node) : undefined;
  const typeLabel = (v: string) => (ar ? OPTION_AR[v] ?? v : v);
  const allTasks = [...tree.byCode.values()].reduce((s, n) => s + n.tasks.length, 0) + tree.unmappedTasks.length;
  const mapped = allTasks - tree.unmappedTasks.length;
  const rootsRoll = tree.roots.flatMap((r) => (r.roll.progress === null ? [] : [[r.roll.progress, r.roll.tasks] as const]));
  const meanProgress = rootsRoll.reduce((s, [p, n]) => s + n, 0) ? Math.round((rootsRoll.reduce((s, [p, n]) => s + p * n, 0) / rootsRoll.reduce((s, [, n]) => s + n, 0)) * 100) / 100 : null;
  const overdue = [...tree.byCode.values()].reduce((s, n) => s + n.tasks.filter((x) => isOverdue(x)).length, 0) + tree.unmappedTasks.filter((x) => isOverdue(x)).length;

  return (
    <div className="w-full min-w-0" data-page="construction-wbs" data-wbs-source={tree.source}>
      {header}
      <Filters>
        <Field label={t("Project", "المشروع")}><select className={inputCls} value={project} data-wbs-filter="project" onChange={(e) => go({ project: e.target.value, version: undefined, node: undefined })}>{projects.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></Field>
        {tree.versions.length > 0 && <Field label={t("WBS version", "نسخة الهيكل")}><select className={inputCls} value={tree.version?.name ?? ""} data-wbs-filter="version" onChange={(e) => go({ version: e.target.value, node: undefined })}>
          {unknownVersion && <option value="">{t("Select a version", "اختر نسخة")}</option>}
          {tree.versions.map((v) => <option key={v.name} value={v.name} data-no-i18n>{`v${String(v["version"] ?? "")} · ${v.name} · ${ar ? OPTION_AR[String(v["workflow_state"] ?? "")] ?? String(v["workflow_state"] ?? "") : String(v["workflow_state"] ?? "")}`}</option>)}
        </select></Field>}
      </Filters>
      {unknownVersion && <Note tone="bad">{t("This WBS version does not belong to the project or cannot be read.", "نسخة الهيكل هذه لا تخص المشروع أو لا يمكن قراءتها.")} <span data-no-i18n>{version}</span></Note>}
      {!unknownVersion && tree.source === "work_packages" && <Note tone="warn">{t("This project has no WBS version yet, so the tree is derived from its work packages.", "لا توجد نسخة هيكل لهذا المشروع بعد، لذلك الشجرة مشتقة من حزم العمل.")} <ListRef doctype="Digit WBS Version" filters={[["project", "=", project]]}>{t("WBS versions", "نسخ الهيكل")}</ListRef></Note>}
      {tree.orphans.length > 0 && <Note tone="warn">{t("Nodes whose parent code is missing are shown at the top level:", "عقد رمز العقدة الأم لها غير موجود تظهر في المستوى الأعلى:")} <span data-no-i18n>{tree.orphans.join(", ")}</span></Note>}
      {!unknownVersion && <>
        <KpiGrid>
          <Kpi label={t("Nodes", "العقد")} value={tree.byCode.size} />
          <Kpi label={t("Tasks placed on the WBS", "مهام على الهيكل")} value={mapped} list={{ doctype: "Task", filters: [["project", "=", project]] }} />
          <Kpi label={t("Unmapped tasks", "مهام غير مربوطة")} value={tree.unmappedTasks.length} tone={tree.unmappedTasks.length ? "warn" : "good"} anchor="wbs-unmapped" />
          <Kpi label={t("Overdue tasks", "مهام متأخرة")} value={overdue} tone={overdue ? "bad" : "good"} list={{ doctype: "Task", filters: [["project", "=", project], ["status", "not in", ["Completed", "Cancelled"]], ["progress", "<", 100], ["exp_end_date", "<", today()]] }} />
          <Kpi label={t("Mean task progress", "متوسط إنجاز المهام")} value={meanProgress === null ? "—" : `${meanProgress}%`} />
        </KpiGrid>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Section title={t("Work breakdown", "تجزئة العمل")} actions={tree.version ? <DocRef doctype="Digit WBS Version" name={tree.version.name} /> : undefined}>
            {tree.roots.length
              ? <Tree roots={tree.roots} collapsed={collapsed} setCollapsed={setCollapsed} selected={sel?.code} onSelect={(c) => go({ node: c })} typeLabel={typeLabel} />
              : <Empty>{t("No nodes or work packages yet", "لا توجد عقد أو حزم عمل بعد")}</Empty>}
            {tree.unmappedPackages.length > 0 && tree.source === "version" && <p className="mt-3 text-xs text-muted-foreground">{t("Work packages not referenced by this version:", "حزم عمل لا تشير إليها هذه النسخة:")} {tree.unmappedPackages.map((w) => <span key={w.name} className="me-2"><DocRef doctype="Digit Work Package" name={w.name} /></span>)}</p>}
          </Section>
          <div className="min-w-0">
            {sel ? <NodeDetail n={sel} project={project} versionName={tree.version?.name} typeLabel={typeLabel} onSelect={(c) => go({ node: c })} />
              : node ? <Note tone="warn">{t("This node is not in the selected version.", "هذه العقدة غير موجودة في النسخة المختارة.")} <span data-no-i18n>{node}</span></Note>
              : <Section title={t("Node details", "تفاصيل العقدة")}><Empty>{t("Select a node to see its tasks, work package and cost line.", "اختر عقدة لعرض مهامها وحزمة العمل وبند التكلفة.")}</Empty></Section>}
            <Section id="wbs-unmapped" title={<span>{t("Tasks not on the WBS", "مهام خارج الهيكل")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({tree.unmappedTasks.length})</span></span>}>
              <TaskTable rows={tree.unmappedTasks} empty={t("Every task of the project is placed on a node.", "كل مهام المشروع موضوعة على عقدة.")} />
            </Section>
          </div>
        </div>
      </>}
    </div>
  );
}

function Tree({ roots, collapsed, setCollapsed, selected, onSelect, typeLabel }: { roots: WbsNode[]; collapsed: Set<string>; setCollapsed: (s: Set<string>) => void; selected: string | undefined; onSelect: (code: string) => void; typeLabel: (v: string) => string }) {
  const { t, ar } = useCx();
  const ref = useRef<HTMLUListElement>(null);
  const vis = visibleNodes(roots, collapsed);
  const toggle = (c: string) => { const s = new Set(collapsed); if (s.has(c)) s.delete(c); else s.add(c); setCollapsed(s); };
  const focus = (c: string) => ref.current?.querySelector<HTMLElement>(`[data-wbs-node="${CSS.escape(c)}"]`)?.focus();
  // tree keyboard pattern: Up/Down move, Right expands (or enters), Left collapses (or goes to parent); mirrored in RTL
  const onKey = (e: KeyboardEvent, n: WbsNode) => {
    const i = vis.findIndex((x) => x.code === n.code);
    const fwd = ar ? "ArrowLeft" : "ArrowRight", back = ar ? "ArrowRight" : "ArrowLeft";
    if (e.key === "ArrowDown" && vis[i + 1]) { e.preventDefault(); focus(vis[i + 1]!.code); }
    else if (e.key === "ArrowUp" && vis[i - 1]) { e.preventDefault(); focus(vis[i - 1]!.code); }
    else if (e.key === fwd && n.children.length) { e.preventDefault(); if (collapsed.has(n.code)) toggle(n.code); else focus(n.children[0]!.code); }
    else if (e.key === back) { e.preventDefault(); if (n.children.length && !collapsed.has(n.code)) toggle(n.code); else if (n.parent && vis.some((x) => x.code === n.parent)) focus(n.parent); }
    else if (e.key === "Home" && vis[0]) { e.preventDefault(); focus(vis[0].code); }
    else if (e.key === "End" && vis.length) { e.preventDefault(); focus(vis[vis.length - 1]!.code); }
  };
  const item = (n: WbsNode): React.ReactNode => {
    const open = !collapsed.has(n.code); const isSel = selected === n.code;
    return (
      <li key={n.code} role="treeitem" aria-level={n.depth + 1} aria-expanded={n.children.length ? open : undefined} aria-selected={isSel} className="min-w-0">
        <div className={`flex min-h-10 items-center gap-1 rounded-md pe-2 ${isSel ? "bg-accent ring-1 ring-primary/40" : "hover:bg-muted"}`} style={{ paddingInlineStart: `${n.depth * 1.1 + 0.25}rem` }}>
          {n.children.length
            ? <button type="button" tabIndex={-1} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-card" aria-label={open ? t("Collapse", "طي") : t("Expand", "توسيع")} onClick={() => toggle(n.code)}><span aria-hidden className={`inline-block transition-transform ${open ? "rotate-90" : ar ? "rotate-180" : ""}`}>▸</span></button>
            : <span className="w-7 shrink-0" aria-hidden />}
          <button type="button" data-wbs-node={n.code} tabIndex={isSel || (!selected && n === vis[0]) ? 0 : -1} onClick={() => onSelect(n.code)} onKeyDown={(e) => onKey(e, n)}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            <span className="shrink-0 font-mono text-xs text-muted-foreground" data-no-i18n>{n.code}</span>
            <span className="min-w-0 flex-1 truncate font-medium" data-no-i18n>{n.title}</span>
            {n.type && <span className="hidden shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground sm:inline">{typeLabel(n.type)}</span>}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-no-i18n title={t("Tasks", "المهام")}>{n.roll.tasks}</span>
            {n.roll.progress !== null && <Progress value={n.roll.progress} tone={n.roll.overdue ? "bad" : undefined} />}
          </button>
        </div>
        {n.children.length > 0 && open && <ul role="group" className="space-y-0.5">{n.children.map(item)}</ul>}
      </li>
    );
  };
  return <ul ref={ref} role="tree" aria-label={t("Work breakdown", "تجزئة العمل")} className="space-y-0.5" data-wbs-tree>{roots.map(item)}</ul>;
}

function NodeDetail({ n, project, versionName, typeLabel, onSelect }: { n: WbsNode; project: string; versionName: string | undefined; typeLabel: (v: string) => string; onSelect: (code: string) => void }) {
  const { t } = useCx();
  const sub: Doc[] = []; const walk = (x: WbsNode) => { sub.push(...x.tasks); x.children.forEach(walk); }; walk(n);
  return (
    <Section title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground" data-no-i18n>{n.code}</span><span data-no-i18n>{n.title}</span></span>}
      actions={versionName ? <DocRef doctype="Digit WBS Version" name={versionName} row={formatRowAnchor("nodes", n.idx)}>{t("Open node in the WBS version", "فتح العقدة في نسخة الهيكل")}</DocRef> : undefined}>
      <div data-wbs-detail={n.code}>
        <dl className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">{t("Node type", "نوع العقدة")}</dt><dd>{n.type ? typeLabel(n.type) : "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("Work package", "حزمة العمل")}</dt><dd>{n.work_package ? <span className="inline-flex flex-col"><DocRef doctype="Digit Work Package" name={n.work_package} /><span className="text-xs text-muted-foreground" data-no-i18n>{linkTitle("Digit Work Package", n.work_package)}</span></span> : "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("Budget line", "بند الموازنة")}</dt><dd>{n.budget_ref ? <AppLink to={reportLink("Project Cost Report", { project })}><span data-no-i18n>{n.budget_ref}</span></AppLink> : "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("BOQ line", "بند جدول الكميات")}</dt><dd><span data-no-i18n>{n.boq_ref || "—"}</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("Progress (mean of tasks)", "الإنجاز (متوسط المهام)")}</dt><dd>{n.roll.progress === null ? "—" : <Progress value={n.roll.progress} tone={n.roll.overdue ? "bad" : undefined} />}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("Tasks · completed · overdue", "المهام · المكتملة · المتأخرة")}</dt><dd data-no-i18n>{`${n.roll.tasks} · ${n.roll.done} · ${n.roll.overdue}`}</dd></div>
        </dl>
        {n.budget_ref && <p className="mb-3 text-xs"><AppLink to={reportLink("Project Cost Sources", { project, cost_code: n.budget_ref })}>{t("Cost sources of this budget line", "مصادر تكلفة بند الموازنة هذا")}</AppLink></p>}
        {n.children.length > 0 && <div className="mb-3"><h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("Child nodes", "العقد الفرعية")}</h3>
          <ul className="flex flex-wrap gap-2" role="list">{n.children.map((c) => <li key={c.code}><button type="button" className={BTN.compact} onClick={() => onSelect(c.code)}><span className="font-mono text-xs" data-no-i18n>{c.code}</span> <span data-no-i18n>{c.title}</span></button></li>)}</ul></div>}
        <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("Native tasks under this node", "المهام الأصلية تحت هذه العقدة")}</h3>
        <TaskTable rows={sub} empty={t("No task is placed on this node.", "لا توجد مهمة على هذه العقدة.")} />
      </div>
    </Section>
  );
}

function TaskTable({ rows, empty }: { rows: Doc[]; empty: string }) {
  const { t } = useCx();
  const cols: Col<R>[] = [
    { key: "name", label: t("Task", "المهمة"), kind: "doc", doctype: "Task" },
    { key: "subject", label: t("Subject", "الموضوع"), render: (r) => <span data-no-i18n>{String(r["subject"] ?? "")}</span> },
    { key: "digit_wbs_code", label: t("WBS code", "رمز الهيكل"), render: (r) => <span className="font-mono text-xs" data-no-i18n>{String(r["digit_wbs_code"] ?? "—")}</span> },
    { key: "status", label: t("Status", "الحالة"), kind: "state" },
    { key: "exp_end_date", label: t("Expected end", "النهاية المتوقعة"), kind: "date" },
    { key: "progress", label: t("Progress", "الإنجاز"), render: (r) => <Progress value={Number(r["progress"] ?? 0)} tone={isOverdue(r as Doc) ? "bad" : undefined} /> },
  ];
  return <DataTable rows={rows as R[]} cols={cols} empty={empty} pageSize={20} />;
}

