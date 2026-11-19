import { useNavigate } from "@tanstack/react-router";
import { publicHref } from "@/lib/appUrls";
import { toast } from "sonner";
import { adapter, DocValidationError, type Doc } from "@/lib/adapter";
import { Link } from "@tanstack/react-router";
import { appActions, callMethod, enabledPlugins, fill, formButtons, logEvent, value, usePluginsVersion } from "@/plugins/runtime";
import { cachedMeta, indexQuery } from "@/lib/catalog";
import { useQuery } from "@tanstack/react-query";
import { actionContracts, dispatchAction } from "@/lib/actionRegistry";
import { useLang } from "@/i18n";
import { assertScoped } from "@/lib/scope";

/** Client Script buttons (frm.add_custom_button) from enabled plugins. Renders nothing when no plugin targets this DocType. */
export function PluginButtons({ doctype, doc }: { doctype: string; doc: Doc }) {
  usePluginsVersion();
  const nav = useNavigate(); const lang = useLang();
  const idx = useQuery(indexQuery);
  const btns = formButtons(doctype, doc);
  const prints = enabledPlugins().flatMap((p) => (p.print_formats ?? []).filter((f) => f.doc_type === doctype).map((f) => ({ plugin: p.name, f })));
  // manifest actions (PluginManifest.actions) go through the shared dispatcher; server-declared ones stay visible but disabled
  const meta = appActions(doctype).length ? cachedMeta(doctype) : undefined;
  const acts = meta ? actionContracts(meta, {}, doc).filter((c) => c.kind === "APP_ACTION" && (c.eligible || c.execution === "FRAPPE_SERVER_REQUIRED")) : [];
  if (!btns.length && !prints.length && !acts.length) return null;
  const runAction = (id: string) => {
    if (!meta) return;
    const r = dispatchAction(meta, doc.name, id, (q) => window.prompt(q));
    if (r.status === "DONE") { toast.success(r.message); if (r.open) { const [dt, nm] = r.open; const t = idx.data?.find((x) => x.name === dt); if (t) void nav({ to: "/app/$app/$doctype/$name", params: { app: t.app, doctype: t.slug, name: nm } }); } }
    else if (r.status === "SERVER_REQUIRED") toast.message(lang === "ar" ? "هذا الإجراء يحتاج خادم DIGIT الحقيقي" : r.message);
    else toast.error(r.message);
  };
  const run = (b: (typeof btns)[number]) => {
    logEvent({ kind: "client", doctype, name: doc.name, event: `button → ${b.label}` });
    const a = b.action;
    // writes pass the same scope boundary as the virtual API (role perms + User Permission/company); refusals are shown, never swallowed
    try {
      if (a.type === "route") { const url = fill(a.to, doc); window.history.pushState({}, "", publicHref(url)); void nav({ to: url as never }); }
      else if (a.type === "set_value") { const patch: Record<string, unknown> = {}; for (const [k, e] of Object.entries(a.values)) patch[k] = value(e, doc); assertScoped(doctype, "write", { ...doc, ...patch }); adapter.update(doctype, doc.name, patch); }
      else if (a.type === "create") { const data: Record<string, unknown> = {}; for (const [k, e] of Object.entries(a.map)) data[k] = value(e, doc); assertScoped(a.doctype, "create", { ...data, name: "", doctype: a.doctype } as never); const d = adapter.insertDoc(a.doctype, data); toast.success(`${a.doctype} ${d.name}`); }
      else if (a.type === "message") toast.message(lang === "ar" && a.text_ar ? a.text_ar : fill(a.text, doc));
      else if (a.type === "call") toast.message(JSON.stringify(callMethod(a.method, { doc })).slice(0, 200));
    } catch (e) { toast.error(e instanceof DocValidationError ? e.errors.join("\n") : String((e as Error).message)); }
  };
  return <>{prints.map(({ plugin, f }) => <Link key={f.name} to="/plugins/$name/print/$format/$doc" params={{ name: plugin, format: f.name, doc: doc.name }} className="btn-ghost" data-plugin-print={f.name}>⎙ {f.name}</Link>)}{acts.map((c) => { const pa = appActions(doctype).find((x) => `app:${x.plugin}:${x.name}` === c.id); const server = c.execution === "FRAPPE_SERVER_REQUIRED"; return <button key={c.id} type="button" className="btn-ghost disabled:opacity-60" data-app-action={c.id} disabled={server} title={server ? (lang === "ar" ? "يتطلب خادم DIGIT" : "Requires the DIGIT server") : pa?.description} onClick={() => runAction(c.id)}>{lang === "ar" && pa?.label_ar ? pa.label_ar : c.label}{server && <span className="ms-1 text-[10px] text-muted-foreground">{lang === "ar" ? "(خادم)" : "(server)"}</span>}</button>; })}{btns.map((b) => <button key={b.script + b.label} type="button" className="btn-ghost" data-plugin-button={b.label} onClick={() => run(b)}>{b.group ? <span className="text-muted-foreground">{b.group} › </span> : null}{b.label}</button>)}</>;
}
