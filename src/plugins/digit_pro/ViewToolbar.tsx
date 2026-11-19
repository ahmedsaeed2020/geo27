/**
 * RXP-01 shared Saved Views + Columns + active filter chips toolbar for DIGIT Pro registers.
 * The URL holds the effective state; this toolbar only reads/writes personal view definitions (savedViews.ts).
 * Export/Print are permission-gated on the register's source DocType and export only the visible columns/rows.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Bookmark, ChevronDown, Columns3, Download, Printer, Rows3, RotateCcw, SlidersHorizontal, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLang } from "@/i18n";
import { useSessionUser, userRoles } from "@/lib/session";
import { can, toCsv } from "./finance";
import {
  DRILL, NATIVE, ViewError, activeFilters, columnsOf, initialColumns, createView, deleteView, duplicateView, isDirty, listViews, renameView,
  resolveEntry, sanitizeView, searchFromState, setDefault, sortOf, stateFromSearch, updateView, useViewsVersion,
  type Search, type ViewScope, type ViewSort, type ViewSpec,
} from "./savedViews";

type Apply = (next: Search) => void;
const useT = () => { const ar = useLang() === "ar"; return { ar, t: (en: string, arabic: string) => (ar ? arabic : en) }; };

/** Register export: built lazily on click from the rows and columns currently on screen (never a wider dataset). */
export interface RegisterExport { doctype: string; filename: string; build: () => { columns: { fieldname: string; label: string }[]; rows: Record<string, unknown>[] } }

