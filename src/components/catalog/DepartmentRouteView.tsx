import { useCmsPage } from '@/components/cms/CmsContext';
import DepartmentPage from './DepartmentPage';

/** Body of a registered department route: the published (or previewed) department document at this path. */
export default function DepartmentRouteView({ path }: { path: string }) {
  const content = useCmsPage();
  return content ? <DepartmentPage content={content} path={path} /> : null;
}
