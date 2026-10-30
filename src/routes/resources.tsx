import { getPublishedContent } from '@/lib/cms.functions';
import {createFileRoute} from '@tanstack/react-router';
import {withSeo} from '@/lib/seo';
import ResourceHub from '@/components/ResourceHub';
export const Route=createFileRoute('/resources')({
 loader: () => getPublishedContent(),head:()=>withSeo('/resources',{meta:[{title:'مركز المعرفة وجولات النظام | DIGIT'},{name:'description',content:'شروحات المحاسبة والمخزون والتقارير وجولة شاشات Digit Pro الفعلية.'}]}, loaderData),component:ResourceHub});