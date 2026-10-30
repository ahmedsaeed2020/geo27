import { z } from 'zod';
export const LEAD_RECIPIENT = 'a.saeed@trilogy.com.sa';
export const leadSchema = z.object({
  name: z.string().trim().min(2).max(100), company: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(255).or(z.literal('')),
  phone: z.string().trim().max(30).refine(v => !v || /^\+?[\d ()-]{8,30}$/.test(v)),
  interest: z.string().trim().max(180), requestType: z.enum(['demo','consultation','scope']),
  jobRole: z.string().trim().max(120), message: z.string().trim().max(2000),
  locale: z.enum(['ar','en']), pagePath: z.string().startsWith('/').max(300),
  industry: z.string().max(120).default(''), referrer: z.string().max(1000).default(''),
  utm: z.record(z.string().max(300)).default({}), consent: z.literal(true),
  website: z.string().max(200).default(''),
}).refine(v => !!v.email || !!v.phone, { message: 'A contact channel is required', path: ['email'] });
export type LeadInput = z.infer<typeof leadSchema>;