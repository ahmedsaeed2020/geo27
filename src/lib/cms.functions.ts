import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import sanitizeHtml from 'sanitize-html';
import type { Database } from '@/integrations/supabase/types';
import { cmsContentSchema, departmentPublishIssues, safePath, type PublishedRecord } from './cms-schema';
import { departmentById } from '@/content/catalog';
import { ALL_SHOTS as SHOTS } from '@/content/screens';
import { hrModuleBySlug } from '@/content/hr/hr-modules';
import { DEFAULT_SITE_CONFIG, PUBLIC_CONFIG_KEYS, parseConfig, type SiteConfig } from './site-config-schema';
import { normalizeRedirectSource } from './redirect-rules';
import { assertPublishAllowed, audit, resolveAccess, sha256Hex, type CmsRole, type Db } from './cms-access';

/** Publishable-key client for public reads during SSR; opaque sb_ keys travel only as apikey. */
function publicClient(): Db {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  const endpoint = process.env['SUPABASE_URL'];
  if (!key || !endpoint) throw new Error('Content service unavailable');
  return createClient<Database>(endpoint, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization');
        h.set('apikey', key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function readPublishedRecords(client: Db): Promise<PublishedRecord[]> {
  const { data, error } = await client.rpc('cms_published');
  if (error) throw new Error('Content service unavailable');
  const rows: PublishedRecord[] = [];
  for (const row of data ?? []) {
    const parsed = cmsContentSchema.safeParse(row.published);
    if (parsed.success) rows.push({ path: row.path, kind: row.kind, published: parsed.data, published_at: row.published_at });
  }
  return rows;
}

export const getPublishedContent = createServerFn({ method: 'GET' }).handler(async (): Promise<PublishedRecord[]> => {
  return readPublishedRecords(publicClient());
});

export type PublicMedia = { url: string; width: number | null; height: number | null; focalX: number; focalY: number };
export type PublishedSite = { records: PublishedRecord[]; config: SiteConfig; media: PublicMedia[] };

export const getPublishedSite = createServerFn({ method: 'GET' }).handler(async (): Promise<PublishedSite> => {
  const client = publicClient();
  const [records, settings, media] = await Promise.all([readPublishedRecords(client), client.rpc('cms_site_published'), client.rpc('cms_media_public')]);
  const config: SiteConfig = { ...DEFAULT_SITE_CONFIG };
  for (const row of settings.data ?? []) {
    const key = row.key as (typeof PUBLIC_CONFIG_KEYS)[number];
    if (PUBLIC_CONFIG_KEYS.includes(key)) (config as Record<string, unknown>)[key] = parseConfig(key, row.published);
  }
  // Image dimensions are an enhancement: if unavailable, pages still render with their default frames.
  const mediaRows = (media.data ?? []).map(m => ({ url: m.url, width: m.width, height: m.height, focalX: m.focal_x ?? 50, focalY: m.focal_y ?? 50 }));
  return { records, config, media: mediaRows };
});

export type PreviewResult = { status: 'ok'; record: PublishedRecord; expiresAt: string } | { status: 'invalid' };
export const PREVIEW_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Public: the unguessable, expiring token is the credential. Only the draft of the token's own document is returned. */
export const getPreviewRecord = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ token: z.string().max(64) }))
  .handler(async ({ data }): Promise<PreviewResult> => {
    if (!PREVIEW_TOKEN.test(data.token)) return { status: 'invalid' };
    const hash = await sha256Hex(data.token);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: token } = await supabaseAdmin
      .from('cms_preview_tokens')
      .select('document_id, expires_at, revoked_at')
      .eq('token_hash', hash)
      .maybeSingle();
    if (!token || token.revoked_at || new Date(token.expires_at).getTime() <= Date.now()) return { status: 'invalid' };
    const { data: doc } = await supabaseAdmin.from('cms_documents').select('path, kind, draft').eq('id', token.document_id).maybeSingle();
    const draft = cmsContentSchema.safeParse(doc?.draft);
    if (!doc || !draft.success) return { status: 'invalid' };
    await supabaseAdmin.from('cms_preview_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', hash);
    return { status: 'ok', expiresAt: token.expires_at, record: { path: doc.path, kind: doc.kind, published: draft.data, published_at: null } };
  });

/** Public: resolves an owner-managed redirect for an unknown path and counts the hit. */
export const resolveRedirect = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ path: z.string().max(600) }))
  .handler(async ({ data }): Promise<{ to: string; status: 301 | 302 | 307 | 308 } | null> => {
    const path = normalizeRedirectSource(data.path);
    if (!path) return null;
    const { data: rows, error } = await publicClient().rpc('cms_resolve_redirect', { p_path: path });
    const row = rows?.[0];
    if (error || !row) return null;
    const status = [301, 302, 307, 308].includes(row.status_code) ? (row.status_code as 301 | 302 | 307 | 308) : 301;
    return { to: row.to_path, status };
  });

