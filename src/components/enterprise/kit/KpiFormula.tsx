/**
 * Shared KPI info tip (owner FINAL WORK LIST 2026-11-13, Part 1b): an (i) next to a KPI label that opens its exact formula —
 * basis in words, numerator, denominator, as-of date (and block window), filters and source — from
 * lib/coreShared/kpiFormula.ts over the same definition that computes the value. Built once in Enterprise; any app's
 * KPI card or scorecard row passes its definition in.
 */
import { useState, type MouseEvent } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { kpiFormula, type FormulaSource } from "@/lib/coreShared/kpiFormula";


export function KpiFormulaTip({ def, asOf, window, ar, label }: { def: FormulaSource; asOf: string; window?: { from: string; to: string } | undefined; ar: boolean; label?: string | undefined }) {
  const f = kpiFormula(def, asOf, window); const i = ar ? 1 : 0;
  const t = (en: string, a: string) => (ar ? a : en);
  // the tip sits inside the KPI's drill link: the click must neither follow the link nor reach its handler, so it toggles itself
  const [open, setOpen] = useState(false);
  const toggle = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <span role="button" tabIndex={0} className="ek-kpi-info" aria-label={t(`Formula of ${label ?? "this indicator"}`, `معادلة ${label ?? "هذا المؤشر"}`)} data-kpi-info
        aria-expanded={open} onClick={toggle} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}>
        <Info className="h-3.5 w-3.5" aria-hidden />
      </span>
    </PopoverTrigger>
    <PopoverContent className="ek-kpi-formula" align="start" side="bottom" onClick={(e) => e.stopPropagation()} data-kpi-formula>
      <p className="ek-kpi-formula-k">{t("How this figure is calculated", "طريقة حساب هذا الرقم")}</p>
      {label && <p className="ek-kpi-formula-t">{label}</p>}
      <p className="ek-kpi-formula-b" data-kpi-f-basis>{f.basis[i]}</p>
      <dl>
        <div><dt>{t("Numerator", "البسط")}</dt><dd data-kpi-f-num>{f.numerator[i]}</dd></div>
        <div><dt>{t("Denominator", "المقام")}</dt><dd data-kpi-f-den>{f.denominator ? f.denominator[i] : t("None — an absolute figure", "لا يوجد — رقم مطلق")}</dd></div>
        <div><dt>{t("As of", "حتى تاريخ")}</dt><dd data-kpi-f-asof><bdi data-no-i18n>{f.asOf}</bdi>{f.window && <> · {t("period", "الفترة")} <bdi data-no-i18n>{f.window.from} → {f.window.to}</bdi></>}</dd></div>
        <div><dt>{t("Filters", "الشروط")}</dt><dd data-kpi-f-filters={f.filters.length}>{f.filters.length ? <ul>{f.filters.map((x, n) => <li key={n}>{x[i]}</li>)}</ul> : t("none", "لا يوجد")}{f.rule && <p className="ek-kpi-formula-r">{f.rule[i]}</p>}</dd></div>
        <div><dt>{t("Source", "المصدر")}</dt><dd>{f.source[i]}{f.money && <> · {t("amounts in the document currency (Riyal for SAR)", "المبالغ بعملة المستند (الريال للريال السعودي)")}</>}</dd></div>
      </dl>
      <p className="ek-kpi-formula-d">{t("Clicking the figure opens exactly the records it counts.", "النقر على الرقم يفتح السجلات التي يعدّها بالضبط.")}</p>
    </PopoverContent>
  </Popover>;
}
