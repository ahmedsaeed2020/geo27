import { loadPublished } from '@/lib/cms-query';
import {createFileRoute} from '@tanstack/react-router';
import {withSeo} from '@/lib/seo';
import ResourceHub from '@/components/ResourceHub';
export const Route=createFileRoute('/resources')({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),head:({loaderData})=>withSeo('/resources',{meta:[{title:'مركز المعرفة وجولات النظام | DIGIT'},{name:'description',content:'شروحات المحاسبة والمخزون والتقارير وجولة شاشات Digit Pro الفعلية.'}]}, loaderData),component:ResourceHub});