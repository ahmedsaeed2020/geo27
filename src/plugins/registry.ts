/** Built-in plugins (src/plugins/<app>/). Adding an app = one import line here; core files stay untouched. All are disabled until enabled in /plugins. */
import type { PluginManifest } from "./types";
import { digitSalesCockpit } from "./digit_sales_cockpit";
import { digitPlatformSmoke } from "./digit_platform_smoke";
import { digitAppTemplate } from "./_template";
import { digitPro } from "./digit_pro";
import { digitHr } from "./digit_hr";
import { digitConstruction } from "./digit_construction";
import { digitCrm } from "./digit_crm";
import { digitCrmDemo } from "./digit_crm/demoSchema";
import { digitFsm } from "./digit_fsm";

/**
 * Read at call time, never at module evaluation: every plugin imports the adapter, and adapter → catalog → runtime → registry
 * closes an import loop. A list built at load time throws "Cannot access … before initialization" whenever the server enters
 * that loop through a plugin module (hot reload, parallel requests), which blanks every page.
 */
export function builtinPlugins(): PluginManifest[] {
  return [digitSalesCockpit, digitPlatformSmoke, digitAppTemplate, digitPro, digitHr, digitConstruction, digitCrm, digitCrmDemo, digitFsm];
}
