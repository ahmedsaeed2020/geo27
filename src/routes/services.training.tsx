import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/services/training")({beforeLoad: () => { throw redirect({to: "/services-3/training", statusCode: 301}); }});
