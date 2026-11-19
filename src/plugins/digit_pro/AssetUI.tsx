import { Link, useNavigate } from '@tanstack/react-router';
import { Plus, ArrowUpRight } from 'lucide-react';
import { OPS_AR } from './opsAr';
import { Button } from '@/components/ui/button';
import { useLang, translateTo } from '@/i18n';
import { slug } from './finance';
import { assetDraftContext, createAssetDraft, existingAssetMaintenance } from './assetDraft';
import { toast } from 'sonner';
export function useAssetLabels() {
 const lang=useLang();
 return { lang, label:(en:string,ar:string)=>lang==='ar'?ar:en, display:(value:unknown)=>lang==='ar'?(OPS_AR[String(value??'—')]??translateTo(String(value??'—'),lang)):String(value??'—') };
}
export function AssetDocLink({dt,name,children}:{dt:string;name:string;children?:React.ReactNode}) {
 return name?<Link to="/app/$app/$doctype/$name" params={{app:dt==='Employee'?'hrms':'erpnext',doctype:slug(dt),name}} className="text-primary hover:underline break-words" data-no-i18n>{children??name}</Link>:<span>—</span>;
}
export function AssetListLink({dt,company,children}:{dt:string;company?:string;children:React.ReactNode}) {
 return <Button asChild variant="outline" size="sm"><Link to="/app/$app/$doctype" params={{app:'erpnext',doctype:slug(dt)}} search={{filters:company?JSON.stringify([['company','=',company]]):undefined} as never}>{children}<ArrowUpRight/></Link></Button>;
}
export function NewAssetDoc({dt='Asset',company,user,asset}:{dt?:string;company:string;user:string;asset?:string}) {
 const nav=useNavigate();const {label,display}=useAssetLabels();
  const existing=dt==='Asset Maintenance'&&asset?existingAssetMaintenance(asset,user):undefined;
  if(existing)return <Button asChild variant="outline" size="sm"><Link to="/app/$app/$doctype/$name" params={{app:'erpnext',doctype:slug(dt),name:existing.name}}>{label('Open maintenance plan','فتح خطة الصيانة')}<ArrowUpRight/></Link></Button>;
  if(!assetDraftContext(dt,company,user,asset))return null;
  const create=()=>{try{const doc=createAssetDraft(dt,company,user,asset);if(!doc){toast.error(label('This action is no longer available','هذا الإجراء لم يعد متاحاً'));return;}void nav({to:'/app/$app/$doctype/$name',params:{app:'erpnext',doctype:slug(dt),name:doc.name}});}catch{toast.error(label('Unable to prepare the native draft','تعذّر إعداد المسودة الأصلية'));}};
 return <Button size="sm" variant={dt==='Asset'?'default':'outline'} onClick={create}><Plus/>{dt==='Asset'?label('Add asset','إضافة أصل'):display(dt)}</Button>;
}
