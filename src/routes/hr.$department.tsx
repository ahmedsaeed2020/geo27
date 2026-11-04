import { createFileRoute } from '@tanstack/react-router';
import { departmentHead, loadDepartment } from '@/lib/department-route';
import DepartmentRouteView from '@/components/catalog/DepartmentRouteView';

export const Route = createFileRoute('/hr/$department')({
  loader: ({ context, location, params }) => loadDepartment(context.queryClient, location, 'hr', params.department),
  head: ({ loaderData }) => departmentHead(loaderData, false),
  component: Page,
});

function Page() {
  const { path, hr } = Route.useLoaderData();
  return <DepartmentRouteView path={path} hr={hr} />;
}
