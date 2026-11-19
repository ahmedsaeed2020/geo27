import { createFileRoute, redirect } from "@tanstack/react-router";

/** Owner decision (2026-11-19): the shared Enterprise Home is retired; only the CRM home remains. */
export const Route = createFileRoute("/enterprise")({
  beforeLoad: () => { throw redirect({ to: "/digit-crm/home" }); },
});
