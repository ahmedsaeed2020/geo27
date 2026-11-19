import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { audit, resolveAccess } from './cms-access';
import { integrationSettingsSchema, leadAttribution } from './marketing';
import type { Json } from '@/integrations/supabase/types';

export const getIntegrationSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.owner) throw new Error('Forbidden');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.from('cms_config').select('value').eq('key', 'marketing_integrations').maybeSingle();
    if (error) throw new Error('Could not load settings');
    const parsed = integrationSettingsSchema.safeParse(data?.value ?? {});
    return parsed.success ? parsed.data : integrationSettingsSchema.parse({});
  });

export const saveIntegrationSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(integrationSettingsSchema)
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.owner) throw new Error('Forbidden');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('cms_config').upsert({ key: 'marketing_integrations', value: data as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error('Could not save settings');
    await audit(supabaseAdmin, context.userId, 'settings:saved', 'integration', 'marketing_integrations');
    // Identifiers are preparation only; saving never activates tracking or sends leads externally.
    return { saved: true };
  });

export const getCampaignInsights = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.leads && !access.owner) throw new Error('Forbidden');
    const groups = new Map<string, { source: string; campaign: string; leads: number; won: number }>();
    let total = 0;
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await context.supabase.from('contact_requests').select('id, utm, referrer, status').order('id').range(offset, offset + 499);
      if (error) throw new Error('Could not load campaign insights');
      for (const row of data ?? []) {
        const { source, campaign } = leadAttribution(row.utm, row.referrer);
        const key = JSON.stringify([source, campaign]);
        const group = groups.get(key) ?? { source, campaign, leads: 0, won: 0 };
        group.leads++;
        if (row.status === 'won') group.won++;
        groups.set(key, group);
        total++;
      }
      if (!data || data.length < 500) break;
    }
    return { total, groups: [...groups.values()].sort((a, b) => b.leads - a.leads) };
  });