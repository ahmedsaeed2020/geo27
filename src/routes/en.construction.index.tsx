import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/en/construction/')({
  beforeLoad: () => {
    throw redirect({ href: '/en/modules/contracting', statusCode: 301 });
  },
});
