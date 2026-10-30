import { Link } from '@tanstack/react-router';
import { useLocale } from '@/lib/i18n';
import { useCmsPage } from './CmsContext';
import type { CmsContent } from '@/lib/cms-schema';
import { SHOTS } from '@/content/product-shots';
import { Button } from '@/components/ui/button';
import { focusLeadForm } from '@/components/LeadCapturePanel';
export default function CmsBlocks({content}:{content?:CmsContent}){const page=useCmsPage();const c=content??page;const l=useLocale();if(!c)return null;return <section className="mx-auto max-w-6xl px-4 py-12" data-cms-blocks>{c[l].blocks.filter(b=>b.enabled).map(b=>{const shot=Object.values(SHOTS).find(s=>s.id===b.shotId);return <article key={b.id} className="border-b border-border py-10"><p className="text-sm font-medium text-primary">DIGIT</p><h2 className="mb-4 text-3xl font-bold text-foreground">{b.title}</h2><p className="max-w-3xl whitespace-pre-line text-lg">{b.body}</p>{shot&&<img src={shot.src} alt={shot.caption[l]} width={shot.width} height={shot.height} loading="lazy" className="mt-6 max-h-[600px] w-full object-contain"/>}{b.type==='cta'?<Button onClick={focusLeadForm} className="mt-5">{l==='ar'?'احجز ديمو Digit':'Book Digit demo'}</Button>:b.href&&<Button asChild variant="link"><Link to={l==='en'?`/en${b.href==='/'?'':b.href}`:b.href}>{l==='ar'?'تابع التفاصيل':'Explore details'}</Link></Button>}</article>})}</section>}