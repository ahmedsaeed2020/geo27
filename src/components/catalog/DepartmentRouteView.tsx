import { useCmsPage } from '@/components/cms/CmsContext';
import type { HrModuleContent } from '@/content/hr/hr-modules';
import type { SpecialistDepartment } from '@/content/specialist/types';
import DepartmentPage from './DepartmentPage';

/** Body of a registered department route: the published (or previewed) department document at this path. */
export default function DepartmentRouteView({ path, hr = null, specialist = null }: { path: string; hr?: HrModuleContent | null; specialist?: SpecialistDepartment | null }) {
  const content = useCmsPage();
  return content ? <DepartmentPage content={content} path={path} hr={hr} specialist={specialist} /> : null;
}
