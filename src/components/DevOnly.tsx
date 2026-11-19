import type { ReactNode } from "react";
import { useDevMode } from "@/lib/mode";

/** Renders preview-only diagnostics when Developer mode is on (safe inside conditions/loops, unlike calling the hook inline). */
export function DevOnly({ children }: { children: ReactNode }) {
  return useDevMode() ? <>{children}</> : null;
}
