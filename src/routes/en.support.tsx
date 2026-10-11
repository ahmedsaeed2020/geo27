import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/support")({beforeLoad: () => { throw redirect({to: "/en/services-3/support", statusCode: 301}); }});
