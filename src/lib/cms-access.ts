import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { parseConfig } from './site-config-schema';

export type Db = SupabaseClient<Database>;
export type CmsRole = 'owner' | 'editor' | 'sales';

/** Role resolution runs through the caller's own RLS-scoped client, never the admin client. */
export async function resolveAccess(supabase: Db, userId: string) {
  const [content, leads, owner, admin] = await Promise.all([
    supabase.rpc('cms_access', { scope: 'content' }),
    supabase.rpc('cms_access', { scope: 'leads' }),
    supabase.rpc('cms_access', { scope: 'owner' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
  ]);
  const isOwner = !!admin.data || !!owner.data;
  const role: CmsRole | null = isOwner ? 'owner' : content.data ? 'editor' : leads.data ? 'sales' : null;
  return { role, content: !!content.data, leads: !!leads.data, owner: isOwner, admin: !!admin.data };
}

/** Owner-only publishing steps honour the "require authenticator app" security switch. */
export async function assertPublishAllowed(admin: Db, claims: unknown) {
  const { data } = await admin.from('cms_site_config').select('published').eq('key', 'security').maybeSingle();
  const security = parseConfig('security', data?.published);
  if (security.requireMfaForPublish && (claims as { aal?: string }).aal !== 'aal2') {
    throw new Error('Verify your authenticator app before publishing');
  }
}

export async function audit(admin: Db, actor: string, action: string, entity: string, entityId: string) {
  await admin.from('cms_audit').insert({ actor_id: actor, action, entity, entity_id: entityId });
}
