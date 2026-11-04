// Every real product screen a CMS document may reference: the 49 DIGIT Pro shots plus the 16 DIGIT HR shots.
// Pro surfaces keep reading SHOTS directly; editors, department pages and server validation use this union.
import { SHOTS, type Shot } from '@/content/product-shots';
import { HR_SHOTS } from '@/content/hr/hr-shots';

export const ALL_SHOTS: Record<string, Shot> = { ...SHOTS, ...HR_SHOTS };

export const screenById = (id: string): Shot | undefined => (id ? ALL_SHOTS[id] : undefined);

/** Editor option groups, so HR and Pro screens are never confused in a picker. */
export const SHOT_GROUPS: { label: string; shots: Shot[] }[] = [
  { label: 'DIGIT HR', shots: Object.values(HR_SHOTS) },
  { label: 'DIGIT Pro', shots: Object.values(SHOTS) },
];
