import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import sanitizeHtml from 'sanitize-html';
import { cmsContentSchema,safePath,type PublishedRecord } from './cms-schema';

export const getPublishedContent = createServerFn({method:'GET'}).handler(async ():Promise<PublishedRecord[]> => {
  const key=process.env['SUPABASE_PUBLISHABLE_KEY']; const endpoint=process.env['SUPABASE_URL'];
  if (!key || !endpoint) throw new Error('Content service unavailable');
  const client=createClient(endpoint,key,{auth:{persistSession:false},global:{fetch:(input,init)=>{const h=new Headers(init?.headers);if(key.startsWith('sb_') && h.get('Authorization')===`Bearer ${key}`) h.delete('Authorization');h.set('apikey',key);return fetch(input,{...init,headers:h});}}});
  const {data,error}=await client.rpc('cms_published');
  if(error) throw new Error('Content service unavailable');
  return (data ?? []).map((row:PublishedRecord)=>({...row,published:cmsContentSchema.parse(row.published)}));
});
export const cmsWorkspace = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async ({context})=>{
  const [content,leads,owner]=await Promise.all(['content','leads','owner'].map(scope=>context.supabase.rpc('cms_access',{scope})));
  const {data:admin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
  const role=admin||owner?.data?'owner':content?.data?'editor':leads?.data?'sales':null;
  if(!role) throw new Error('Forbidden');
  const docs=content?.data?await context.supabase.from('cms_documents').select('*').order('path'): {data:[]};
  const media=content?.data?await context.supabase.from('cms_media').select('*').order('created_at',{ascending:false}):{data:[]};
  const requests=leads?.data?await context.supabase.from('contact_requests').select('*').order('created_at',{ascending:false}).limit(500):{data:[]};
  const audit=await context.supabase.from('cms_audit').select('*').order('created_at',{ascending:false}).limit(100);
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const members=role==='owner'?await supabaseAdmin.from('cms_members').select('*'):{data:[]};
  return {role,docs:docs.data??[],media:media.data??[],leads:requests.data??[],audit:audit.data??[],members:members.data??[]};
});
export const saveCmsDocument=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid().optional(),path:safePath,kind:z.string().max(40),content:cmsContentSchema,version:z.number().int().optional(),action:z.enum(['save','review','publish','unpublish','rollback']).default('save')})).handler(async({data,context})=>{
  const {data:allowed}=await context.supabase.rpc('cms_access',{scope:'content'});if(!allowed) throw new Error('Forbidden');
  const {data:owner}=await context.supabase.rpc('cms_access',{scope:'owner'});
  if(['publish','unpublish','rollback'].includes(data.action)&&!owner)throw new Error('Publishing requires owner approval');
  const content=cmsContentSchema.parse(data.content);
  for(const locale of ['ar','en'] as const) for(const [id,html] of Object.entries(content[locale].sourceEdits)) content[locale].sourceEdits[id]=sanitizeHtml(html,{allowedTags:['p','span','strong','em','br','ul','ol','li','h2','h3','h4','a'],allowedAttributes:{a:['href']},allowedSchemes:['https','mailto','tel']});
  for(const locale of ['ar','en'] as const) for(const b of content[locale].blocks) if(b.href && !safePath.safeParse(b.href).success) throw new Error('Use a valid internal page link');
  if((data.action==='publish'||data.action==='rollback')&&content.evidence!=='approved')throw new Error('Evidence approval is required before publishing');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  for(const locale of ['ar','en'] as const) for(const b of content[locale].blocks) if(b.mediaUrl){const {data:media}=await supabaseAdmin.from('cms_media').select('id').eq('url',b.mediaUrl).eq('approval','approved').maybeSingle();if(!media)throw new Error('Use an approved library image');}
  const updates={draft:content,updated_by:context.userId,updated_at:new Date().toISOString(),version:(data.version??0)+1,
    ...(data.action==='review'?{state:'review'}:{}),
    ...(data.action==='publish'||data.action==='rollback'?{published:content,state:'published',published_at:new Date().toISOString()}:{}),
    ...(data.action==='unpublish'?{published:null,state:'archived'}:{})};
  const result=data.id?await supabaseAdmin.from('cms_documents').update(updates).eq('id',data.id).eq('version',data.version??0).select().single():await supabaseAdmin.from('cms_documents').insert({...updates,path:data.path,kind:data.kind}).select().single();
  if(result.error)throw new Error('Save conflict or invalid document. Refresh before retrying.');
  await supabaseAdmin.from('cms_audit').insert({actor_id:context.userId,action:data.action,entity:'document',entity_id:result.data.id});
  return result.data;
});
export const getCmsHistory=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.string().uuid()).handler(async({data,context})=>{
  const {data:allowed}=await context.supabase.rpc('cms_access',{scope:'content'});if(!allowed)throw new Error('Forbidden');
  const {data:rows,error}=await context.supabase.from('cms_revisions').select('*').eq('document_id',data).order('created_at',{ascending:false});if(error)throw error;return rows??[];
});
export const updateLead=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),status:z.enum(['new','reviewed','qualified','contacted','meeting','opportunity','won','lost','closed']),assignedTo:z.string().uuid().nullable().optional()})).handler(async({data,context})=>{
  const {data:allowed}=await context.supabase.rpc('cms_access',{scope:'leads'});if(!allowed)throw new Error('Forbidden');
  const {error}=await context.supabase.from('contact_requests').update({status:data.status,...(data.assignedTo!==undefined?{assigned_to:data.assignedTo}:{})}).eq('id',data.id);if(error)throw error;
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');await supabaseAdmin.from('cms_audit').insert({actor_id:context.userId,action:`lead:${data.status}`,entity:'lead',entity_id:data.id});return {saved:true};
});
export const setCmsRole=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({userId:z.string().uuid(),role:z.enum(['editor','sales'])})).handler(async({data,context})=>{
  const {data:owner}=await context.supabase.rpc('cms_access',{scope:'owner'});if(!owner)throw new Error('Forbidden');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {error}=await supabaseAdmin.from('cms_members').upsert({user_id:data.userId,role:data.role});if(error)throw error;
  await supabaseAdmin.from('cms_audit').insert({actor_id:context.userId,action:`role:${data.role}`,entity:'member',entity_id:data.userId});return {saved:true};
});