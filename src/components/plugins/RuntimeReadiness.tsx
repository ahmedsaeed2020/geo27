import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useLang, t } from "@/i18n";
import { indexQuery } from "@/lib/catalog";
import { capabilityOfAny, isOptional } from "@/lib/capabilities";
import { classifyDocument, runtimeContractQuery } from "@/lib/runtimeContract";
import { fieldSupport } from "@/lib/fieldTypes";
import { DOMAINS, resolveDomain } from "@/lib/domainMaps";
import { resolveSettingsDomains } from "@/lib/settingsRegistry";
import { reportCoverage } from "@/lib/reportRegistry";
import { DOCUMENT_API_MAP } from "@/lib/documentApi";
import { RUNNERS } from "@/lib/reportRunner";
import { appSettings } from "@/plugins/runtime";
import type { CapabilityRegistry } from "@/lib/sourceTypes";

const OP_AR: Record<string, string> = { VIRTUAL: "افتراضي", SERVER_ONLY: "خادم فقط", NOT_APPLICABLE: "لا ينطبق" };

/**
 * Developer view of what the Virtual Core can really do for the selected DocType and for each business domain
 * (runtime-contract.json + domain/settings/report registries). Read-only; nothing here changes records.
 */
export function RuntimeReadiness({ registry, name, onSelect }: { registry: CapabilityRegistry; name: string; onSelect: (n: string) => void }) {
  const ar = useLang() === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  const rc = useQuery(runtimeContractQuery);
  const idx = useQuery(indexQuery);
  const [domainId, setDomainId] = useState(DOMAINS[0]!.id);
  if (rc.isPending || idx.isPending) return <p role="status">{L("Loading runtime evidence…", "جارٍ تحميل أدلة التشغيل…")}</p>;
  if (rc.isError || !rc.data || !idx.data) return <p role="alert">{L("Runtime evidence unavailable", "أدلة التشغيل غير متاحة")}</p>;
  const cap = capabilityOfAny(registry, name);
  const ev = rc.data.lifecycle[name];
  const cls = cap ? classifyDocument(cap.schema, ev) : undefined;
  const fields = cap?.schema.fields.filter((f) => f.fieldname) ?? [];
  const modes = fields.reduce<Record<string, number>>((m, f) => { const k = fieldSupport(f.fieldtype).mode; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const explicit = fields.filter((f) => fieldSupport(f.fieldtype).mode === "READ_ONLY_EXPLICIT");
  const dom = resolveDomain(registry, rc.data, domainId);
  const settings = resolveSettingsDomains(idx.data, rc.data, appSettings());
  const cov = reportCoverage(registry.reports, RUNNERS);
  return (
    <section className="space-y-6" data-runtime-readiness>
      {cap && cls && <div>
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{t(cap.name)}</h2>
          <span className="chip bg-muted text-xs" data-no-i18n data-document-class={cls.class}>{cls.class}</span>
          {isOptional(cap) && <span className="chip bg-accent text-xs">{L("Optional source (not installed)", "مصدر اختياري (غير مثبّت)")}</span>}</div>
        <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
          {(["create", "edit", "delete"] as const).map((k) => <div key={k} className="flex justify-between gap-2"><dt>{L(k[0]!.toUpperCase() + k.slice(1), k === "create" ? "إنشاء" : k === "edit" ? "تعديل" : "حذف")}</dt><dd data-no-i18n>{cls[k] ? "✓" : "—"}</dd></div>)}
          {(["submit", "cancel", "amend"] as const).map((k) => <div key={k} className="flex justify-between gap-2"><dt>{L(k[0]!.toUpperCase() + k.slice(1), k === "submit" ? "اعتماد" : k === "cancel" ? "إلغاء" : "تعديل لاحق")}</dt><dd>{ar ? OP_AR[cls[k]] : cls[k]}</dd></div>)}
        </dl>
        <ul className="mt-2 list-disc ps-5 text-xs text-muted-foreground" data-no-i18n dir="ltr">{cls.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        {ev && <p className="mt-1 text-xs text-muted-foreground" data-no-i18n dir="ltr">controller: {ev.bases.join(", ") || "—"} · hooks: {ev.hooks.join(", ") || "—"} · virtual rules: {ev.virtual_rules.join(", ") || "—"}</p>}
        <h3 className="mt-4 font-medium">{L("Field controls", "عناصر الحقول")}</h3>
        <p className="text-xs" data-no-i18n>{Object.entries(modes).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
        {explicit.length > 0 && <p className="text-xs text-muted-foreground" data-no-i18n>{L("Shown read-only", "تُعرض للقراءة فقط")}: {explicit.map((f) => `${f.fieldname} (${f.fieldtype})`).join(", ")}</p>}
      </div>}
      <div>
        <h3 className="mb-2 font-medium">{L("Business domain readiness", "جاهزية المجالات التشغيلية")}</h3>
        <div className="mb-2 flex flex-wrap gap-1" role="tablist">{DOMAINS.map((d) => <button key={d.id} type="button" role="tab" aria-selected={d.id === domainId} className={`rounded border px-2 py-1 text-xs ${d.id === domainId ? "bg-muted font-medium" : ""}`} onClick={() => setDomainId(d.id)}>{ar ? d.label.ar : d.label.en}</button>)}</div>
        <div className="overflow-x-auto"><table className="w-full text-xs" data-domain-table={domainId}>
          <thead><tr>{[L("DocType", "نوع المستند"), L("Class", "التصنيف"), L("Submit", "الاعتماد"), L("Links in domain", "روابط داخل المجال"), L("Mapped documents", "مستندات مُنشأة"), L("Server actions", "إجراءات الخادم")].map((h) => <th key={h} className="border-b p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{dom.rows.map((r) => <tr key={r.doctype} className="border-b align-top">
            <td className="p-2"><button type="button" className="text-primary hover:underline" onClick={() => onSelect(r.doctype)}>{t(r.doctype)}</button></td>
            <td className="p-2" data-no-i18n>{r.document_class ?? "MISSING"}</td><td className="p-2">{r.submit ? (ar ? OP_AR[r.submit] : r.submit) : "—"}</td>
            <td className="p-2" data-no-i18n title={r.links_in_domain.map((l) => `${l.field}→${l.to}`).join("\n")}>{r.links_in_domain.slice(0, 6).map((l) => `${l.field}→${l.to}`).join(", ") || "—"}{r.links_in_domain.length > 6 ? ` +${r.links_in_domain.length - 6}` : ""}</td>
            <td className="p-2" data-no-i18n>{r.mapped_to.map((m) => `${m.target}${m.local ? " ✓" : ""}`).join(", ") || "—"}</td>
            <td className="max-w-xs break-words p-2" data-no-i18n>{r.server_actions.join(", ") || "—"}</td></tr>)}</tbody>
        </table></div>
        <ul className="mt-2 list-disc ps-5 text-xs text-muted-foreground" data-no-i18n dir="ltr">{dom.domain.services.map((s) => <li key={s}>{s}</li>)}{dom.domain.notes.map((s) => <li key={s}>{s}</li>)}</ul>
        {dom.domain.department && <Link to="/department/$dept" params={{ dept: dom.domain.department }} className="mt-2 inline-block text-xs text-primary hover:underline">{L("Open department home", "فتح صفحة القسم")}</Link>}
      </div>
      <div>
        <h3 className="mb-2 font-medium">{L("Settings domains", "مجالات الإعدادات")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{settings.map((d) => <div key={d.id} className="panel p-3 text-xs" data-settings-domain={d.id}>
          <div className="mb-1 font-semibold">{ar ? d.label.ar : d.label.en}</div>
          {d.settings.map((s) => <div key={s.doctype} className="flex justify-between gap-2">{s.present && s.app && s.slug ? <Link to="/app/$app/$doctype" params={{ app: s.app, doctype: s.slug }} className="text-primary hover:underline">{t(s.doctype)}</Link> : <span>{t(s.doctype)}</span>}<span className="text-muted-foreground" data-no-i18n>{s.execution === "LOCAL_CONFIG_CONSUMED" ? `✓ ${s.consumers.length}` : s.execution === "LOCAL_CONFIG_STORED" ? "○" : "?"}</span></div>)}
          {d.app_settings.map((s) => <div key={s.doctype} className="flex justify-between gap-2"><span>{t(s.label)}</span><span className="text-muted-foreground" data-no-i18n>{s.plugin}</span></div>)}
        </div>)}</div>
        <p className="mt-1 text-[11px] text-muted-foreground">{L("✓ n = read by n local modules · ○ = stored only (effects need the DIGIT server)", "✓ n = تقرؤه n وحدات محلية · ○ = مخزّن فقط (التأثيرات تحتاج خادم DIGIT)")}</p>
      </div>
      <div>
        <h3 className="mb-2 font-medium">{L("Report execution coverage", "تغطية تنفيذ التقارير")}</h3>
        <p className="text-xs" data-no-i18n>{Object.entries(cov).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
      </div>
      <details className="border-b py-2"><summary className="cursor-pointer text-sm font-medium">{L("Document API", "واجهة المستندات")}</summary>
        <table className="mt-2 w-full text-xs" dir="ltr" data-no-i18n><tbody>{Object.entries(DOCUMENT_API_MAP).map(([k, v]) => <tr key={k} className="border-b"><td className="p-1 font-mono">{k}</td><td className="p-1">{v.implementation}</td><td className="p-1 text-muted-foreground">{v.notes}</td></tr>)}</tbody></table>
      </details>
    </section>
  );
}
