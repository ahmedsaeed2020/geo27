import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { Json } from '@/integrations/supabase/types';
import { assertPublishAllowed, audit, resolveAccess, sha256Hex, type Db } from './cms-access';
import { CONFIG_SCHEMAS, SITE_CONFIG_KEYS, parseConfig } from './site-config-schema';
import { normalizeRedirectSource, normalizeRedirectTarget, resolveFinalTarget, targetPath } from './redirect-rules';

/* ----------------------------- Team & roles ----------------------------- */

async function ownerCount(admin: Db): Promise<number> {
  const [{ count: owners }, { count: admins }] = await Promise.all([
    admin.from('cms_members').select('user_id', { count: 'exact', head: true }).eq('role', 'owner'),
    admin.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin'),
  ]);
  return (owners ?? 0) + (admins ?? 0);
}

export const setCmsRole = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({ email: z.string().trim().email().max(255).optional(), userId: z.string().uuid().optional(), role: z.enum(['owner', 'editor', 'sales']) })
      .refine(v => !!v.email || !!v.userId, { message: 'Enter the account email' }),
  )
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.owner) throw new Error('Forbidden');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let userId = data.userId;
    if (!userId && data.email) {
      const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw new Error('Could not read accounts');
      userId = users.users.find(u => u.email?.toLowerCase() === data.email?.toLowerCase())?.id;
      if (!userId) throw new Error('No account uses this email. Create the account first, then grant the role.');
    }
    if (!userId) throw new Error('Account not found');
    const { data: isAdmin } = await supabaseAdmin.from('user_roles').select('user_id').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (isAdmin) throw new Error('This account is already the site owner');
    const { data: current } = await supabaseAdmin.from('cms_members').select('role').eq('user_id', userId).maybeSingle();
    if (current?.role === 'owner' && data.role !== 'owner' && (await ownerCount(supabaseAdmin)) <= 1) throw new Error('Keep at least one owner');
    const { error } = await supabaseAdmin.from('cms_members').upsert({ user_id: userId, role: data.role });
    if (error) throw new Error('Could not save the role');
    await audit(supabaseAdmin, context.userId, `role:${data.role}`, 'member', userId);
    return { saved: true, userId };
  });

export const removeCmsRole = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.owner) throw new Error('Forbidden');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: member } = await supabaseAdmin.from('cms_members').select('role').eq('user_id', data.userId).maybeSingle();
    if (!member) throw new Error('This account has no editable role');
    if (member.role === 'owner' && (await ownerCount(supabaseAdmin)) <= 1) throw new Error('Keep at least one owner');
    const { error } = await supabaseAdmin.from('cms_members').delete().eq('user_id', data.userId);
    if (error) throw new Error('Could not remove the role');
    await supabaseAdmin.from('contact_requests').update({ assigned_to: null }).eq('assigned_to', data.userId);
    await audit(supabaseAdmin, context.userId, 'role:removed', 'member', data.userId);
    return { removed: true };
  });

/* ------------------------- Visitor chat transcripts ------------------------- */

export const listChatThreads = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed } = await context.supabase.rpc('cms_access', { scope: 'leads' });
    if (!allowed) throw new Error('Forbidden');
    const { data, error } = await context.supabase
      .from('chat_threads')
      .select('id, created_at, updated_at, locale, title, chat_messages(count)')
      .order('updated_at', { ascending: false })
      .limit(300);
    if (error) throw new Error('Could not load conversations');
    return (data ?? []).map(t => ({
      id: t.id,
      created_at: t.created_at,
      updated_at: t.updated_at,
      locale: t.locale,
      title: t.title,
      messages: (t.chat_messages as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }));
  });

export const getChatTranscript = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ threadId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc('cms_access', { scope: 'leads' });
    if (!allowed) throw new Error('Forbidden');
    const { data: rows, error } = await context.supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('thread_id', data.threadId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw new Error('Could not load the conversation');
    return rows ?? [];
  });

/* -------------------------------- Redirects -------------------------------- */

export const saveRedirect = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid().optional(),
      from: z.string().max(600),
      to: z.string().max(600),
      status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
      enabled: z.boolean(),
      note: z.string().trim().max(300).default(''),
    }),
  )
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.owner) throw new Error('Only the owner can change redirects');
    const from = normalizeRedirectSource(data.from);
    if (!from) throw new Error('Enter a valid old path such as /old-page');
    const target = normalizeRedirectTarget(data.to);
    if (!target) throw new Error('Enter an internal path such as /modules/sales or an https:// address');
    if (targetPath(target.value) === from) throw new Error('A redirect cannot point to itself');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: rules } = await supabaseAdmin.from('cms_redirects').select('id, from_path, to_path, enabled');
    const others = (rules ?? []).filter(r => r.id !== data.id);
    if (others.some(r => r.from_path === from)) throw new Error('A redirect for this path already exists');
    const final = resolveFinalTarget(from, target.value, others);
    if (!final) throw new Error('This redirect would create a loop');
    const now = new Date().toISOString();
    const row = { from_path: from, to_path: final, status_code: data.status, enabled: data.enabled, note: data.note, updated_at: now };
    const result = data.id
      ? await supabaseAdmin.from('cms_redirects').update(row).eq('id', data.id).select().single()
      : await supabaseAdmin.from('cms_redirects').insert({ ...row, created_by: context.userId }).select().single();
    if (result.error) throw new Error('Could not save the redirect');
    // Flatten chains: earlier rules that pointed at this old path now point straight to the final destination.
    const pointing = others.filter(r => targetPath(r.to_path) === from);
    for (const r of pointing) await supabaseAdmin.from('cms_redirects').update({ to_path: final, updated_at: now }).eq('id', r.id);
    await audit(supabaseAdmin, context.userId, data.id ? 'redirect:update' : 'redirect:create', 'redirect', result.data.id);
    return { saved: true, flattened: pointing.length, to: final };
  });

