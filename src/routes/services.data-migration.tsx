import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/services/data-migration")({beforeLoad: () => { throw redirect({to: "/services-3/data-migration", statusCode: 301}); }});
