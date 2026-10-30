import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LeadCapturePanel from '@/components/LeadCapturePanel';
import CmsBlocks from './CmsBlocks';
import {useCmsPage} from './CmsContext';
import {useLocale} from '@/lib/i18n';
export default function DynamicContentPage(){const c=useCmsPage();const l=useLocale();return <div className="bg-paper2 font-plex"><Header/><main><section className="mx-auto max-w-6xl px-4 py-16"><h1 className="text-4xl font-bold text-foreground">{c?.[l].title}</h1><p className="mt-4 text-xl">{c?.[l].description}</p></section><CmsBlocks/>{c?.formEnabled&&<LeadCapturePanel interest={c[l].title}/>}</main><Footer/></div>}