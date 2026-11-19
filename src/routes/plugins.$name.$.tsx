import { createFileRoute } from "@tanstack/react-router";
import { PluginPageHost } from "@/components/plugins/PluginPageHost";
import { CON_APP, conTitle } from "@/plugins/digit_construction/urls";

export const Route = createFileRoute("/plugins/$name/$")({
  head: ({ params }) => {
    const app = params.name.replace(/_/g, " ");
    const page = (params._splat ?? "").split("/")[0]?.replace(/-/g, " ") || "home";
    // an app with its own address space names its pages (DIGIT Construction: workspace — tab — app)
    const title = (params.name === CON_APP ? conTitle(params._splat ?? "") : undefined) ?? `${app} — ${page}`;
    return { meta: [
      { title },
      { name: "description", content: `${app} app page (${page}) computed from Virtual Core records.` },
      { property: "og:title", content: title },
      { property: "og:description", content: `${app} app page computed from Virtual Core records.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ] };
  },
  component: AppPage,
});

function AppPage() {
  const { name, _splat } = Route.useParams();
  return <PluginPageHost name={name} path={_splat ?? ""} />;
}
