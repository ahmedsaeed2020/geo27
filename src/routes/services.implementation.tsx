import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/services/implementation")({beforeLoad: () => { throw redirect({to: "/services-3/implementation", statusCode: 301}); }});
