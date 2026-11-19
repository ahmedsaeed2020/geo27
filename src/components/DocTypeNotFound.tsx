import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLang } from "@/i18n";
import { DevOnly } from "@/components/DevOnly";
import { indexQuery } from "@/lib/catalog";

/**
 * frappe router: an /app/<slug> whose DocType does not exist shows "Page <slug> not found" instead of waiting.
 * The list and form routes render this when the DocType definition request fails (no catalog JSON and no plugin
 * DocType), so an unknown or uninstalled DocType URL never stays on "Loading" and never shows a raw error.
 * frappe routes carry no app segment (/app/contact), so a link that names the wrong app for an existing DocType
 * (/app/erpnext/contact) is sent to the DocType's own app instead of ending on "not found"; a frappe-style hyphenated slug
 * (/app/opening-invoice-creation-tool) is sent to the catalog's underscore slug.
 */
export function DocTypeNotFound({ slug, error }: { slug: string; error?: unknown }) {
  const ar = useLang() === "ar";
  const { data: ix } = useQuery(indexQuery);
  const loc = useRouterState({ select: (s) => s.location });
  const nav = useNavigate();
  const seg = loc.pathname.split("/");
  // frappe writes slugs with hyphens (/app/opening-invoice-creation-tool); this catalog's slugs use underscores
  const alt = slug.replace(/-/g, "_");
  const owner = ix?.find((e) => (e.slug === slug && e.app !== seg[2]) || (alt !== slug && e.slug === alt));
  useEffect(() => {
    if (!owner || seg[1] !== "app") return;
    seg[2] = owner.app; if (seg[3] === slug) seg[3] = owner.slug; void nav({ href: seg.join("/") + (loc.searchStr ?? ""), replace: true });
  }, [owner?.app, owner?.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  if (owner || !ix) return <div className="panel p-6 text-sm text-muted-foreground" data-doctype-redirect={slug}>{ar ? "جارٍ الفتح…" : "Opening…"}</div>;
  return (
    <div className="panel p-6" data-doctype-not-found={slug} role="alert" data-no-i18n>
      <h2 className="font-semibold">{ar ? "الصفحة غير موجودة" : "Page not found"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {ar ? <>لا يوجد نوع مستند بالاسم <bdi>{slug}</bdi> في هذا النظام أو أن تطبيقه غير مثبّت.</> : <>No document type <bdi>{slug}</bdi> exists here, or its app is not installed.</>}
      </p>
      <Link to="/" className="btn-ghost mt-4 inline-flex">{ar ? "العودة إلى الرئيسية" : "Back to Home"}</Link>
      <DevOnly>{error ? <p className="mt-2 text-xs text-muted-foreground">{String(error)}</p> : null}</DevOnly>
    </div>
  );
}
