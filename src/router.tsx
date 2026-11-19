import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { appUrlRewrite } from "./lib/appUrls";
import { motionIdentity } from "@/motion/identity";
/**
 * Route transitions are a progressive enhancement: only browsers with View Transition types get them, and only when
 * the page itself changes (search-param and hash updates, such as the blueprint builder, never animate). Entering
 * another product family uses the department wipe; everything else crossfades. Reduced motion skips them.
 */
function viewTransitions() {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof document.startViewTransition !== "function") return false;
  if (!window.CSS?.supports?.("selector(:active-view-transition-type(a))")) return false;
  return {
    types: ({ fromLocation, toLocation, pathChanged }: { fromLocation?: { pathname: string }; toLocation: { pathname: string }; pathChanged: boolean }) => {
      if (!pathChanged || !fromLocation || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false as const;
      return [motionIdentity(fromLocation.pathname) === motionIdentity(toLocation.pathname) ? "dm-page" : "dm-department"];
    },
  };
}



export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // app address spaces (DIGIT Construction /construction/…) — internal paths stay, visible addresses follow the app
    rewrite: appUrlRewrite,
    defaultViewTransition: viewTransitions(),
  });

  return router;
};
