import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/services/hosting")({beforeLoad: () => { throw redirect({to: "/services-3/hosting", statusCode: 301}); }});
