import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/en/hr/')({
  beforeLoad: () => {
    throw redirect({ href: '/en/modules/hr-payroll', statusCode: 301 });
  },
});
