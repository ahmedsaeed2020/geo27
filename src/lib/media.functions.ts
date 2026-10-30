import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
export const uploadCmsMedia=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({base64:z.string().max(11500000),title:z.string().min(1).max(200),altAr:z.string().max(300),altEn:z.string().max(300),source:z.string().min(1).max(500),width:z.number().int().min(1).max(10000),height:z.number().int().min(1).max(10000)})).handler(async({data,context})=>{
  const {data:allowed}=await context.supabase.rpc('cms_access',{scope:'content'});if(!allowed)throw new Error('Forbidden');
  const raw=atob(data.base64);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length>8*1024*1024)throw new Error('File too large');
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10;
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  if(!png&&!jpg&&!webp)throw new Error('Only PNG, JPEG and WebP images are accepted');
  const path=`${crypto.randomUUID()}.${png?'png':jpg?'jpg':'webp'}`;
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {error}=await supabaseAdmin.storage.from('digit-cms-media').upload(path,bytes,{contentType:png?'image/png':jpg?'image/jpeg':'image/webp',upsert:false});if(error)throw error;
  const {data:row,error:rowError}=await supabaseAdmin.from('cms_media').insert({url:`/api/public/cms-media/${path}`,storage_path:path,title:data.title,alt_ar:data.altAr,alt_en:data.altEn,source:data.source,width:data.width,height:data.height,created_by:context.userId}).select().single();if(rowError)throw rowError;
  await supabaseAdmin.from('cms_audit').insert({actor_id:context.userId,action:'upload',entity:'media',entity_id:row.id});return row;
});
export const updateCmsMedia=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),altAr:z.string().max(300),altEn:z.string().max(300),approval:z.enum(['draft','approved']),focalX:z.number().int().min(0).max(100),focalY:z.number().int().min(0).max(100)})).handler(async({data,context})=>{
  const {data:allowed}=await context.supabase.rpc('cms_access',{scope:'content'});if(!allowed)throw new Error('Forbidden');
  const {data:owner}=await context.supabase.rpc('cms_access',{scope:'owner'});if(data.approval==='approved'&&!owner)throw new Error('Owner approval required');
  const {error}=await context.supabase.from('cms_media').update({alt_ar:data.altAr,alt_en:data.altEn,approval:data.approval,focal_x:data.focalX,focal_y:data.focalY}).eq('id',data.id);if(error)throw error;return {saved:true};
});