import {useNavigate} from '@tanstack/react-router';
import {ClipboardPlus} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {useLang} from '@/i18n';
import {can} from './finance';
import {replenishmentDraft} from './replenishment';
export function ReplenishmentAction({company,item,warehouse,user}:{company:string;item:string;warehouse:string;user:string}) {
 const nav=useNavigate(),ar=useLang()==='ar',label=ar?'إعداد طلب مواد':'Prepare material request';
 if(!can('Material Request','create',{name:'new',doctype:'Material Request',company},user))return null;
 return <Button variant='ghost' size='icon' title={label} aria-label={label} onClick={()=>{try{const d=replenishmentDraft(company,item,warehouse,user);void nav({to:'/app/$app/$doctype/$name',params:{app:'erpnext',doctype:'material_request',name:d.name}});}catch{toast.error(ar?'تعذّر إعداد الطلب؛ راجع الصلاحيات وأساس إعادة الطلب.':'Unable to prepare request; review permissions and reorder basis.');}}}><ClipboardPlus/></Button>;
}