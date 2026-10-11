import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/services/training")({beforeLoad: () => { throw redirect({to: "/en/services-3/training", statusCode: 301}); }});
