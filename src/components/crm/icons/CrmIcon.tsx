import { createElement, type ReactNode } from "react";
import source from "./source.json";

type SvgNode = { tag: string; attrs: Record<string, string>; children: SvgNode[] };
export type CrmIconName = keyof typeof source;
export const CRM_ICON_NAMES = Object["keys"](source) as CrmIconName[];
type IconProps = { name: CrmIconName; className?: string; status?: string; priority?: string; fill?: boolean; radius?: number };

/** Port source template data, including the four declarative prop variants; never execute Vue expressions. */
export function CrmIcon({ name, className = "h-4 w-4 shrink-0", status = "", priority = "", fill = false, radius = 3.5 }: IconProps) {
  function render(nodes: SvgNode[], root = false): ReactNode[] {
    let matched = false;
    return nodes["map"]((node, index) => {
      const attrs: Record<string, unknown> = { key: index };
      let show = true;
      for (const [key, value] of Object["entries"](node["attrs"])) {
        if (key === "v-if" || key === "v-else-if") {
          const equals = /^status == '([^']+)'$/["exec"](value);
          const condition = equals ? status === equals[1] : value === "!fill" ? !fill : value === "status" ? Boolean(status) : false;
          show = key === "v-if" ? condition : !matched && condition;
          if (show) matched = true;
        } else if (key === "v-else") { show = !matched; matched = true; }
        else if (key === "bind_r") attrs["r"] = radius;
        else if (key === "bind_aria-label") attrs["aria-label"] = status;
        else if (key === "bind_class" && value["startsWith"]("barClass(")) {
          const bar = Number(value["match"](/\d+/)?.[0]);
          const faded = ({ High: 0, Medium: 1, Low: 2 } as Record<string, number>)[priority] ?? 3;
          attrs["className"] = bar < faded ? "fill-crm-line" : "fill-crm-muted";
        } else if (key === "bind_class") attrs["className"] = className;
        else if (key === "style") attrs["style"] = Object.fromEntries(value.split(";").filter(Boolean).map(rule => { const split = rule.indexOf(":"); return [rule.slice(0, split).trim().replace(/-([a-z])/g, (_, char: string) => char.toUpperCase()), rule.slice(split + 1).trim()]; }));
        else attrs[key === "{http://www.w3.org/1999/xlink}href" ? "xlinkHref" : key === "flood-opacity" ? "floodOpacity" : key === "enable-background" ? "enableBackground" : key] = value;
      }
      if (!show) return null;
      if (root) attrs["className"] = className;
      if (root && node["tag"] === "svg" && !attrs["aria-label"]) attrs["aria-hidden"] = true;
      return createElement(node["tag"], attrs, ...render(node["children"]));
    });
  }
  return <>{render(source[name] as SvgNode[], true)}</>;
}