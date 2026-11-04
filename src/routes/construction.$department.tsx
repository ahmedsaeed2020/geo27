import { createFileRoute } from '@tanstack/react-router';
import { departmentHead, loadDepartment } from '@/lib/department-route';
import DepartmentRouteView from '@/components/catalog/DepartmentRouteView';

export const Route = createFileRoute('/construction/$department')({
  loader: ({ context, location, params }) => loadDepartment(context.queryClient, location, 'construction', params.department),
  head: ({ loaderData }) => departmentHead(loaderData, false),
  component: Page,
});

function Page() {
  const { path, specialist } = Route.useLoaderData();
  return <DepartmentRouteView path={path} specialist={specialist} />;
}
