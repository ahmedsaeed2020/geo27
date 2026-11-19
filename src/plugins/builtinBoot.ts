/** Boots runtime parts (doc hooks, demo installers) of built-in apps. Imported once from src/routes/__root.tsx after the Core seed modules. */
import "./digit_construction/boot";
import "./digit_fsm/boot";
import "./digit_hr/boot";
import "./digit_pro/boot";
import { initializeCrmPresentation } from "./digit_crm/shell";

initializeCrmPresentation();
