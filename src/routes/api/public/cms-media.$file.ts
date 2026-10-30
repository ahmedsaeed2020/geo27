import { createFileRoute } from '@tanstack/react-router';

type Variant = { width: number; path: string };
const NOT_FOUND = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

/**
 * Serves CMS library images. Approved, non-archived images are public; anything else needs a signed-in
 * owner/editor bearer token. `?w=` picks the smallest stored WebP size at least that wide.
 */
export const Route = createFileRoute('/api/public/cms-media/$file')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(params.file)) return NOT_FOUND();
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: media } = await supabaseAdmin
          .from('cms_media')
          .select('approval, archived_at, storage_path, variants, replaced_at')
          .eq('url', `/api/public/cms-media/${params.file}`)
          .maybeSingle();
        if (!media?.storage_path) return NOT_FOUND();
        const isPublic = media.approval === 'approved' && !media.archived_at;
        if (!isPublic) {
          const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
          if (!token) return NOT_FOUND();
          const { data: user } = await supabaseAdmin.auth.getUser(token);
          if (!user.user) return NOT_FOUND();
          const [{ data: role }, { data: member }] = await Promise.all([
            supabaseAdmin.from('user_roles').select('role').eq('user_id', user.user.id).eq('role', 'admin').maybeSingle(),
            supabaseAdmin.from('cms_members').select('role').eq('user_id', user.user.id).maybeSingle(),
          ]);
          if (!role && !['owner', 'editor'].includes(member?.role ?? '')) return NOT_FOUND();
        }
        let path = media.storage_path;
        const wanted = Number(new URL(request.url).searchParams.get('w') ?? 0);
        if (wanted > 0) {
          const pick = ((media.variants as Variant[] | null) ?? []).filter(v => v.width >= wanted).sort((a, b) => a.width - b.width)[0];
          if (pick) path = pick.path;
        }
        const { data: blob, error } = await supabaseAdmin.storage.from('digit-cms-media').download(path);
        if (error || !blob) return NOT_FOUND();
        return new Response(blob, {
          headers: {
            'Content-Type': blob.type || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'Cache-Control': isPublic ? 'public, max-age=300, stale-while-revalidate=600' : 'private, no-store',
            ...(media.replaced_at ? { 'Last-Modified': new Date(media.replaced_at).toUTCString() } : {}),
          },
        });
      },
    },
  },
});
