import { createFileRoute, redirect } from '@tanstack/react-router';

// /construction is the base of the Construction department routes; the overview lives at its existing address.
export const Route = createFileRoute('/construction/')({
  beforeLoad: () => {
    throw redirect({ href: '/modules/contracting', statusCode: 301 });
  },
});
