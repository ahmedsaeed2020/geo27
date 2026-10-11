import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/services/data-migration")({beforeLoad: () => { throw redirect({to: "/en/services-3/data-migration", statusCode: 301}); }});
