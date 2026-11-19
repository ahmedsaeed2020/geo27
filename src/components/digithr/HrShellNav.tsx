import { useEffect, useRef, type ReactNode } from "react";
import { getSettings, setSettings, useSettings } from "@/lib/userSettings";
import { Link, useRouterState } from "@tanstack/react-router";
import { EnterpriseDock } from "@/components/enterprise/EnterpriseDock";
import { HrNav, useTx } from "./HrNav";

/**
 * Contextual-sidebar fold state = the shared Core "module sidebar" user preference (User Settings; header ☰ and Ctrl+B
 * toggle it), exactly like DIGIT Pro and the Desk, so every app collapses and expands the same way and the choice is
 * kept per user.
 */
function useNavCollapse(): [boolean, () => void] {
  const s = useSettings();
  return [!s.module_sidebar, () => setSettings({ module_sidebar: !getSettings().module_sidebar })];
}

/**
 * Apps inside the HR phone drawer, where the dock is hidden: the shared DIGIT Enterprise app selector (Enterprise Home,
 * enabled DIGIT apps, Desk for administrators) — the same entries as the desktop dock.
 */
function DrawerApps({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return <div className="dhr-drawer-apps-enterprise" data-hr-drawer-apps><EnterpriseDock variant="grid" onNavigate={onNavigate} /></div>;
}

/**
 * DIGIT HR experience sidebar (Core Shell slot): App Dock → HR module rail → the selected module's contextual sidebar on
 * desktop; below md the Core ☰ menu opens one HR drawer holding the dock apps and the HR navigation. The same component
 * serves DIGIT HR screens and native registers/forms opened while DIGIT HR is the active app.
 */
export function HrShellNav({ account, onNavigate }: { account?: ReactNode; onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { tx } = useTx();
  const [collapsed, toggle] = useNavCollapse();
  const drawerRef = useRef<HTMLDivElement>(null);
  // Phone drawer is modal: when the Core menu opens it (data-mobile-open on the slot aside), focus moves inside.
  useEffect(() => {
    const aside = drawerRef.current?.closest("aside");
    if (!aside) return;
    const focusIn = () => { if (aside.hasAttribute("data-mobile-open")) drawerRef.current?.querySelector<HTMLElement>("[data-dhr-nav] a[href], [data-dhr-nav] button")?.focus(); };
    const mo = new MutationObserver(focusIn);
    mo.observe(aside, { attributes: true, attributeFilter: ["data-mobile-open"] });
    return () => mo.disconnect();
  }, []);
  return (
    <>
      <div className="digit-hr sticky top-0 hidden h-screen shrink-0 border-e border-[var(--dhr-border)] md:block" data-hr-shell-nav>
        <HrNav path={path} collapsed={collapsed} onCollapse={toggle} account={account} />
      </div>
      <div className="digit-hr dhr-shell-drawer fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={tx("قائمة الموارد البشرية", "HR menu")} data-hr-drawer>
        <div className="absolute inset-0 bg-[var(--dhr-ink)]/40" onClick={() => onNavigate?.()} data-hr-drawer-backdrop />
        <div ref={drawerRef} className="absolute inset-y-0 start-0 flex max-w-[85vw] flex-col shadow-xl">
          <DrawerApps onNavigate={onNavigate} />
          <div className="min-h-0 flex-1"><HrNav path={path} collapsed={false} onCollapse={() => onNavigate?.()} onNavigate={() => onNavigate?.()} account={account} /></div>
        </div>
      </div>
    </>
  );
}
