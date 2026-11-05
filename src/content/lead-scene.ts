// The request-section scene: the Digit advisor (ADVISOR-SA-A) presenting to a Saudi business owner (OWNER-SA-A) in a
// Riyadh meeting room. The room and people are a generated photograph from the supplied characters; the large display
// shows the real DIGIT CRM home screen (crm2-home source capture), composited onto the blank display without editing
// its pixels. The English scene is the mirrored photograph with the same screen composited the right way round.
import ar1920 from '@/assets/lead-scene/advisor-owner-meeting-ar-1920.webp.asset.json';
import ar1280 from '@/assets/lead-scene/advisor-owner-meeting-ar-1280.webp.asset.json';
import ar800 from '@/assets/lead-scene/advisor-owner-meeting-ar-800.webp.asset.json';
import en1920 from '@/assets/lead-scene/advisor-owner-meeting-en-1920.webp.asset.json';
import en1280 from '@/assets/lead-scene/advisor-owner-meeting-en-1280.webp.asset.json';
import en800 from '@/assets/lead-scene/advisor-owner-meeting-en-800.webp.asset.json';
import type { L } from '@/content/specialist/types';

const set = (a: { url: string }, b: { url: string }, c: { url: string }) => ({ src: b.url, srcSet: `${c.url} 800w, ${b.url} 1280w, ${a.url} 1920w` });

export const LEAD_SCENE = { ar: set(ar1920, ar1280, ar800), en: set(en1920, en1280, en800) } as const;

export const LEAD_SCENE_COPY = {
  alt: {
    ar: 'مستشار من فريق Digit يشرح لمالك منشأة سعودي شاشة DIGIT CRM على شاشة كبيرة في غرفة اجتماعات بالرياض',
    en: 'A Digit advisor explains a DIGIT CRM screen on a large display to a Saudi business owner in a Riyadh meeting room',
  },
  chip: { ar: 'مستشار Digit يعرض النظام على شاشة فعلية', en: 'A Digit advisor walks through a real system screen' },
  title: { ar: 'ديمو مبني على احتياجك', en: 'A demo built around your needs' },
  lede: {
    ar: 'مستشار من فريق Digit يعرض لك النظام على سيناريو قريب من عمل منشأتك، ثم يوضح النطاق والخطوة التالية.',
    en: 'A Digit advisor walks you through the system on a scenario close to your business, then sets out the scope and the next step.',
  },
  quoteTitle: { ar: 'اطلب عرض سعر مخصص لمنشأتك', en: 'Request a tailored quote for your business' },
  quoteLede: {
    ar: 'اكتب احتياجك ويتواصل معك مستشار لتأكيد النطاق، ثم يصلك عرض مكتوب بالنطاق ومراحل التطبيق والتكلفة.',
    en: 'Tell us your needs and an advisor confirms the scope with you, then you receive a written scope, rollout stages and cost.',
  },
  points: [
    { ar: 'مستشار من فريق Digit', en: 'A Digit advisor' },
    { ar: 'شاشات النظام الفعلية', en: 'Real system screens' },
    { ar: 'نطاق وخطوة تالية واضحة', en: 'A clear scope and next step' },
  ],
  whatsapp: { ar: 'أو تواصل عبر واتساب', en: 'Or reach us on WhatsApp' },
  demoKind: { ar: 'عرض توضيحي', en: 'Demo' },
  quoteKind: { ar: 'عرض سعر', en: 'Price quote' },
  quoteFormTitle: { ar: 'اكتب احتياج منشأتك', en: 'Tell us what your business needs' },
} satisfies Record<string, L | L[]>;
