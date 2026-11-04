import { createFileRoute, redirect } from '@tanstack/react-router';

// /hr is the base of the HR department routes; the DIGIT HR overview lives at its existing address.
export const Route = createFileRoute('/hr/')({
  beforeLoad: () => {
    throw redirect({ href: '/modules/hr-payroll', statusCode: 301 });
  },
});
