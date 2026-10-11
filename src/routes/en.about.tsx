import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/about")({beforeLoad: () => { throw redirect({to: "/en/about-4", statusCode: 301}); }});
