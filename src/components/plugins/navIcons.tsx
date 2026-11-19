/**
 * Icon keys a manifest navigation group may name (`icon`) for the module rail → the owner's official DIGIT icons
 * (src/components/enterprise/iconMap.ts). Unknown keys fall back to the dashboard icon. `on="dark"` = light-on-dark
 * artwork for the green navigation surfaces; otherwise the tone follows the page (DigitIcon).
 */
import { DigitIcon } from "@/components/enterprise/DigitIcon";
import { RAIL_MODULE_ICON } from "@/components/enterprise/iconMap";

export function NavIcon({ name, className, on, size = 18 }: { name?: string | undefined; className?: string; on?: "light" | "dark"; size?: number }) {
  const icon = (name && RAIL_MODULE_ICON[name]) || "ui-dashboard";
  return <DigitIcon name={icon} on={on ?? "light"} size={size} className={className ?? "dx-nav-ico"} />;
}
