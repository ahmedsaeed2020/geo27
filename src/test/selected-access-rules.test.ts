import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const at = line.indexOf('=');
  return [line.slice(0, at), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')];
}));
const key = env['VITE_SUPABASE_PUBLISHABLE_KEY'];
const url = env['VITE_SUPABASE_URL'];
if (!key || !url) throw new Error('Missing public test configuration');
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
    headers.set('apikey', key);
    return fetch(input, { ...init, headers });
  } },
});

describe('selected access rules', () => {
  it('blocks direct anonymous lead inserts before validating row contents', async () => {
    // Missing the required name also prevents saving anything if access regresses.
    const { error } = await client.from('contact_requests').insert({});
    expect(error?.code).toBe('42501');
  });

  it('blocks anonymous settings reads even when there are no settings', async () => {
    const { data, error } = await client.from('site_settings').select('key').limit(1);
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('retains validated server-side form saving', () => {
    const source = readFileSync('src/lib/leads.functions.ts', 'utf8');
    expect(source).toContain('.validator(leadSchema)');
    expect(source).toContain("supabaseAdmin.from('contact_requests').insert(");
  });
});