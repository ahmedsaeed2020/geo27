/** All calculated HR KPIs share the Core metric row contract. */
import { hrMetric, HR_METRICS } from '../hrMetrics';
export const KPI_FN = Object.fromEntries(Object.keys(HR_METRICS).map(label => [label, () => hrMetric(label).value]));
export function kpiValue(label: string): number | null { return hrMetric(label).value; }
