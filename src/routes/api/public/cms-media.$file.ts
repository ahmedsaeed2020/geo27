import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/cms-media/$file')({server:{handlers:{GET:async({params,request})=>{
  if(!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(params.file))return new Response('Not found',{status:404});
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data:media}=await supabaseAdmin.from('cms_media').select('approval,storage_path').eq('storage_path',params.file).maybeSingle();
  if(!media)return new Response('Not found',{status:404});
  if(media.approval!=='approved'){
    const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
    if(!token)return new Response('Not found',{status:404});
    const {data:user}=await supabaseAdmin.auth.getUser(token);if(!user.user)return new Response('Not found',{status:404});
    const {data:role}=await supabaseAdmin.from('user_roles').select('role').eq('user_id',user.user.id).eq('role','admin').maybeSingle();
    const {data:member}=await supabaseAdmin.from('cms_members').select('role').eq('user_id',user.user.id).maybeSingle();
    if(!role&&!['owner','editor'].includes(member?.role??''))return new Response('Not found',{status:404});
  }
  const {data:blob,error}=await supabaseAdmin.storage.from('digit-cms-media').download(params.file);if(error||!blob)return new Response('Not found',{status:404});
  return new Response(blob,{headers:{'Content-Type':blob.type,'X-Content-Type-Options':'nosniff','Cache-Control':media.approval==='approved'?'public, max-age=300':'private, no-store'}});
}}}});