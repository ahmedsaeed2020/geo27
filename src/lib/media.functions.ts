import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { audit, resolveAccess, type Db } from './cms-access';
import { CMS_MEDIA_PREFIX } from './site-config-schema';

const BUCKET = 'digit-cms-media';
const MAX_BYTES = 8 * 1024 * 1024;
export const VARIANT_WIDTHS = [480, 960, 1600] as const;
export type MediaVariant = { width: number; height: number; path: string; bytes: number };

type Kind = { ext: 'png' | 'jpg' | 'webp'; mime: 'image/png' | 'image/jpeg' | 'image/webp' };

function decode(base64: string): Uint8Array {
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** Magic-byte sniffing: the declared type is never trusted, and SVG/HTML are rejected. */
export function sniffImage(bytes: Uint8Array): Kind | null {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10) return { ext: 'png', mime: 'image/png' };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { ext: 'jpg', mime: 'image/jpeg' };
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/** Every place an image URL can be referenced: page drafts, published and scheduled snapshots, and site settings. */
export async function mediaUsage(admin: Db, url: string) {
  const [{ data: docs }, { data: config }] = await Promise.all([
    admin.from('cms_documents').select('path, draft, published, scheduled'),
    admin.from('cms_site_config').select('key, draft, published'),
  ]);
  const inJson = (v: unknown) => !!v && JSON.stringify(v).includes(url);
  return {
    published: [
      ...(docs ?? []).filter(d => inJson(d.published) || inJson(d.scheduled)).map(d => d.path),
      ...(config ?? []).filter(c => inJson(c.published)).map(c => `settings:${c.key}`),
    ],
    drafts: [...(docs ?? []).filter(d => inJson(d.draft)).map(d => d.path), ...(config ?? []).filter(c => inJson(c.draft)).map(c => `settings:${c.key}`)],
  };
}

async function requireContent(supabase: Db, userId: string) {
  const access = await resolveAccess(supabase, userId);
  if (!access.content) throw new Error('Forbidden');
  return access;
}

export const uploadCmsMedia = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      base64: z.string().max(11_500_000),
      title: z.string().trim().min(1).max(200),
      altAr: z.string().max(300),
      altEn: z.string().max(300),
      source: z.string().trim().min(1).max(500),
      width: z.number().int().min(1).max(10000),
      height: z.number().int().min(1).max(10000),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireContent(context.supabase, context.userId);
    const bytes = decode(data.base64);
    if (bytes.length > MAX_BYTES) throw new Error('File too large');
    const kind = sniffImage(bytes);
    if (!kind) throw new Error('Only PNG, JPEG and WebP images are accepted');
    const path = `${crypto.randomUUID()}.${kind.ext}`;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
    if (error) throw new Error('Could not store the image');
    const { data: row, error: rowError } = await supabaseAdmin
      .from('cms_media')
      .insert({
        url: `${CMS_MEDIA_PREFIX}${path}`,
        storage_path: path,
        title: data.title,
        alt_ar: data.altAr,
        alt_en: data.altEn,
        source: data.source,
        width: data.width,
        height: data.height,
        bytes: bytes.length,
        mime: kind.mime,
        created_by: context.userId,
      })
      .select()
      .single();
    if (rowError) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error('Could not save the image');
    }
    await audit(supabaseAdmin, context.userId, 'upload', 'media', row.id);
    return row;
  });

/** Stores one browser-generated WebP size; widths are fixed so responsive URLs stay predictable. */
export const addMediaVariant = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      base64: z.string().max(4_500_000),
      width: z.union([z.literal(480), z.literal(960), z.literal(1600)]),
      height: z.number().int().min(1).max(10000),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireContent(context.supabase, context.userId);
    const bytes = decode(data.base64);
    if (sniffImage(bytes)?.ext !== 'webp') throw new Error('Only PNG, JPEG and WebP images are accepted');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: media } = await supabaseAdmin.from('cms_media').select('id, storage_path, width, variants, locked').eq('id', data.id).maybeSingle();
    if (!media || media.locked || !media.storage_path) throw new Error('Forbidden');
    if (media.width && data.width >= media.width) return { skipped: true };
    const base = media.storage_path.replace(/\.(png|jpg|webp)$/, '');
    const path = `${base}-w${data.width}.webp`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/webp', upsert: true });
    if (error) throw new Error('Could not store the image');
    const variants = ((media.variants as MediaVariant[] | null) ?? []).filter(v => v.width !== data.width);
    variants.push({ width: data.width, height: data.height, path, bytes: bytes.length });
    variants.sort((a, b) => a.width - b.width);
    await supabaseAdmin.from('cms_media').update({ variants }).eq('id', data.id);
    return { skipped: false };
  });

