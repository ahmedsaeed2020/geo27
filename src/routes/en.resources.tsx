import { getPublishedContent } from '@/lib/cms.functions';
import {createFileRoute} from '@tanstack/react-router';
import {withSeo} from '@/lib/seo';
import ResourceHub from '@/components/ResourceHub';
export const Route=createFileRoute('/en/resources')({
 loader: () => getPublishedContent(),head:()=>withSeo('/en/resources',{meta:[{title:'Resources and product tours | DIGIT'},{name:'description',content:'Accounting, inventory and reporting explainers, and the actual Digit Pro screen tour.'}]}, loaderData),component:ResourceHub});