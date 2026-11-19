import { createFileRoute, redirect } from "@tanstack/react-router";

/** Source router: "/" (Home) redirects to "/dashboards". */
export const Route = createFileRoute("/insights/")({ beforeLoad: () => { throw redirect({ to: "/insights/dashboards" }); } });
