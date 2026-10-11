import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/services/support")({beforeLoad: () => { throw redirect({to: "/services-3/support", statusCode: 301}); }});
