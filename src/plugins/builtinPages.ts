/** Registers the virtual page components of built-in apps (src/plugins/pages.ts). Imported only by the page host. */
import { registerConstructionPages } from "./digit_construction/ui/register";
import { registerFsmPages } from "./digit_fsm/ui/register";

registerConstructionPages();
registerFsmPages();