/** UTF-8 CSV with BOM (Arabic opens correctly in spreadsheet tools). Returns false when the caller may not export. */
export function downloadRegister(x: RegisterExport, user?: string): boolean {
  if (!can(x.doctype, "export", undefined, user)) return false;
  const { columns, rows } = x.build();
  const url = URL.createObjectURL(new Blob(["\uFEFF" + toCsv(columns, rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `${x.filename}.csv`; a.click(); URL.revokeObjectURL(url);
  return true;
}

/** Visible ordered columns + sort + density for a register driven by the URL. */
export function useRegister(spec: ViewSpec, search: Search) {
  const cols = columnsOf(search["cols"], spec);
  const sort = sortOf(search["sort"], spec);
  const compact = search["density"] === "compact";
  return { cols, sort, compact, cell: compact ? "px-2 py-1" : "px-2 py-2", show: (k: string) => cols.includes(k) };
}

export function ViewToolbar({ spec, search, companies, onApply, exporter, children }: { spec: ViewSpec; search: Search; companies: string[]; onApply: Apply; exporter?: RegisterExport | undefined; children?: ReactNode }) {
  const { t, ar } = useT();
  const user = useSessionUser();
  useViewsVersion();
  const entry = resolveEntry(spec, search, companies, user);
  const views = listViews(spec.id, user);
  const current = entry.kind === "view" || entry.kind === "default" ? entry.view : undefined;
  const dirty = isDirty(spec, search, current, companies);
  const isOwn = !current || current.owner === user;
  const shareRoles = userRoles(user).filter((r) => !["All", "Guest", "Desk User", "Administrator"].includes(r)).sort();
  const [dialog, setDialog] = useState<null | "saveas" | "rename">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState("");
  const [share, setShare] = useState("personal");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsId = useId();
  const applied = useRef<string>("");
  /** Dialogs are opened from buttons/menu items (not Radix triggers), so focus is returned to the opener explicitly on close. */
  const opener = useRef<HTMLElement | null>(null);
  const remember = () => { opener.current = (document.activeElement as HTMLElement | null) ?? null; };
  const restoreFocus = (e: Event) => { e.preventDefault(); const el = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>(`[data-dp-viewbar="${spec.id}"] [data-dp-view-saveas]`); el?.focus(); };
  const fixedColumns = spec.columns.length === 0;
  const canExport = !!exporter && can(exporter.doctype, "export", undefined, user);
  const canPrint = !!exporter && can(exporter.doctype, "print", undefined, user);

  // A view definition is written into the URL once per view and mount: personal default on a plain visit, or a bare `?view=<id>`.
  // Once a view is on screen, clearing its filters by hand is respected (never silently re-applied).
  useEffect(() => {
    const id = entry.view?.id ?? "";
    if (entry.redirect && applied.current !== id) { applied.current = id; onApply(entry.redirect); }
    else if (entry.kind === "view" && !entry.redirect) applied.current = id;
  }, [entry.redirect, entry.kind, entry.view?.id, onApply]);

  const keepCompany = (): Search => { const c = spec.filters.find((f) => f.company); return c && search[c.key] ? { [c.key]: search[c.key] } : {}; };
  const choose = (id: string) => {
    setStatus("");
    if (id === NATIVE) { onApply(searchFromState(spec, { filters: [], columns: null, sort: spec.defaultSort, density: "comfortable" }, { ...keepCompany(), view: NATIVE })); return; }
    const v = views.find((x) => x.id === id); if (!v) return;
    onApply(searchFromState(spec, sanitizeView(v, spec, companies).state, { view: v.id }));
  };
  const errText = (e: unknown) => e instanceof ViewError
    ? ({ "empty-name": t("Enter a name for the view.", "أدخل اسمًا للعرض."), "duplicate-name": t("You already have a view with this name.", "لديك عرض بهذا الاسم بالفعل."), "not-found": t("This view no longer exists.", "هذا العرض لم يعد موجودًا."), "not-owner": t("You can only change your own views.", "يمكنك تعديل عروضك فقط.") })[e.code]
    : t("The view could not be saved.", "تعذّر حفظ العرض.");
  const state = () => stateFromSearch(spec, search);
  const save = () => {
    if (!current) return;
    try { const v = updateView(current.id, state(), user); setStatus(`${t("Saved view", "تم حفظ العرض")} «${v.name}»`); onApply({ ...search, view: v.id, fs: undefined }); }
    catch (e) { setStatus(errText(e)); }
  };
  const submitName = () => {
    try {
      if (dialog === "saveas") {
        const scope: ViewScope = share === "everyone" ? "everyone" : share.startsWith("role:") ? "role" : "personal";
        const v = createView(spec.id, name, state(), user, { scope, ...(scope === "role" ? { scopeRole: share.slice(5) } : {}) });
        setStatus(`${t("Saved new view", "تم حفظ عرض جديد")} «${v.name}»`); onApply({ ...search, view: v.id, fs: undefined });
      }
      else if (dialog === "rename" && current) { const v = renameView(current.id, name, user); setStatus(`${t("Renamed to", "أُعيدت تسميته إلى")} «${v.name}»`); }
      setDialog(null); setError("");
    } catch (e) { setError(errText(e)); }
  };
  const duplicate = () => { if (!current) return; try { const v = duplicateView(current.id, user, t("copy", "نسخة")); setStatus(`${t("Duplicated as", "تم النسخ باسم")} «${v.name}»`); onApply(searchFromState(spec, sanitizeView(v, spec, companies).state, { view: v.id })); } catch (e) { setStatus(errText(e)); } };
  const remove = () => { if (!current) return; try { const n = current.name; deleteView(current.id, user); setStatus(`${t("Deleted view", "تم حذف العرض")} «${n}»`); onApply({ ...search, view: NATIVE }); } catch (e) { setStatus(errText(e)); } setConfirmDelete(false); };
  const toggleDefault = () => { if (!current) return; setDefault(spec.id, current.isDefault ? null : current.id, user); setStatus(current.isDefault ? t("Default view removed", "أزيل العرض الافتراضي") : `${t("Default view set", "تم تعيين العرض الافتراضي")} «${current.name}»`); };
  const reset = () => { setStatus(t("Standard view restored; your saved views are kept.", "تمت استعادة العرض القياسي؛ عروضك المحفوظة باقية.")); choose(NATIVE); };

  const chips = activeFilters(spec, search, ar);
  const companyKey = spec.filters.find((f) => f.company)?.key;
  const removable = chips.filter((c) => c.key !== companyKey);
  const clear = () => onApply({ ...search, ...Object.fromEntries(removable.map((c) => [c.key, undefined])), fs: undefined });
  const sourceChip = entry.kind === "drill" ? t("From a dashboard insight — temporary filters", "من مؤشر في لوحة المعلومات — فلاتر مؤقتة")
    : entry.kind === "view" ? `${t("Saved view", "عرض محفوظ")}: ` : entry.kind === "default" ? `${t("My default view", "عرضي الافتراضي")}: `
    : entry.kind === "explicit" ? t("Custom filters", "فلاتر مخصصة") : t("Standard view", "العرض القياسي");
  const warn = (w: string) => { const [k, v] = w.split(/:(.*)/s) as [string, string];
    return k === "company" ? `${t("Company not permitted for you was skipped", "تم تخطي شركة غير مسموح لك بها")}: ${v}` : k === "column" ? `${t("Stored column no longer available was skipped", "تم تخطي عمود محفوظ لم يعد متاحًا")}: ${v}`
      : k === "sort" ? `${t("Stored sort no longer available was skipped", "تم تخطي ترتيب محفوظ لم يعد متاحًا")}: ${v}` : `${t("Stored filter no longer available was skipped", "تم تخطي فلتر محفوظ لم يعد متاحًا")}: ${v}`; };
  const hiddenCount = initialColumns(spec).filter((k) => !columnsOf(search["cols"], spec).includes(k)).length;

  return (
    <section className="dp-viewbar" aria-label={t("Saved views and columns", "العروض المحفوظة والأعمدة")} data-dp-viewbar={spec.id} data-dp-view-kind={entry.kind}>
      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="h-4 w-4 text-muted-foreground" aria-hidden />
        <label className="sr-only" htmlFor={`dpv-${spec.id}`}>{t("Saved views", "العروض المحفوظة")}</label>
        <select id={`dpv-${spec.id}`} className="field-input h-8 w-auto max-w-[16rem] py-0" value={current?.id ?? NATIVE} onChange={(e) => choose(e.target.value)} data-dp-view-select>
          <option value={NATIVE}>{t("Standard view", "العرض القياسي")}</option>
          {views.map((v) => <option key={v.id} value={v.id} data-no-i18n data-dp-view-shared={v.owner !== user ? (v.scope ?? "personal") : undefined}>{v.isDefault && v.owner === user ? "★ " : ""}{v.name}{v.owner !== user ? ` · ${t("shared by", "مشاركة من")} ${v.owner}` : v.scope && v.scope !== "personal" ? ` · ${t("shared", "مشترك")}` : ""}</option>)}
        </select>
        {dirty && <span className="chip bg-warning/20 text-[11px]" role="status" data-dp-view-dirty>{t("Unsaved changes", "تغييرات غير محفوظة")}</span>}
        <Button size="sm" variant="outline" disabled={!current || !dirty || !isOwn} onClick={save} data-dp-view-save>{t("Save view", "حفظ العرض")}</Button>
        <Button size="sm" variant="outline" onClick={() => { remember(); setName(""); setShare("personal"); setError(""); setDialog("saveas"); }} data-dp-view-saveas>{t("Save as…", "حفظ باسم…")}</Button>
        <Button size="sm" variant="ghost" className="sm:hidden" aria-expanded={toolsOpen} aria-controls={toolsId} onClick={() => setToolsOpen((o) => !o)} data-dp-view-tools-toggle>
          <SlidersHorizontal className="h-4 w-4" /> {t("View tools", "أدوات العرض")} <ChevronDown className={`h-3 w-3 transition-transform ${toolsOpen ? "rotate-180" : ""}`} /></Button>
        <div id={toolsId} className={`${toolsOpen ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`} data-dp-view-tools>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" disabled={!current} data-dp-view-more>{t("View actions", "إجراءات العرض")} <ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled={!isOwn} onSelect={() => { opener.current = document.querySelector<HTMLElement>(`[data-dp-viewbar="${spec.id}"] [data-dp-view-more]`); setName(current?.name ?? ""); setError(""); setDialog("rename"); }} data-dp-view-rename>{t("Rename", "إعادة تسمية")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={duplicate} data-dp-view-duplicate>{t("Duplicate", "تكرار")}</DropdownMenuItem>
              <DropdownMenuItem disabled={!isOwn} onSelect={toggleDefault} data-dp-view-default><Star className="h-3.5 w-3.5" /> {current?.isDefault ? t("Remove as my default", "إزالة كعرضي الافتراضي") : t("Set as my default", "تعيين كعرضي الافتراضي")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!isOwn} className="text-destructive" onSelect={() => { opener.current = document.querySelector<HTMLElement>(`[data-dp-viewbar="${spec.id}"] [data-dp-view-select]`); setConfirmDelete(true); }} data-dp-view-delete>{t("Delete view", "حذف العرض")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {fixedColumns ? <span className="text-[11px] text-muted-foreground" data-dp-columns-fixed>{t("Columns follow the standard report", "الأعمدة تتبع التقرير القياسي")}</span> : <>
            <ColumnsControl spec={spec} search={search} onApply={onApply} hidden={hiddenCount} />
            <Button size="sm" variant="ghost" aria-pressed={search["density"] === "compact"} onClick={() => onApply({ ...search, density: search["density"] === "compact" ? undefined : "compact" })} data-dp-density>
              <Rows3 className="h-4 w-4" /> {search["density"] === "compact" ? t("Compact rows", "صفوف مضغوطة") : t("Comfortable rows", "صفوف مريحة")}</Button>
          </>}
          <Button size="sm" variant="ghost" onClick={reset} data-dp-view-reset><RotateCcw className="h-4 w-4" /> {t("Reset", "إعادة الضبط")}</Button>
          {exporter && (canExport
            ? <Button size="sm" variant="ghost" onClick={() => { if (downloadRegister(exporter, user)) setStatus(t("Exported the rows and columns on screen.", "تم تصدير الصفوف والأعمدة المعروضة.")); }} data-dp-export><Download className="h-4 w-4" /> {t("Export CSV", "تصدير CSV")}</Button>
            : <span className="text-[11px] text-muted-foreground" data-dp-export-denied>{t("Export not permitted", "التصدير غير مسموح")}</span>)}
          {exporter && canPrint && <Button size="sm" variant="ghost" onClick={() => window.print()} data-dp-print><Printer className="h-4 w-4" /> {t("Print", "طباعة")}</Button>}
          {children}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" data-dp-chips>
        <span className={`chip ${entry.kind === "drill" ? "bg-primary/10 text-primary" : "bg-muted"}`} data-dp-filter-source={entry.kind}>{sourceChip}{current && <bdi className="ms-1" data-no-i18n>{current.name}</bdi>}</span>
        {chips.map((c) => <span key={c.key} className="chip inline-flex items-center gap-1 border border-border bg-card" data-dp-chip={c.key}>
          <span>{ar ? c.spec.ar : c.spec.label}</span>: <bdi className="font-medium" data-no-i18n>{c.value}</bdi>
          {c.key !== companyKey && <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label={`${t("Remove filter", "إزالة الفلتر")}: ${ar ? c.spec.ar : c.spec.label}`} onClick={() => onApply({ ...search, [c.key]: undefined, fs: search["fs"] === DRILL ? DRILL : undefined })}><X className="h-3 w-3" /></button>}
        </span>)}
        {removable.length > 0 && <Button size="sm" variant="link" className="h-auto px-1 py-0 text-xs" onClick={clear} data-dp-clear-filters>{t("Clear filters", "مسح الفلاتر")}</Button>}
        <span className="ms-auto text-[11px] text-muted-foreground" data-dp-view-scope={current?.scope ?? "personal"}>{current && current.owner !== user
          ? <>{t("Shared view by", "عرض مشترك من")} <bdi data-no-i18n>{current.owner}</bdi> · {t("use Save as… to keep your own copy", "استخدم «حفظ باسم…» للاحتفاظ بنسخة خاصة بك")}</>
          : current?.scope === "role" ? <>{t("Shared with the role", "مشترك مع الدور")} <bdi data-no-i18n>{current.scopeRole}</bdi></>
          : current?.scope === "everyone" ? t("Shared with everyone who can open this report", "مشترك مع كل من يستطيع فتح هذا التقرير")
          : <>{t("Personal views of", "عروض شخصية للمستخدم")} <bdi data-no-i18n>{user}</bdi></>}</span>
      </div>
      {(entry.warnings.length > 0 || entry.missingView) && <ul className="mt-2 space-y-0.5 text-xs text-warning" role="alert" data-dp-view-warnings>
        {entry.missingView && <li>{t("Saved view not found — it was deleted or belongs to another user. Showing the filters in the address.", "العرض المحفوظ غير موجود — حُذف أو يخص مستخدمًا آخر. تُعرض الفلاتر الموجودة في العنوان.")}</li>}
        {entry.warnings.map((w) => <li key={w} data-no-i18n>{warn(w)}</li>)}
      </ul>}
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {status && <p className="mt-1 text-xs text-success-text" data-dp-view-status>{status}</p>}

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={restoreFocus}>
          <DialogHeader>
            <DialogTitle>{dialog === "rename" ? t("Rename view", "إعادة تسمية العرض") : t("Save as a new view", "حفظ كعرض جديد")}</DialogTitle>
            <DialogDescription>{t("Saves the current filters, columns, sort and row density — not the report data.", "يحفظ الفلاتر والأعمدة والترتيب وكثافة الصفوف الحالية — وليس بيانات التقرير.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); submitName(); }}>
            <label className="text-sm" htmlFor="dpv-name">{t("View name", "اسم العرض")}</label>
            <input id="dpv-name" className="field-input mt-1 w-full" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-dp-view-name />
            {dialog === "saveas" && <>
              <label className="mt-3 block text-sm" htmlFor="dpv-share">{t("Share with", "مشاركة مع")}</label>
              <select id="dpv-share" className="field-input mt-1 w-full" value={share} onChange={(e) => setShare(e.target.value)} data-dp-view-share>
                <option value="personal">{t("Only me", "أنا فقط")}</option>
                {shareRoles.map((r) => <option key={r} value={`role:${r}`}>{t("Everyone with the role", "كل من لديه الدور")} {r}</option>)}
                <option value="everyone">{t("Everyone who can open this report", "كل من يستطيع فتح هذا التقرير")}</option>
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("Others can apply or copy a shared view; only you can change it. Report permissions still decide what each person sees.", "يستطيع الآخرون تطبيق العرض المشترك أو نسخه، ولا يعدّله غيرك. وتبقى صلاحيات التقرير هي التي تحدد ما يراه كل شخص.")}</p>
            </>}
            {error && <p className="mt-1 text-xs text-destructive" role="alert" data-dp-view-error>{error}</p>}
            <DialogFooter className="mt-4 gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>{t("Cancel", "إلغاء")}</Button>
              <Button type="submit" data-dp-view-confirm>{t("Save", "حفظ")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete this view?", "حذف هذا العرض؟")}</AlertDialogTitle>
            <AlertDialogDescription><bdi data-no-i18n>{current?.name}</bdi> — {t("Only the saved view is removed. Report data is not affected.", "يُحذف العرض المحفوظ فقط، ولا تتأثر بيانات التقرير.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={remove} data-dp-view-delete-confirm>{t("Delete", "حذف")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ColumnsControl({ spec, search, onApply, hidden }: { spec: ViewSpec; search: Search; onApply: Apply; hidden: number }) {
  const { t, ar } = useT();
  const visible = columnsOf(search["cols"], spec);
  const order = [...visible, ...spec.columns.map((c) => c.key).filter((k) => !visible.includes(k))];
  const native = initialColumns(spec).join(",");
  const set = (keys: string[]) => { const v = keys.join(","); onApply({ ...search, cols: v === native ? undefined : v }); };
  const move = (k: string, d: -1 | 1) => { const i = visible.indexOf(k), j = i + d; if (i < 0 || j < 0 || j >= visible.length) return; const n = [...visible]; [n[i], n[j]] = [n[j]!, n[i]!]; set(n); };
  return (
    <Popover>
      <PopoverTrigger asChild><Button size="sm" variant="ghost" data-dp-columns-trigger><Columns3 className="h-4 w-4" /> {t("Columns", "الأعمدة")}{hidden > 0 && <span className="chip bg-muted text-[10px]" data-no-i18n><bdi dir="ltr">−{hidden}</bdi></span>}</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2" data-dp-columns>
        <p className="px-1 pb-1 text-xs text-muted-foreground">{t("Show, hide and order columns. Locked columns identify the source record.", "إظهار وإخفاء وترتيب الأعمدة. الأعمدة المقفلة تعرّف المستند المصدر.")}</p>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {order.map((k) => { const c = spec.columns.find((x) => x.key === k)!; const i = visible.indexOf(k); const label = ar ? c.ar : c.label;
            return <li key={k} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted" data-dp-column={k}>
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input type="checkbox" checked={i >= 0} disabled={!!c.locked} onChange={(e) => set(e.target.checked ? [...visible, k] : visible.filter((x) => x !== k))} />
                <span>{label}</span>{c.locked && <span className="text-[10px] text-muted-foreground">{t("locked", "مقفل")}</span>}
              </label>
              {i >= 0 && <><Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} aria-label={`${t("Move earlier", "نقل للأمام")}: ${label}`} onClick={() => move(k, -1)}><ArrowUp className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === visible.length - 1} aria-label={`${t("Move later", "نقل للخلف")}: ${label}`} onClick={() => move(k, 1)}><ArrowDown className="h-3 w-3" /></Button></>}
            </li>; })}
        </ul>
        <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => onApply({ ...search, cols: undefined })} data-dp-columns-reset><RotateCcw className="h-3.5 w-3.5" /> {t("Reset columns", "إعادة ضبط الأعمدة")}</Button>
      </PopoverContent>
    </Popover>
  );
}

/** Sortable column header bound to the URL `sort` key. */
export function SortTh({ k, label, sort, sortable, onSort, align = "start", className = "" }: { k: string; label: string; sort: ViewSort | null; sortable: boolean; onSort: (s: string) => void; align?: "start" | "end" | undefined; className?: string }) {
  const on = sort?.field === k;
  const aria = on ? (sort!.dir === "asc" ? "ascending" : "descending") : "none";
  return <th className={`whitespace-nowrap px-2 py-2 text-${align} ${className}`} aria-sort={sortable ? aria : undefined} scope="col">
    {sortable ? <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(`${k}:${on && sort!.dir === "desc" ? "asc" : "desc"}`)} data-dp-sort={k}>
      <span>{label}</span>{on ? (sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}</button> : <span>{label}</span>}
  </th>;
}
