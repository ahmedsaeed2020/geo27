import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/about")({beforeLoad: () => { throw redirect({to: "/about-4", statusCode: 301}); }});