export const deleteRedirect = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.owner) throw new Error('Only the owner can change redirects');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('cms_redirects').delete().eq('id', data.id);
    if (error) throw new Error('Could not delete the redirect');
    await audit(supabaseAdmin, context.userId, 'redirect:delete', 'redirect', data.id);
    return { deleted: true };
  });

/* ------------------------------ Site settings ------------------------------ */

export const saveSiteConfig = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      key: z.enum(SITE_CONFIG_KEYS),
      value: z.unknown(),
      version: z.number().int().min(0),
      action: z.enum(['save', 'publish', 'unpublish']),
    }),
  )
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.content) throw new Error('Forbidden');
    if ((data.action !== 'save' || data.key === 'security' || data.key === 'branding') && !access.owner) {
      throw new Error('This change requires the site owner');
    }
    const schema = CONFIG_SCHEMAS[data.key] as z.ZodTypeAny;
    const parsed = schema.safeParse(data.value);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid settings');
    const value = parsed.data as Record<string, unknown>;
    const json = value as unknown as Json;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    if (data.action !== 'save' || data.key === 'security') await assertPublishAllowed(supabaseAdmin, context.claims);
    if (data.key === 'security' && value['requireMfaForPublish'] && (context.claims as { aal?: string }).aal !== 'aal2') {
      throw new Error('Verify your authenticator app in this session before requiring it');
    }
    if (data.key === 'branding') {
      const refs = [value['logoUrl'], value['faviconUrl']].filter((v): v is string => typeof v === 'string' && v !== '');
      if (refs.length) {
        const { data: approved } = await supabaseAdmin.from('cms_media').select('url, mime').in('url', refs).eq('approval', 'approved').is('archived_at', null);
        if ((approved ?? []).length !== new Set(refs).size) throw new Error('Use approved library images for the logo and icon');
        const icon = approved?.find(m => m.url === value['faviconUrl']);
        if (icon && icon.mime && icon.mime !== 'image/png') throw new Error('The browser icon must be a PNG image');
      }
    }
    const now = new Date().toISOString();
    // Security settings take effect immediately; other settings keep a draft until published.
    const immediate = data.key === 'security';
    const patch = {
      draft: json,
      updated_by: context.userId,
      updated_at: now,
      version: data.version + 1,
      ...(data.action === 'publish' || immediate ? { published: json, published_at: now } : {}),
      ...(data.action === 'unpublish' ? { published: null } : {}),
    };
    const result =
      data.version === 0
        ? await supabaseAdmin.from('cms_site_config').insert({ key: data.key, ...patch }).select().single()
        : await supabaseAdmin.from('cms_site_config').update(patch).eq('key', data.key).eq('version', data.version).select().single();
    if (result.error) throw new Error('Someone else changed these settings. Refresh before retrying.');
    await audit(supabaseAdmin, context.userId, `config:${data.action}`, 'config', data.key);
    return result.data;
  });

export const getConfigHistory = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ key: z.enum(SITE_CONFIG_KEYS) }))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc('cms_access', { scope: 'content' });
    if (!allowed) throw new Error('Forbidden');
    const { data: rows, error } = await context.supabase
      .from('cms_config_revisions')
      .select('*')
      .eq('config_key', data.key)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error('Could not load history');
    return (rows ?? []).map(r => {
      const snap = r.snapshot as { draft?: unknown; published?: unknown };
      return { id: r.id, action: r.action, created_at: r.created_at, author_id: r.author_id, value: parseConfig(data.key, snap.draft ?? snap.published) };
    });
  });

/* ------------------------------ Preview links ------------------------------ */

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const createPreviewLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: z.string().uuid(), hours: z.number().int().min(1).max(168) }))
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.content) throw new Error('Forbidden');
    const { data: doc } = await context.supabase.from('cms_documents').select('id, path').eq('id', data.documentId).maybeSingle();
    if (!doc) throw new Error('Save the page before sharing a preview');
    const token = randomToken();
    const expiresAt = new Date(Date.now() + data.hours * 3_600_000).toISOString();
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('cms_preview_tokens')
      .insert({ token_hash: await sha256Hex(token), document_id: doc.id, created_by: context.userId, expires_at: expiresAt });
    if (error) throw new Error('Could not create the preview link');
    await audit(supabaseAdmin, context.userId, 'preview:create', 'document', doc.id);
    return { token, path: doc.path, expiresAt };
  });

export const revokePreviewLinks = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.content) throw new Error('Forbidden');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('cms_preview_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('document_id', data.documentId)
      .is('revoked_at', null);
    if (error) throw new Error('Could not revoke preview links');
    await audit(supabaseAdmin, context.userId, 'preview:revoke', 'document', data.documentId);
    return { revoked: true };
  });
