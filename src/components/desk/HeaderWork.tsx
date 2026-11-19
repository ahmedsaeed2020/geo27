/** S2 Recent & pinned documents and S3 My Work counter in the shared header (enterprise shell). */
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { useLang, t as tr } from "@/i18n";
import { pinnedDocs, recentDocs, useRecentVersion, type DocRef } from "@/lib/recentDocs";
import { myWork } from "@/lib/myWork";

const slug = (dt: string) => dt.toLowerCase().replace(/ /g, "_");
function usePop() {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, [open]);
  return { open, setOpen, ref };
}
function DocRow({ r, onGo }: { r: DocRef; onGo: () => void }) {
  return <Link to="/app/$app/$doctype/$name" params={{ app: r.app || "erpnext", doctype: slug(r.doctype), name: r.name }} onClick={onGo} className="ent-pop-row" data-recent-doc={`${r.doctype}:${r.name}`}>
    <span className="ent-pop-sub">{tr(r.doctype)}</span><bdi className="truncate font-medium" data-no-i18n>{r.title && r.title !== r.name ? `${r.name} · ${r.title}` : r.name}</bdi></Link>;
}

export function HeaderRecent() {
  useStoreVersion(); useRecentVersion();
  const user = useSessionUser(); const ar = useLang() === "ar"; const p = usePop();
  const pins = pinnedDocs(user); const rec = recentDocs(user);
  return <div className="relative" ref={p.ref}>
    <button type="button" className="dx-hdr-btn" aria-label={ar ? "المستندات الأخيرة والمثبتة" : "Recent and pinned documents"} aria-expanded={p.open} onClick={() => p.setOpen(!p.open)} data-header-recent>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    </button>
    {p.open && <div className="ent-pop" role="dialog" data-recent-panel>
      <h3 className="ent-pop-h">{ar ? "مثبتة" : "Pinned"}</h3>
      {pins.length ? pins.map((r) => <DocRow key={`p${r.doctype}${r.name}`} r={r} onGo={() => p.setOpen(false)} />) : <p className="ent-pop-empty" data-pinned-empty>{ar ? "لا مستندات مثبتة. ثبّت مستندًا من رأس المستند." : "No pinned documents. Pin one from the document header."}</p>}
      <h3 className="ent-pop-h">{ar ? "آخر عشرة مستندات" : "Last ten documents"}</h3>
      {rec.length ? rec.map((r) => <DocRow key={`r${r.doctype}${r.name}`} r={r} onGo={() => p.setOpen(false)} />) : <p className="ent-pop-empty">{ar ? "لم تفتح مستندات بعد." : "You have not opened any documents yet."}</p>}
    </div>}
  </div>;
}

export function HeaderMyWork() {
  useStoreVersion();
  const user = useSessionUser(); const ar = useLang() === "ar"; const p = usePop();
  const w = myWork(user);
  const KIND = { approval: ["Approvals", "اعتمادات"], task: ["Tasks", "مهام"], alert: ["Alerts", "تنبيهات"] } as const;
  return <div className="relative" ref={p.ref}>
    <button type="button" className="dx-hdr-btn relative" aria-label={ar ? `أعمالي: ${w.total}` : `My Work: ${w.total}`} aria-expanded={p.open} onClick={() => p.setOpen(!p.open)} data-header-mywork={w.total}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></svg>
      {w.total > 0 && <span className="dx-hdr-count" data-no-i18n>{w.total}</span>}
    </button>
    {p.open && <div className="ent-pop" role="dialog" data-mywork-panel>
      <div className="ent-pop-kinds">{(["approval", "task", "alert"] as const).map((k) => <span key={k} className="ent-pop-kind" data-mywork-kind={k}><b data-no-i18n>{w.byKind[k]}</b> {ar ? KIND[k][1] : KIND[k][0]}</span>)}</div>
      {w.groups.map((g) => <section key={g.id} data-mywork-group={g.id}>
        <h3 className="ent-pop-h">{ar ? g.label[1] : g.label[0]} <span data-no-i18n>({g.items.length})</span></h3>
        {g.items.slice(0, 6).map((i, k) => <Link key={k} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(i.doctype), name: i.name }} onClick={() => p.setOpen(false)} className="ent-pop-row">
          <span className="ent-pop-sub">{tr(i.doctype)}{i.onBehalfOf ? <> · {ar ? "نيابة عن" : "on behalf of"} <bdi data-no-i18n>{i.onBehalfOf}</bdi></> : null}</span><bdi className="truncate" data-no-i18n>{i.name} · {i.title}</bdi></Link>)}
        {g.inbox && g.items.length > 0 && <Link to={g.inbox.to as never} onClick={() => p.setOpen(false)} className="ent-pop-more">{ar ? g.inbox.label[1] : g.inbox.label[0]}</Link>}
      </section>)}
      {w.total === 0 && <p className="ent-pop-empty">{ar ? "لا شيء بانتظارك." : "Nothing is waiting for you."}</p>}
    </div>}
  </div>;
}
