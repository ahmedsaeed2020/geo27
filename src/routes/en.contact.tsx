import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/en/contact")({beforeLoad: () => { throw redirect({to: "/en/contact-4", statusCode: 301}); }});
