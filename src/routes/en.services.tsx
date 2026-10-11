import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/services")({beforeLoad: () => { throw redirect({to: "/en/services-3", statusCode: 301}); }});
