import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/services/hosting")({beforeLoad: () => { throw redirect({to: "/en/services-3/hosting", statusCode: 301}); }});
