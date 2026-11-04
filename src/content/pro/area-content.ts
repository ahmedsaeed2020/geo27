// Source content of the four cross-department DIGIT Pro pages, imported statically so SSR and hydration render
// the same sections (the /pro/<area> routes load only this module, not the department pages' content).
import type { ProPageContent } from './types';
import dashboards from './pages/dashboards';
import governance from './pages/governance';
import capabilities from './pages/capabilities';
import cfo from './pages/cfo';

export const PRO_AREA_CONTENT: Partial<Record<string, ProPageContent>> = { dashboards, governance, capabilities, cfo };
