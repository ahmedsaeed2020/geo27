import sitesTeams from '@/assets/geointime/sites-teams.webp.asset.json';
import presenceSite from '@/assets/geointime/presence-site.webp.asset.json';
import tasksExecution from '@/assets/geointime/tasks-execution.webp.asset.json';
import bandSites from '@/assets/geointime/band-sites.webp.asset.json';
import bandEvidence from '@/assets/geointime/band-evidence.webp.asset.json';
import bandOvertime from '@/assets/geointime/band-overtime.webp.asset.json';
import arrival from '@/assets/geointime/arrival.webp.asset.json';
import warehouseTeam from '@/assets/geointime/warehouse-team.webp.asset.json';
import decisionSupervisor from '@/assets/geointime/decision-supervisor.webp.asset.json';
import siteWalk from '@/assets/geointime/site-walk.webp.asset.json';
import hrManager from '@/assets/geointime/hr-manager.webp.asset.json';
import logo from '@/assets/geointime/logo.png.asset.json';
import logoOnDark from '@/assets/geointime/logo-on-dark.png.asset.json';
import uiOperations from '@/assets/geointime/ui-operations.webp.asset.json';
import uiMap from '@/assets/geointime/ui-map.webp.asset.json';
import uiHr from '@/assets/geointime/ui-hr.webp.asset.json';
import uiTime from '@/assets/geointime/ui-time.webp.asset.json';
import uiLocation from '@/assets/geointime/ui-location.webp.asset.json';
import uiOvertime from '@/assets/geointime/ui-overtime.webp.asset.json';
import uiPayroll from '@/assets/geointime/ui-payroll.webp.asset.json';
import uiTasks from '@/assets/geointime/ui-tasks.webp.asset.json';
import uiEvidence from '@/assets/geointime/ui-evidence.webp.asset.json';
import type { GeoGroup, GeoPhoto, GeoScreen } from '@/content/geointime';

/** Approved GeoInTime atlas characters (generated photographs) with their natural sizes. */
export const HERO_CIRCLES = [
  { src: sitesTeams.url, width: 1024, height: 1024 },
  { src: presenceSite.url, width: 1024, height: 1024 },
  { src: tasksExecution.url, width: 1024, height: 1024 },
] as const;

export const BAND_PHOTOS: Record<GeoPhoto, { src: string; width: number; height: number }> = {
  'band-sites': { src: bandSites.url, width: 1920, height: 800 },
  arrival: { src: arrival.url, width: 1920, height: 1088 },
  'band-evidence': { src: bandEvidence.url, width: 1920, height: 800 },
  'band-overtime': { src: bandOvertime.url, width: 1920, height: 800 },
};

/** Circle tabs of the product section; portrait photos are framed on the people, never stretched. */
export const GROUP_PHOTOS: Record<GeoGroup, { src: string; width: number; height: number; position: string }> = {
  operations: { src: siteWalk.url, width: 1152, height: 1536, position: '50% 30%' },
  hr: { src: hrManager.url, width: 1088, height: 1920, position: '62% 28%' },
  tasks: { src: tasksExecution.url, width: 1024, height: 1024, position: '50% 40%' },
};

/** Authentic GeoInTime interface captures from the owner's V5 content file. */
export const SCREENS: Record<GeoScreen, string> = {
  'ui-operations': uiOperations.url, 'ui-map': uiMap.url, 'ui-hr': uiHr.url, 'ui-time': uiTime.url, 'ui-location': uiLocation.url,
  'ui-overtime': uiOvertime.url, 'ui-payroll': uiPayroll.url, 'ui-tasks': uiTasks.url, 'ui-evidence': uiEvidence.url,
};

export const MEDIA = {
  warehouseTeam: { src: warehouseTeam.url, width: 1024, height: 1024 },
  decision: { src: decisionSupervisor.url, width: 1024, height: 1024 },
  logo: { src: logo.url, width: 2048, height: 615 },
  logoOnDark: { src: logoOnDark.url, width: 2048, height: 615 },
} as const;
