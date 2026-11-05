import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/services/")({beforeLoad: () => { throw redirect({to: "/services-3", statusCode: 301}); }});
