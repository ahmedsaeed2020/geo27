import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Frappe-host addresses (audit G11): on the server the DIGIT apps live under /digit/… (router basepath of the hosted
 * build), in this preview at the site root. A shared /digit/pro/… link opens the same page here, query kept.
 */
export const Route = createFileRoute("/digit/$")({
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `/${params._splat ?? ""}${location.searchStr ?? ""}`, replace: true });
  },
});
