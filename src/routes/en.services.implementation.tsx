import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/services/implementation")({beforeLoad: () => { throw redirect({to: "/en/services-3/implementation", statusCode: 301}); }});