export const cmsWorkspace = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.role) throw new Error('Forbidden');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    if (access.content) await supabaseAdmin.rpc('cms_apply_schedules');
    const none = { data: [] as never[] };
    const [docs, media, leads, audit, redirects, config, previews] = await Promise.all([
      access.content ? context.supabase.from('cms_documents').select('*').order('path') : none,
      access.content ? context.supabase.from('cms_media').select('*').order('created_at', { ascending: false }) : none,
      access.leads ? context.supabase.from('contact_requests').select('*').order('created_at', { ascending: false }).limit(500) : none,
      context.supabase.from('cms_audit').select('*').order('created_at', { ascending: false }).limit(150),
      access.content ? context.supabase.from('cms_redirects').select('*').order('from_path') : none,
      context.supabase.from('cms_site_config').select('*'),
      access.content
        ? context.supabase
            .from('cms_preview_tokens')
            .select('document_id, expires_at, revoked_at, created_at, last_used_at, created_by')
            .is('revoked_at', null)
            .gt('expires_at', new Date().toISOString())
        : none,
    ]);
    // Team directory: owners manage roles; sales see teammates to assign leads. Emails come from the auth admin API.
    let team: { user_id: string; email: string; role: CmsRole | 'admin'; last_sign_in_at: string | null }[] = [];
    if (access.owner || access.leads) {
      const [{ data: members }, { data: admins }, { data: users }] = await Promise.all([
        supabaseAdmin.from('cms_members').select('user_id, role'),
        supabaseAdmin.from('user_roles').select('user_id').eq('role', 'admin'),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
      ]);
      const emails = new Map((users?.users ?? []).map(u => [u.id, { email: u.email ?? '', last: u.last_sign_in_at ?? null }]));
      const seen = new Set<string>();
      for (const a of admins ?? []) {
        seen.add(a.user_id);
        team.push({ user_id: a.user_id, email: emails.get(a.user_id)?.email ?? '', role: 'admin', last_sign_in_at: emails.get(a.user_id)?.last ?? null });
      }
      for (const m of members ?? []) {
        if (seen.has(m.user_id)) continue;
        team.push({ user_id: m.user_id, email: emails.get(m.user_id)?.email ?? '', role: m.role as CmsRole, last_sign_in_at: emails.get(m.user_id)?.last ?? null });
      }
      if (!access.owner) team = team.map(t => ({ ...t, last_sign_in_at: null }));
    }
    return {
      role: access.role,
      userId: context.userId,
      aal: (context.claims as { aal?: string }).aal ?? 'aal1',
      docs: docs.data ?? [],
      media: media.data ?? [],
      leads: leads.data ?? [],
      audit: audit.data ?? [],
      redirects: redirects.data ?? [],
      config: config.data ?? [],
      previews: previews.data ?? [],
      team,
    };
  });

export type Workspace = Awaited<ReturnType<typeof cmsWorkspace>>;

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'span', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['https', 'mailto', 'tel'],
};

const iso = z.string().datetime({ offset: true });

