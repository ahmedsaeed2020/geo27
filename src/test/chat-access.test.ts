// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Live regression: a public visitor must never enumerate or mutate chat tables.
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const at = line.indexOf('=');
  return [line.slice(0, at), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')];
}));
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = createClient(env.VITE_SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
    headers.set('apikey', key);
    return fetch(input, { ...init, headers });
  } },
});

describe('anonymous chat access is denied', () => {
  for (const table of ['chat_threads', 'chat_messages'] as const) {
    it(`cannot enumerate ${table}`, async () => {
      const { data, error } = await client.from(table).select('id').limit(1);
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
    });
  }
  it('cannot modify an arbitrary thread', async () => {
    const { error } = await client.from('chat_threads').update({ title: 'unauthorized' }).eq('id', '00000000-0000-4000-8000-000000000000');
    expect(error?.code).toBe('42501');
  });
});