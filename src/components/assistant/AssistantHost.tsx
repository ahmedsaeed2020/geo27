/**
 * DIGIT Assistant entry points: the dock button (bottom of the app bar, and in phone app drawers) and the host that
 * lazy-loads the chat panel the first time it is opened, so the chat code never weighs on normal page loads.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useLang } from "@/i18n";
import { setAssistantOpen, toggleAssistant, useAssistantOpen } from "@/lib/assistant/store";

const AssistantPanel = lazy(() => import("./AssistantPanel"));
const LOGO = "/icons/digit/logo/digit-icon-app.svg";

export const assistantLabel = (ar: boolean) => (ar ? "مساعد ديجيت" : "DIGIT Assistant");

/** Dock entry: DIGIT logo that opens / closes the assistant. `grid` = phone drawer tile. */
export function AssistantDockButton({ grid, onNavigate }: { grid?: boolean | undefined; onNavigate?: (() => void) | undefined }) {
  const ar = useLang() === "ar";
  const open = useAssistantOpen();
  return (
    <div className={grid ? "dx-ai-slot-grid" : "dx-ai-slot"}>
      <button
        type="button"
        data-dock-ai
        data-active={open || undefined}
        aria-pressed={open}
        title={assistantLabel(ar)}
        onClick={() => { if (grid) { setAssistantOpen(true); onNavigate?.(); } else toggleAssistant(); }}
        className="dx-dock-item dx-ai-launch"
      >
        <span className="dx-tile dx-tile-own dx-ai-tile" aria-hidden><img src={LOGO} alt="" /></span>
        <span className="dx-dock-label">{ar ? "المساعد" : "Assistant"}</span>
      </button>
    </div>
  );
}

/** Mounted once at the root; renders nothing until the assistant is first opened. */
export function AssistantHost() {
  const open = useAssistantOpen();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (open) setLoaded(true); }, [open]);
  // Stays mounted (hidden) after the first open, so closing the panel never cuts off an answer in progress.
  if (!loaded) return null;
  return <Suspense fallback={null}><AssistantPanel open={open} /></Suspense>;
}
