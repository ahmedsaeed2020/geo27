import {createFileRoute} from '@tanstack/react-router';
import {withSeo} from '@/lib/seo';
import ResourceHub from '@/components/ResourceHub';
export const Route=createFileRoute('/resources')({head:()=>withSeo('/resources',{meta:[{title:'مركز المعرفة وجولات النظام | DIGIT'},{name:'description',content:'شروحات المحاسبة والمخزون والتقارير وجولة شاشات Digit Pro الفعلية.'}]}),component:ResourceHub});