export const updateCmsMedia = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      altAr: z.string().trim().max(300),
      altEn: z.string().trim().max(300),
      source: z.string().trim().min(1).max(500),
      approval: z.enum(['draft', 'approved']),
      focalX: z.number().int().min(0).max(100),
      focalY: z.number().int().min(0).max(100),
    }),
  )
  .handler(async ({ data, context }) => {
    const access = await requireContent(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: media } = await supabaseAdmin.from('cms_media').select('url, approval, locked').eq('id', data.id).maybeSingle();
    if (!media || media.locked) throw new Error('Forbidden');
    if (data.approval !== media.approval && !access.owner) throw new Error('Owner approval required');
    if (data.approval === 'approved' && (!data.altAr || !data.altEn)) throw new Error('Add Arabic and English descriptions before approval');
    if (media.approval === 'approved' && data.approval === 'draft' && (await mediaUsage(supabaseAdmin, media.url)).published.length) throw new Error('Image is still used');
    const { error } = await supabaseAdmin
      .from('cms_media')
      .update({ title: data.title, alt_ar: data.altAr, alt_en: data.altEn, source: data.source, approval: data.approval, focal_x: data.focalX, focal_y: data.focalY })
      .eq('id', data.id);
    if (error) throw new Error('Could not save the image');
    await audit(supabaseAdmin, context.userId, 'media:update', 'media', data.id);
    return { saved: true };
  });

/** Swaps the stored file while keeping the public URL, so every page that uses the image updates at once. */
export const replaceCmsMedia = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      base64: z.string().max(11_500_000),
      width: z.number().int().min(1).max(10000),
      height: z.number().int().min(1).max(10000),
    }),
  )
  .handler(async ({ data, context }) => {
    const access = await requireContent(context.supabase, context.userId);
    const bytes = decode(data.base64);
    if (bytes.length > MAX_BYTES) throw new Error('File too large');
    const kind = sniffImage(bytes);
    if (!kind) throw new Error('Only PNG, JPEG and WebP images are accepted');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: media } = await supabaseAdmin.from('cms_media').select('id, storage_path, variants, approval, locked').eq('id', data.id).maybeSingle();
    if (!media || media.locked) throw new Error('Forbidden');
    if (media.approval === 'approved' && !access.owner) throw new Error('Owner approval required');
    const path = `${crypto.randomUUID()}.${kind.ext}`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
    if (error) throw new Error('Could not store the image');
    const { error: rowError } = await supabaseAdmin
      .from('cms_media')
      .update({ storage_path: path, width: data.width, height: data.height, bytes: bytes.length, mime: kind.mime, variants: [], replaced_at: new Date().toISOString() })
      .eq('id', data.id);
    if (rowError) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error('Could not save the image');
    }
    const old = [media.storage_path, ...((media.variants as MediaVariant[] | null) ?? []).map(v => v.path)].filter((p): p is string => !!p);
    if (old.length) await supabaseAdmin.storage.from(BUCKET).remove(old);
    await audit(supabaseAdmin, context.userId, 'media:replace', 'media', data.id);
    return { replaced: true };
  });

export const archiveCmsMedia = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), archived: z.boolean() }))
  .handler(async ({ data, context }) => {
    const access = await requireContent(context.supabase, context.userId);
    if (!access.owner) throw new Error('Owner approval required');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: media } = await supabaseAdmin.from('cms_media').select('url, locked').eq('id', data.id).maybeSingle();
    if (!media || media.locked) throw new Error('Forbidden');
    if (data.archived) {
      const usage = await mediaUsage(supabaseAdmin, media.url);
      if (usage.published.length || usage.drafts.length) throw new Error('Image is still used');
    }
    const { error } = await supabaseAdmin.from('cms_media').update({ archived_at: data.archived ? new Date().toISOString() : null }).eq('id', data.id);
    if (error) throw new Error('Could not save the image');
    await audit(supabaseAdmin, context.userId, data.archived ? 'media:archive' : 'media:restore', 'media', data.id);
    return { saved: true };
  });
