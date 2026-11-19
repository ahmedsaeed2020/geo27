import { migrateFsmVisits } from "./visitNative";
/** Runtime boot of DIGIT FSM + ITM: controller hooks on the shared adapter and the demo installer. Imported by src/plugins/builtinBoot.ts. */
import { adapter } from "@/lib/adapter";
import { registerVolumeProvider, volumeEnabled } from "@/lib/volume";
import { isEnabled, registerAppRuntime, subscribePlugins } from "../runtime";
import { installFsmHooks } from "./domain/hooks";
import { fsmVolume, installFsmDemoV2 } from "./demo/install";
import { isFsmFrappeHost } from "./host";
import { FSM_APP } from "./index";
import { installFsmDemo } from "./seed"; // v1: the acceptance-test fixture (tests enable the app and run its installer)

installFsmHooks();
if (!isFsmFrappeHost()) migrateFsmVisits();
// demo v2 (relative to today) is part of the memory-only sample layer; on Frappe (/digit-fsm) records belong to the server
registerVolumeProvider(FSM_APP, fsmVolume, () => isEnabled(FSM_APP) && !isFsmFrappeHost());
registerAppRuntime(FSM_APP, { install_demo: () => (isFsmFrappeHost() ? 0 : import.meta.env?.MODE === "test" ? installFsmDemo() : adapter.get("FSM Settings", "FSM Settings")?.["__fsm_demo"] === 2 ? 0 : installFsmDemoV2()) });
// a browser without the sample layer (switched off) or whose store was reset gets the connected demo back (insert-if-missing)
if (typeof window !== "undefined" && import.meta.env?.MODE !== "test") {
  const ensure = () => { if (!isFsmFrappeHost() && isEnabled(FSM_APP)) migrateFsmVisits(); if (!isFsmFrappeHost() && isEnabled(FSM_APP) && !volumeEnabled() && !adapter.get("FSM Settings", "FSM Settings")) installFsmDemoV2(); };
  setTimeout(ensure, 0);
  subscribePlugins(ensure);
}
