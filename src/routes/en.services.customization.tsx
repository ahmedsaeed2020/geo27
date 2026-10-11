import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/services/customization")({beforeLoad: () => { throw redirect({to: "/en/services-3/customization", statusCode: 301}); }});
