import { createFileRoute, redirect } from "@tanstack/react-router";

/** /digit is the Enterprise Home on the Frappe host (audit G11); in this preview the home is the site root. */
export const Route = createFileRoute("/digit/")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
