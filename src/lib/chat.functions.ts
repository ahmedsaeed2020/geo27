import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/**
 * Visitor chat stays sign-in free: the browser keeps a random visitor UUID, and every read or write checks that the
 * thread belongs to that visitor. Visitors never read the chat tables directly, so conversations cannot be listed.
 */
const uuid = z.string().uuid();

export const createVisitorThread = createServerFn({ method: 'POST' })
  .validator(z.object({ visitorId: uuid, locale: z.enum(['ar', 'en']) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    // Light abuse guard: one visitor id cannot open an unlimited number of threads in an hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin.from('chat_threads').select('id', { count: 'exact', head: true }).eq('visitor_id', data.visitorId).gte('created_at', since);
    if ((count ?? 0) >= 20) throw new Error('Too many conversations, try again later');
    const { data: row, error } = await supabaseAdmin.from('chat_threads').insert({ visitor_id: data.visitorId, locale: data.locale }).select('id').single();
    if (error || !row) throw new Error('Could not start the conversation');
    return { id: row.id };
  });

export const listVisitorThreads = createServerFn({ method: 'POST' })
  .validator(z.object({ visitorId: uuid, ids: z.array(uuid).max(20) }))
  .handler(async ({ data }) => {
    if (!data.ids.length) return [];
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: rows } = await supabaseAdmin
      .from('chat_threads')
      .select('id, title, updated_at')
      .eq('visitor_id', data.visitorId)
      .in('id', data.ids)
      .order('updated_at', { ascending: false });
    return rows ?? [];
  });

export const getVisitorMessages = createServerFn({ method: 'POST' })
  .validator(z.object({ visitorId: uuid, threadId: uuid }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: thread } = await supabaseAdmin.from('chat_threads').select('id').eq('id', data.threadId).eq('visitor_id', data.visitorId).maybeSingle();
    if (!thread) return [];
    const { data: rows } = await supabaseAdmin.from('chat_messages').select('role, content, created_at').eq('thread_id', thread.id).order('created_at').limit(200);
    return rows ?? [];
  });
