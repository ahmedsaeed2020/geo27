import { createFileRoute } from '@tanstack/react-router';
import CrmWorkspace from '@/components/crm/CrmWorkspace';
export const Route=createFileRoute('/_authenticated/admin/crm/lead/$id')({head:()=>({meta:[{title:'GeoInTime CRM — تفاصيل العميل'},{name:'description',content:'سجل العميل الخاص والأنشطة والفرص في GeoInTime.'},{property:'og:title',content:'GeoInTime CRM — Lead record'},{property:'og:description',content:'Private lead details and activity timeline.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex,nofollow'}]}),component:LeadPage});
function LeadPage(){const {id}=Route.useParams();return <CrmWorkspace leadId={id}/>;}
