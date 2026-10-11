import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/services/customization")({beforeLoad: () => { throw redirect({to: "/services-3/customization", statusCode: 301}); }});
