import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { leadCatalogContext, leadSchema, LEAD_RECIPIENT } from './leads-schema';
import { parseConfig } from './site-config-schema';

export const submitLead = createServerFn({ method: 'POST' }).inputValidator(leadSchema).handler(async ({ data }) => {
  if (data.website) throw new Error('Invalid submission');
  const request = getRequest();
  const raw = `${request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'local'}:${data.email || data.phone}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const rateKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: allowed, error: rateError } = await supabaseAdmin.rpc('consume_lead_limit', { rate_key: rateKey });
  if (rateError || !allowed) throw new Error('Please try again later');
  // Published form settings may require extra fields; the fixed minimum (name, company, one channel, consent) always applies.
  const { data: formRow } = await supabaseAdmin.from('cms_site_config').select('published').eq('key','forms').maybeSingle();
  const forms = parseConfig('forms', formRow?.published);
  if (forms.showJobRole && forms.requireJobRole && !data.jobRole) throw new Error('Job role is required');
  if (forms.showMessage && forms.requireMessage && !data.message) throw new Error('Message is required');
  const { data: setting } = await supabaseAdmin.from('cms_config').select('value').eq('key','lead_notification_recipient').maybeSingle();
  const recipient = typeof setting?.value === 'string' ? setting.value : LEAD_RECIPIENT;
  const catalog = leadCatalogContext(data.product, data.department);
  const { data: row, error } = await supabaseAdmin.from('contact_requests').insert({
    product: catalog.product || null, department: catalog.department || null,
    name:data.name,company:data.company,email:data.email || null,phone:data.phone || null,
    kind:data.requestType==='demo'?'demo':'contact', request_type:data.requestType,
    message:data.message,job_role:data.jobRole,interest:data.interest,industry:data.industry,
    locale:data.locale,page_path:data.pagePath,referrer:data.referrer,utm:data.utm,consent:data.consent,
    notification_recipient:recipient,notification_status:'not_configured',
    notification_error:'Sender domain is not configured. Lead is saved; no email was sent.',
  }).select('id').single();
  if (error || !row) throw new Error('Could not save request');
  return { saved:true, id:row.id, notification:'not_configured' as const };
});