export const saveCmsDocument = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid().optional(),
      path: safePath,
      kind: z.string().max(40),
      content: cmsContentSchema,
      version: z.number().int().optional(),
      action: z.enum(['save', 'review', 'publish', 'unpublish', 'rollback', 'schedule', 'unschedule']).default('save'),
      publishAt: iso.nullable().optional(),
      unpublishAt: iso.nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context.supabase, context.userId);
    if (!access.content) throw new Error('Forbidden');
    const ownerStep = ['publish', 'unpublish', 'rollback', 'schedule', 'unschedule'].includes(data.action);
    if (ownerStep && !access.owner) throw new Error('Publishing requires owner approval');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    if (ownerStep) await assertPublishAllowed(supabaseAdmin, context.claims);

    const content = cmsContentSchema.parse(data.content);
    const urlsFromDepartment = new Set<string>();
    for (const locale of ['ar', 'en'] as const) {
      for (const [id, html] of Object.entries(content[locale].sourceEdits)) content[locale].sourceEdits[id] = sanitizeHtml(html, SANITIZE);
      for (const b of content[locale].blocks) {
        const hrefs = [b.href, ...b.items.map(i => i.href)].filter(Boolean);
        if (hrefs.some(h => !safePath.safeParse(h).success)) throw new Error('Use a valid internal page link');
        const shots = [b.shotId, ...b.shots, ...b.items.map(i => i.shotId)].filter(Boolean);
        if (shots.some(id => !SHOTS[id])) throw new Error('Unknown product screen');
        if (b.type === 'source') {
          const source = content.department?.product === 'hr' ? hrModuleBySlug(content.department.id) : undefined;
          if (!source?.sections.some(s => s.id === b.ref)) throw new Error('Unknown source section');
        }
      }
    }
    if (content.department) {
      // A department document belongs to exactly one registered catalog route.
      const registered = departmentById(content.department.product, content.department.id);
      if (!registered || registered.path !== data.path) throw new Error('Department does not match its registered route');
      if (content.department.heroShot && !SHOTS[content.department.heroShot]) throw new Error('Unknown product screen');
      if (content.department.heroMedia) urlsFromDepartment.add(content.department.heroMedia);
    }
    const goesLive = data.action === 'publish' || data.action === 'rollback' || (data.action === 'schedule' && !!data.publishAt);
    if (goesLive && content.evidence !== 'approved') throw new Error('Evidence approval is required before publishing');
    if (goesLive && content.department) {
      const issues = departmentPublishIssues(content);
      if (issues.length) throw new Error(`Department page is not ready: ${issues.join('، ')}`);
    }

    const urls = new Set<string>();
    for (const locale of ['ar', 'en'] as const) for (const b of content[locale].blocks) if (b.mediaUrl) urls.add(b.mediaUrl);
    if (content.ogImage.startsWith('/api/public/cms-media/')) urls.add(content.ogImage);
    urlsFromDepartment.forEach(u => urls.add(u));
    if (urls.size) {
      const { data: approved } = await supabaseAdmin.from('cms_media').select('url').in('url', [...urls]).eq('approval', 'approved').is('archived_at', null);
      const ok = new Set((approved ?? []).map(m => m.url));
      if ([...urls].some(u => !ok.has(u))) throw new Error('Use an approved library image');
    }

    const now = new Date().toISOString();
    let schedule: Record<string, unknown> = {};
    if (data.action === 'schedule') {
      const publishAt = data.publishAt ?? null;
      const unpublishAt = data.unpublishAt ?? null;
      if (!publishAt && !unpublishAt) throw new Error('Choose a publish or unpublish time');
      if (publishAt && new Date(publishAt).getTime() <= Date.now() + 60_000) throw new Error('Choose a publish time at least one minute ahead');
      if (unpublishAt && new Date(unpublishAt).getTime() <= Date.now() + 60_000) throw new Error('Choose an unpublish time at least one minute ahead');
      if (publishAt && unpublishAt && new Date(unpublishAt) <= new Date(publishAt)) throw new Error('Unpublish time must be after the publish time');
      schedule = publishAt
        ? { scheduled: content, publish_at: publishAt, scheduled_by: context.userId, unpublish_at: unpublishAt }
        : { unpublish_at: unpublishAt };
    }
    if (data.action === 'unschedule') schedule = { scheduled: null, publish_at: null, scheduled_by: null, unpublish_at: null };

    const updates = {
      draft: content,
      updated_by: context.userId,
      updated_at: now,
      version: (data.version ?? 0) + 1,
      ...(data.action === 'review' ? { state: 'review' } : {}),
      ...(data.action === 'publish' || data.action === 'rollback' ? { published: content, state: 'published', published_at: now } : {}),
      ...(data.action === 'unpublish' ? { published: null, state: 'archived', scheduled: null, publish_at: null, unpublish_at: null } : {}),
      ...schedule,
    };
    const result = data.id
      ? await supabaseAdmin.from('cms_documents').update(updates).eq('id', data.id).eq('version', data.version ?? 0).select().single()
      : await supabaseAdmin.from('cms_documents').insert({ ...updates, path: data.path, kind: data.kind }).select().single();
    if (result.error) throw new Error('Save conflict or invalid document. Refresh before retrying.');
    await audit(supabaseAdmin, context.userId, data.action, 'document', result.data.id);
    return result.data;
  });

export const getCmsHistory = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.string().uuid())
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc('cms_access', { scope: 'content' });
    if (!allowed) throw new Error('Forbidden');
    const { data: rows, error } = await context.supabase
      .from('cms_revisions')
      .select('*')
      .eq('document_id', data)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error('Could not load history');
    return rows ?? [];
  });

export const LEAD_STATUSES = ['new', 'reviewed', 'qualified', 'contacted', 'meeting', 'opportunity', 'won', 'lost', 'closed'] as const;

export const updateLead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), status: z.enum(LEAD_STATUSES), assignedTo: z.string().uuid().nullable().optional() }))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc('cms_access', { scope: 'leads' });
    if (!allowed) throw new Error('Forbidden');
    const { error } = await context.supabase
      .from('contact_requests')
      .update({ status: data.status, ...(data.assignedTo !== undefined ? { assigned_to: data.assignedTo } : {}) })
      .eq('id', data.id);
    if (error) throw new Error('Could not update request');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await audit(supabaseAdmin, context.userId, `lead:${data.status}`, 'lead', data.id);
    return { saved: true };
  });
