import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Expand, RotateCcw, Search, X } from 'lucide-react';
import { NavLink } from '@/components/nav/nav-links';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import ShotLightbox from '@/components/product/ShotLightbox';
import { StatusChip } from '@/components/specialist/SpecialistBody';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { screenById } from '@/content/screens';
import type { Shot } from '@/content/product-shots';
import { photo as photoOf } from '@/content/specialist/photos';
import {
  CONSTRUCTION_CHANGE,
  CONSTRUCTION_COST_MEASURES,
  CONSTRUCTION_JOURNEY,
  CONSTRUCTION_MONEY_CHAIN,
  CRM_JOURNEY,
  CRM_WORKBENCH,
  FSM_JOURNEY,
  FSM_LOOP,
  POS_CHAPTERS,
  POS_INDUSTRIES,
  type Focus,
} from '@/content/specialist/stories';
import type { L } from '@/content/specialist/types';
import { useLocale, type Locale } from '@/lib/i18n';
import '@/specialist.css';
import '@/hubs.css';

const industryPhotos = import.meta.glob<string>('/src/assets/pos/industries/*.webp', { eager: true, import: 'default' });
const industryPhoto = (id: string) => industryPhotos[`/src/assets/pos/industries/${id}.webp`] ?? '';

const C = {
  purpose: { ar: 'الهدف', en: 'Purpose' },
  documents: { ar: 'المستندات', en: 'Documents' },
  owner: { ar: 'المسؤول', en: 'Owner' },
  status: { ar: 'الحالة', en: 'Status' },
  implication: { ar: 'الأثر على العقد والتكلفة', en: 'Contract and cost implication' },
  openDept: { ar: 'افتح صفحة المجال', en: 'Open the area page' },
  objects: { ar: 'السجلات', en: 'Records' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  outcome: { ar: 'الناتج', en: 'Outcome' },
  decision: { ar: 'القرار المطلوب', en: 'Decision needed' },
  source: { ar: 'السجل الذي يثبت ذلك', en: 'Source record' },
  zoom: { ar: 'تفصيل مكبّر من شاشة فعلية (بيانات تجريبية)', en: 'Magnified detail from a real screen (demo data)' },
  full: { ar: 'عرض الشاشة كاملة', en: 'View the full screen' },
  noShot: { ar: 'لا توجد شاشة فعلية لهذه الخطوة على الموقع؛ تُعرض في جلسة الديمو.', en: 'No real screen of this step on the site; it is shown in a demo session.' },
  record: { ar: 'السجل', en: 'Record' },
  state: { ar: 'الحالة', en: 'State' },
  output: { ar: 'الناتج', en: 'Output' },
  step: { ar: 'الخطوة', en: 'Step' },
  of: { ar: 'من', en: 'of' },
} satisfies Record<string, L>;

/** Arrow-key navigation for a row of tabs (RTL-aware); vertical lists use up/down. */
function useTabs(count: number, locale: Locale, vertical = false) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (!keys.includes(e.key) && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    let next = active;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else {
      const forward = vertical ? e.key === 'ArrowDown' : e.key === (locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
      next = (active + (forward ? 1 : -1) + count) % count;
    }
    setActive(next);
    refs.current[next]?.focus();
  };
  const tabProps = (i: number, panelId: string, tabId: string) => ({
    ref: (el: HTMLButtonElement | null) => {
      refs.current[i] = el;
    },
    id: tabId,
    type: 'button' as const,
    role: 'tab' as const,
    'aria-selected': i === active,
    'aria-controls': panelId,
    tabIndex: i === active ? 0 : -1,
    onClick: () => setActive(i),
    onKeyDown,
  });
  return { active, setActive, tabProps };
}

function Head({ kicker, title, lede, id }: { kicker: string; title: string; lede?: string; id: string }) {
  return (
    <header className="hs-head">
      <p className="sp-kicker">{kicker}</p>
      <h2 id={id}>{title}</h2>
      {lede && <p className="sp-lede">{lede}</p>}
    </header>
  );
}

function DeptLink({ path, locale, label = C.openDept }: { path: string; locale: Locale; label?: L }) {
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <NavLink path={path} className="hs-link">
      {label[locale]}
      <Arrow aria-hidden="true" />
    </NavLink>
  );
}

/** A magnified region of a real screen, with the full screen one click away. */
function Lens({ shotId, focus, locale }: { shotId: string; focus: Focus; locale: Locale }) {
  const shot = screenById(shotId);
  const [open, setOpen] = useState<number | null>(null);
  const shots: Shot[] = shot ? [shot] : [];
  if (!shot) return null;
  return (
    <figure className="hs-lens">
      <span
        className="hs-lens-view"
        role="img"
        aria-label={`${shot.caption[locale]} — ${C.zoom[locale]}`}
        style={{ backgroundImage: `url("${shot.src}")`, backgroundSize: `${focus.zoom * 100}% auto`, backgroundPosition: `${focus.x}% ${focus.y}%`, aspectRatio: `${shot.width} / ${shot.height}` } as CSSProperties}
      />
      <figcaption>
        <span>
          <Search aria-hidden="true" />
          {C.zoom[locale]}
        </span>
        <button type="button" className="hs-lens-open" onClick={() => setOpen(0)}>
          <Expand aria-hidden="true" />
          {C.full[locale]}
        </button>
      </figcaption>
      <ShotLightbox shots={shots} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </figure>
  );
}

/* =========================== Construction =========================== */
const CON = {
  kicker: { ar: 'رحلة المشروع 360', en: 'Project 360 journey' },
  title: { ar: 'من المقايسة إلى التحصيل… في سياق مشروع واحد', en: 'From BOQ to collection… in one project context' },
  lede: { ar: 'اختر طابقًا من المشروع لترى هدفه ومستنداته والمسؤول عنه وأثره على العقد والتكلفة.', en: 'Choose a level of the project to see its purpose, documents, owner and its effect on contract and cost.' },
  levels: { ar: 'مراحل المشروع', en: 'Project stages' },
  moneyKicker: { ar: 'المستخلصات والتكلفة', en: 'Claims and cost' },
  moneyTitle: { ar: 'خمسة أرقام مختلفة… لا رقم واحد', en: 'Five different numbers… not one' },
  moneyLede: { ar: 'المقاس ليس المطالب به، والمطالب به ليس المعتمد، والمعتمد ليس المحصّل. كل رقم له مستند ومسؤول.', en: 'Measured is not claimed, claimed is not certified, certified is not collected. Each figure has its own document and owner.' },
  costTitle: { ar: 'والتكلفة أربعة مفاهيم منفصلة', en: 'And cost is four separate concepts' },
  changeKicker: { ar: 'أثر التغيير', en: 'Change impact' },
  changeTitle: { ar: 'كل تغيير يُقرأ مقابل ما سُعّر وما اتُفق عليه', en: 'Every change is read against what was priced and agreed' },
  changeNote: { ar: 'الربط بين هذه الحلقات يعتمد على إعداد المشروع ونطاق التنفيذ.', en: 'Linking these steps depends on project set-up and implementation scope.' },
} satisfies Record<string, L>;

export function ConstructionStory() {
  const locale = useLocale();
  const base = useId();
  const { active, tabProps } = useTabs(CONSTRUCTION_JOURNEY.length, locale, true);
  const stage = CONSTRUCTION_JOURNEY[active]!;
  const pic = photoOf('construction-levels');
  const floors = [...CONSTRUCTION_JOURNEY.map((s, i) => ({ s, i }))].reverse();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <div className="hs" data-product="construction">
      <section className="hs-block" aria-labelledby={`${base}-j`}>
        <div className="dp-wrap">
          <Head kicker={CON.kicker[locale]} title={CON.title[locale]} lede={CON.lede[locale]} id={`${base}-j`} />
          <div className="hs-building">
            <div className="hs-tower" style={pic ? ({ '--hs-photo': `url("${pic.src}")` } as CSSProperties) : undefined}>
              <div role="tablist" aria-label={CON.levels[locale]} aria-orientation="vertical" className="hs-floors">
                {floors.map(({ s, i }) => (
                  <button key={s.id} {...tabProps(i, `${base}-jp`, `${base}-jt-${i}`)} className="hs-floor" style={{ '--i': i } as CSSProperties}>
                    <span className="hs-floor-no" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
                    <strong>{s.label[locale]}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div role="tabpanel" id={`${base}-jp`} aria-labelledby={`${base}-jt-${active}`} className="hs-panel" key={stage.id}>
              <p className="hs-panel-step">
                {C.step[locale]} <bdi>{active + 1}</bdi> {C.of[locale]} <bdi>{CONSTRUCTION_JOURNEY.length}</bdi>
              </p>
              <h3>{stage.label[locale]}</h3>
              <p className="hs-panel-lead">{stage.purpose[locale]}</p>
              <dl className="hs-facts">
                <div>
                  <dt>{C.documents[locale]}</dt>
                  <dd className="hs-codes">
                    {stage.documents.map(d => (
                      <code key={d} dir="ltr">{d}</code>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>{C.owner[locale]}</dt>
                  <dd>{stage.owner[locale]}</dd>
                </div>
                <div>
                  <dt>{C.status[locale]}</dt>
                  <dd><span className="sp-state">{stage.status[locale]}</span></dd>
                </div>
                <div className="hs-wide">
                  <dt>{C.implication[locale]}</dt>
                  <dd>{stage.implication[locale]}</dd>
                </div>
              </dl>
              <p className="hs-panel-note">{C.noShot[locale]}</p>
              <DeptLink path={stage.dept} locale={locale} />
            </div>
          </div>
        </div>
      </section>

      <section className="hs-block" data-alt="" aria-labelledby={`${base}-m`}>
        <div className="dp-wrap">
          <Head kicker={CON.moneyKicker[locale]} title={CON.moneyTitle[locale]} lede={CON.moneyLede[locale]} id={`${base}-m`} />
          <ol role="list" className="hs-chain">
            {CONSTRUCTION_MONEY_CHAIN.map((m, i) => (
              <li key={m.id} data-motion-step style={{ '--i': i } as CSSProperties}>
                <span className="hs-chain-no" dir="ltr">{i + 1}</span>
                <strong>{m.label[locale]}</strong>
                <span>{m.means[locale]}</span>
                {i < CONSTRUCTION_MONEY_CHAIN.length - 1 && <Arrow aria-hidden="true" className="hs-chain-arrow" />}
              </li>
            ))}
          </ol>
          <h3 className="hs-sub">{CON.costTitle[locale]}</h3>
          <ul role="list" className="hs-measures">
            {CONSTRUCTION_COST_MEASURES.map(m => (
              <li key={m.id} data-motion-card>
                <strong>{m.label[locale]}</strong>
                <p>{m.means[locale]}</p>
                <p className="hs-not">{m.notThis[locale]}</p>
              </li>
            ))}
          </ul>
          <DeptLink path="/construction/budget-cost" locale={locale} />
        </div>
      </section>

      <section className="hs-block" aria-labelledby={`${base}-c`}>
        <div className="dp-wrap">
          <Head kicker={CON.changeKicker[locale]} title={CON.changeTitle[locale]} id={`${base}-c`} />
          <ol role="list" className="hs-change">
            {CONSTRUCTION_CHANGE.map(c => (
              <li key={c.id} data-motion-step>
                <strong>{c.label[locale]}</strong>
                <span>{c.body[locale]}</span>
              </li>
            ))}
          </ol>
          <p className="hs-panel-note">{CON.changeNote[locale]}</p>
          <DeptLink path="/construction/contracts" locale={locale} />
        </div>
      </section>
    </div>
  );
}

/* =========================== CRM =========================== */
const CRM = {
  kicker: { ar: 'من العميل المحتمل إلى الصفقة', en: 'Lead to deal' },
  title: { ar: 'العميل ليس بطاقة بيانات… بل رحلة بيع تحتاج مسؤولًا وخطوة تالية', en: 'A customer is not a data card… but a sales journey that needs an owner and a next step' },
  lede: { ar: 'اختر مرحلة لترى السجلات والإجراءات والناتج، والشاشة الفعلية حيث توجد.', en: 'Choose a stage to see the records, actions and outcome, and the real screen where one exists.' },
  stages: { ar: 'مراحل رحلة البيع', en: 'Sales journey stages' },
  wbKicker: { ar: 'منصة مدير المبيعات', en: 'Sales manager workbench' },
  wbTitle: { ar: 'ما يحتاج قرارًا… ومن يملكه… ومن أين الدليل', en: 'What needs a decision… who owns it… and where the evidence is' },
  wbLede: { ar: 'ليست لوحة كانبان للزينة: كل استثناء يقود إلى السجل الذي يثبته.', en: 'Not a decorative Kanban board: every exception leads to the record that proves it.' },
  wbList: { ar: 'استثناءات المدير', en: 'Manager exceptions' },
  handoff: { ar: 'DIGIT CRM يتوقف عند الفوز بالصفقة؛ عرض السعر وما بعده في مبيعات DIGIT Pro.', en: 'DIGIT CRM stops at the won deal; the quotation and everything after it live in DIGIT Pro Selling.' },
} satisfies Record<string, L>;

export function CrmStory() {
  const locale = useLocale();
  const base = useId();
  const { active, tabProps } = useTabs(CRM_JOURNEY.length, locale);
  const stage = CRM_JOURNEY[active]!;
  const wb = useTabs(CRM_WORKBENCH.length, locale, true);
  const item = CRM_WORKBENCH[wb.active]!;
  return (
    <div className="hs" data-product="crm">
      <section className="hs-block" aria-labelledby={`${base}-j`}>
        <div className="dp-wrap">
          <Head kicker={CRM.kicker[locale]} title={CRM.title[locale]} lede={CRM.lede[locale]} id={`${base}-j`} />
          <div role="tablist" aria-label={CRM.stages[locale]} className="hs-stepper" style={{ '--n': CRM_JOURNEY.length } as CSSProperties}>
            {CRM_JOURNEY.map((s, i) => (
              <button key={s.id} {...tabProps(i, `${base}-jp`, `${base}-jt-${i}`)} className="hs-step" data-done={i < active ? '' : undefined}>
                <span className="hs-step-no" dir="ltr">{i + 1}</span>
                <strong>{s.label[locale]}</strong>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${base}-jp`} aria-labelledby={`${base}-jt-${active}`} className="hs-split" key={stage.id}>
            <div className="hs-panel">
              <h3>{stage.label[locale]}</h3>
              <dl className="hs-facts">
                <div className="hs-wide">
                  <dt>{C.objects[locale]}</dt>
                  <dd className="hs-codes">
                    {stage.objects.map(o => (
                      <code key={o} dir="ltr">{o}</code>
                    ))}
                  </dd>
                </div>
                <div className="hs-wide">
                  <dt>{C.actions[locale]}</dt>
                  <dd>
                    <ul role="list" className="hs-bullets">
                      {stage.actions.map((a, i) => (
                        <li key={i}>{a[locale]}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div className="hs-wide">
                  <dt>{C.outcome[locale]}</dt>
                  <dd>{stage.outcome[locale]}</dd>
                </div>
              </dl>
              <StatusChip status={stage.status} locale={locale} />
              {stage.id === 'handoff' && <p className="hs-panel-note">{CRM.handoff[locale]}</p>}
              <DeptLink path={stage.dept} locale={locale} />
            </div>
            {stage.shot ? <Lens shotId={stage.shot.id} focus={stage.shot.focus} locale={locale} /> : <PhotoNote photoKey="crm-sales-call" locale={locale} />}
          </div>
        </div>
      </section>

      <section className="hs-block" data-alt="" aria-labelledby={`${base}-w`}>
        <div className="dp-wrap">
          <Head kicker={CRM.wbKicker[locale]} title={CRM.wbTitle[locale]} lede={CRM.wbLede[locale]} id={`${base}-w`} />
          <div className="hs-workbench">
            <div role="tablist" aria-label={CRM.wbList[locale]} aria-orientation="vertical" className="hs-wb-list">
              {CRM_WORKBENCH.map((w, i) => (
                <button key={w.id} {...wb.tabProps(i, `${base}-wp`, `${base}-wt-${i}`)} className="hs-wb-item">
                  <strong>{w.label[locale]}</strong>
                  <StatusChip status={w.status} locale={locale} />
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`${base}-wp`} aria-labelledby={`${base}-wt-${wb.active}`} className="hs-wb-panel" key={item.id}>
              <dl className="hs-facts">
                <div className="hs-wide">
                  <dt>{C.decision[locale]}</dt>
                  <dd className="hs-big">{item.decision[locale]}</dd>
                </div>
                <div>
                  <dt>{C.owner[locale]}</dt>
                  <dd>{item.owner[locale]}</dd>
                </div>
                <div>
                  <dt>{C.source[locale]}</dt>
                  <dd>{item.source[locale]}</dd>
                </div>
              </dl>
              {item.shot ? <Lens shotId={item.shot.id} focus={item.shot.focus} locale={locale} /> : <p className="hs-panel-note">{C.noShot[locale]}</p>}
            </div>
          </div>
          <DeptLink path="/crm/management" locale={locale} />
        </div>
      </section>
    </div>
  );
}

function PhotoNote({ photoKey, locale }: { photoKey: string; locale: Locale }) {
  const pic = photoOf(photoKey);
  return (
    <figure className="hs-photo-note">
      {pic && <img src={pic.src} width={pic.width} height={pic.height} alt={pic.alt[locale]} loading="lazy" decoding="async" />}
      <figcaption>{C.noShot[locale]}</figcaption>
    </figure>
  );
}

/* =========================== POS =========================== */
const POS = {
  kicker: { ar: 'DIGIT POS', en: 'DIGIT POS' },
  title: { ar: 'البيعة تبدأ من الكاشير… وتكتمل في عمليات الشركة', en: 'The sale starts at the till… and completes in company operations' },
  lede: { ar: 'ثلاثة فصول من شاشة البيع إلى المخزون والمحاسبة؛ ما يعتمد على الربط معلَّم بوضوح.', en: 'Three chapters from the selling screen to inventory and accounting; what depends on integration is clearly labelled.' },
  exKicker: { ar: 'مستكشف الأنشطة', en: 'Industries explorer' },
  exTitle: { ar: 'اختر نشاطك التجاري', en: 'Choose your retail business' },
  exLede: { ar: 'اثنا عشر نشاطًا يستهدفها DIGIT POS. لكل نشاط سيناريو واعتبارات خاصة؛ هذا لا يعني أن لكل نشاط تطبيقًا مستقلًا.', en: 'Twelve retail segments DIGIT POS targets. Each has its own scenario and considerations; this does not mean each has a separate application.' },
  search: { ar: 'ابحث عن نشاط', en: 'Search a business type' },
  clear: { ar: 'مسح البحث', en: 'Clear search' },
  none: { ar: 'لا يوجد نشاط مطابق. جرّب كلمة أخرى أو تواصل معنا لنشاطك.', en: 'No matching business. Try another word or tell us about yours.' },
  list: { ar: 'الأنشطة', en: 'Business types' },
  scenario: { ar: 'السيناريو', en: 'Scenario' },
  caps: { ar: 'قدرات نقاط البيع المطبقة', en: 'Applicable POS capabilities' },
  special: { ar: 'اعتبارات خاصة', en: 'Special considerations' },
  related: { ar: 'صفحة النشاط', en: 'Business page' },
  demo: { ar: 'احجز ديمو لهذا النشاط', en: 'Book a demo for this business' },
  photoNote: { ar: 'صورة توضيحية للنشاط', en: 'Illustrative photo of the business' },
} satisfies Record<string, L>;

export function PosStory() {
  const locale = useLocale();
  const base = useId();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(POS_INDUSTRIES[0]!.id);
  const pic = photoOf('pos-counter');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? POS_INDUSTRIES.filter(x => x.label.ar.includes(q) || x.label.en.toLowerCase().includes(q) || x.id.includes(q)) : POS_INDUSTRIES;
  }, [query]);
  const current = POS_INDUSTRIES.find(x => x.id === selected)!;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, matches.findIndex(x => x.id === selected));
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const fwd = e.key === 'ArrowDown' || e.key === (locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    const back = e.key === 'ArrowUp' || e.key === (locale === 'ar' ? 'ArrowRight' : 'ArrowLeft');
    if (!fwd && !back) return;
    e.preventDefault();
    const next = (index + (fwd ? 1 : -1) + matches.length) % matches.length;
    const target = matches[next];
    if (!target) return;
    setSelected(target.id);
    refs.current[next]?.focus();
  };
  return (
    <div className="hs" data-product="pos">
      <section className="hs-block" aria-labelledby={`${base}-c`}>
        <div className="dp-wrap">
          <div className="hs-pos-intro">
            <Head kicker={POS.kicker[locale]} title={POS.title[locale]} lede={POS.lede[locale]} id={`${base}-c`} />
            {pic && <img className="hs-pos-photo" src={pic.src} width={pic.width} height={pic.height} alt={pic.alt[locale]} loading="lazy" decoding="async" />}
          </div>
          <ol role="list" className="hs-chapters">
            {POS_CHAPTERS.map((ch, i) => (
              <li key={ch.id} data-motion-card data-chapter={ch.id}>
                <span className="hs-chapter-no" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
                <h3>{ch.title[locale]}</h3>
                <p>{ch.lede[locale]}</p>
                <ul role="list">
                  {ch.items.map((it, j) => (
                    <li key={j}>
                      <span>{it.label[locale]}</span>
                      <StatusChip status={it.status} locale={locale} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="hs-block" data-alt="" aria-labelledby={`${base}-x`}>
        <div className="dp-wrap">
          <Head kicker={POS.exKicker[locale]} title={POS.exTitle[locale]} lede={POS.exLede[locale]} id={`${base}-x`} />
          <div className="hs-explorer">
            <div className="hs-ex-side">
              <label className="hs-search">
                <Search aria-hidden="true" />
                <span className="sr-only">{POS.search[locale]}</span>
                <Input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={POS.search[locale]} aria-controls={`${base}-xl`} />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label={POS.clear[locale]} className="hs-search-clear">
                    <X aria-hidden="true" />
                  </button>
                )}
              </label>
              {matches.length ? (
                <div role="tablist" id={`${base}-xl`} aria-label={POS.list[locale]} aria-orientation="vertical" className="hs-ex-list">
                  {matches.map((x, i) => (
                    <button
                      key={x.id}
                      ref={el => {
                        refs.current[i] = el;
                      }}
                      id={`${base}-xt-${x.id}`}
                      type="button"
                      role="tab"
                      aria-selected={x.id === selected}
                      aria-controls={`${base}-xp`}
                      tabIndex={x.id === selected || (i === 0 && !matches.some(m => m.id === selected)) ? 0 : -1}
                      onClick={() => setSelected(x.id)}
                      onKeyDown={onKeyDown}
                      className="hs-ex-item"
                    >
                      {x.label[locale]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="hs-panel-note" role="status">{POS.none[locale]}</p>
              )}
            </div>
            <div role="tabpanel" id={`${base}-xp`} aria-labelledby={`${base}-xt-${current.id}`} className="hs-ex-panel" key={current.id}>
              <figure className="hs-ex-photo">
                <img src={industryPhoto(current.id)} width={1200} height={800} alt={`${current.label[locale]} — ${POS.photoNote[locale]}`} loading="lazy" decoding="async" />
              </figure>
              <div className="hs-ex-copy">
                <h3>{current.label[locale]}</h3>
                <p className="hs-panel-lead">
                  <span className="sr-only">{POS.scenario[locale]}: </span>
                  {current.scenario[locale]}
                </p>
                <div className="hs-ex-cols">
                  <div>
                    <h4>{POS.caps[locale]}</h4>
                    <ul role="list" className="hs-bullets">
                      {current.capabilities.map((c, i) => (
                        <li key={i}>{c[locale]}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>{POS.special[locale]}</h4>
                    <ul role="list" className="hs-scoped">
                      {current.considerations.map((c, i) => (
                        <li key={i}>
                          <StatusChip status="scoped" locale={locale} />
                          <span>{c[locale]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="hs-ex-actions">
                  <Button onClick={() => focusLeadForm({ product: 'pos', interest: `DIGIT POS — ${current.label[locale]}` })}>{POS.demo[locale]}</Button>
                  <DeptLink path={current.route} locale={locale} label={POS.related} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =========================== FSM + ITM =========================== */
const FSM = {
  kicker: { ar: 'رحلة الخدمة', en: 'Service journey' },
  title: { ar: 'من العميل إلى الإغلاق المؤكد… كل خطوة لها سجل ومسؤول', en: 'From customer to verified closure… every step has a record and an owner' },
  lede: { ar: 'اختر خطوة لترى السجل والمسؤول والحالة والناتج.', en: 'Choose a step to see its record, owner, state and output.' },
  steps: { ar: 'خطوات رحلة الخدمة', en: 'Service journey steps' },
  loopKicker: { ar: 'قصة الفحص', en: 'Inspection story' },
  loopTitle: { ar: 'الفحص ليس نهاية المهمة', en: 'Inspection is not the end of the job' },
  loopLede: { ar: 'اختر نتيجة إعادة الاختبار لترى ما يحدث للعيب.', en: 'Choose the retest result to see what happens to the deficiency.' },
  result: { ar: 'نتيجة إعادة الاختبار', en: 'Retest result' },
  pass: { ar: 'ناجحة', en: 'Passed' },
  fail: { ar: 'فاشلة', en: 'Failed' },
  passMsg: { ar: 'نجحت إعادة الاختبار: يُغلق العيب إغلاقًا مؤكدًا ويُوثق للعميل.', en: 'Retest passed: the deficiency is closed as verified and documented for the customer.' },
  failMsg: { ar: 'فشلت إعادة الاختبار: يبقى العيب مفتوحًا ويبدأ عمل تصحيحي جديد. لا يظهر كمغلق.', en: 'Retest failed: the deficiency stays open and a new corrective job starts. It never shows as closed.' },
  open: { ar: 'العيب مفتوح', en: 'Deficiency open' },
  closed: { ar: 'مغلق مؤكد', en: 'Verified closed' },
  persKicker: { ar: 'منظوران', en: 'Two perspectives' },
  persTitle: { ar: 'الفني في الموقع… ومدير الخدمة في المكتب', en: 'The technician on site… the service manager in the office' },
  tech: { ar: 'الفني الميداني', en: 'Field technician' },
  techBody: { ar: 'يستلم زيارته، ويعرف الأجهزة وتاريخها، وينفذ الفحص بالقالب المعتمد، ويسجل النتيجة بالأدلة.', en: 'Receives the visit, knows the devices and their history, inspects against the approved template and records the result with evidence.' },
  mgr: { ar: 'مدير الخدمة', en: 'Service manager' },
  mgrBody: { ar: 'يرى الزيارات المتأخرة مقابل العقود، والعيوب المفتوحة حسب العمر، ويتدخل قبل أن يشتكي العميل.', en: 'Sees late visits against agreements and open deficiencies by age, and steps in before the customer complains.' },
  scope: { ar: 'لا ندّعي مزامنة دون اتصال، ولا بوابة عملاء، ولا شهادات امتثال، ولا تكاملات افتراضية؛ أي منها يُقيّم في النطاق.', en: 'We do not claim offline sync, a customer portal, compliance certificates or default integrations; any of these is assessed in scope.' },
} satisfies Record<string, L>;

export function FsmStory() {
  const locale = useLocale();
  const base = useId();
  const { active, tabProps } = useTabs(FSM_JOURNEY.length, locale);
  const step = FSM_JOURNEY[active]!;
  const [passed, setPassed] = useState(true);
  const tech = photoOf('fsm-inspection');
  return (
    <div className="hs" data-product="fsm">
      <section className="hs-block" aria-labelledby={`${base}-j`}>
        <div className="dp-wrap">
          <Head kicker={FSM.kicker[locale]} title={FSM.title[locale]} lede={FSM.lede[locale]} id={`${base}-j`} />
          <div role="tablist" aria-label={FSM.steps[locale]} className="hs-rail">
            {FSM_JOURNEY.map((s, i) => (
              <button key={s.id} {...tabProps(i, `${base}-jp`, `${base}-jt-${i}`)} className="hs-rail-step" data-done={i < active ? '' : undefined}>
                <span className="hs-step-no" dir="ltr">{i + 1}</span>
                <span>{s.label[locale]}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${base}-jp`} aria-labelledby={`${base}-jt-${active}`} className="hs-panel hs-panel-row" key={step.id}>
            <div>
              <p className="hs-panel-step">
                {C.step[locale]} <bdi>{active + 1}</bdi> {C.of[locale]} <bdi>{FSM_JOURNEY.length}</bdi>
              </p>
              <h3>{step.label[locale]}</h3>
            </div>
            <dl className="hs-facts hs-facts-4">
              <div>
                <dt>{C.record[locale]}</dt>
                <dd><code dir="ltr">{step.record}</code></dd>
              </div>
              <div>
                <dt>{C.owner[locale]}</dt>
                <dd>{step.owner[locale]}</dd>
              </div>
              <div>
                <dt>{C.state[locale]}</dt>
                <dd><span className="sp-state">{step.state[locale]}</span></dd>
              </div>
              <div>
                <dt>{C.output[locale]}</dt>
                <dd>{step.output[locale]}</dd>
              </div>
            </dl>
            <DeptLink path={step.dept} locale={locale} />
          </div>
        </div>
      </section>

      <section className="hs-block" data-alt="" aria-labelledby={`${base}-l`}>
        <div className="dp-wrap">
          <Head kicker={FSM.loopKicker[locale]} title={FSM.loopTitle[locale]} lede={FSM.loopLede[locale]} id={`${base}-l`} />
          <fieldset className="hs-toggle">
            <legend>{FSM.result[locale]}</legend>
            <label data-on={passed ? '' : undefined}>
              <input type="radio" name={`${base}-r`} checked={passed} onChange={() => setPassed(true)} />
              {FSM.pass[locale]}
            </label>
            <label data-on={!passed ? '' : undefined} data-fail="">
              <input type="radio" name={`${base}-r`} checked={!passed} onChange={() => setPassed(false)} />
              {FSM.fail[locale]}
            </label>
          </fieldset>
          <ol role="list" className="hs-loop" data-result={passed ? 'pass' : 'fail'}>
            {FSM_LOOP.map((s, i) => {
              const state = s.id === 'closure' ? (passed ? 'closed' : 'blocked') : s.id === 'deficiency' && !passed ? 'reopened' : 'done';
              return (
                <li key={s.id} data-state={state} style={{ '--i': i } as CSSProperties}>
                  <span className="hs-step-no" dir="ltr">{i + 1}</span>
                  <strong>{s.label[locale]}</strong>
                  <span>{s.body[locale]}</span>
                  {s.id === 'deficiency' && <em className="hs-loop-flag">{passed ? '' : FSM.open[locale]}</em>}
                  {s.id === 'closure' && <em className="hs-loop-flag">{passed ? FSM.closed[locale] : ''}</em>}
                </li>
              );
            })}
          </ol>
          <p className="sp-callout" role="status" aria-live="polite">
            <RotateCcw aria-hidden="true" />
            {passed ? FSM.passMsg[locale] : FSM.failMsg[locale]}
          </p>
          <DeptLink path="/fsm/deficiencies" locale={locale} />
        </div>
      </section>

      <section className="hs-block" aria-labelledby={`${base}-p`}>
        <div className="dp-wrap hs-persp">
          <div>
            <Head kicker={FSM.persKicker[locale]} title={FSM.persTitle[locale]} id={`${base}-p`} />
            <ul role="list" className="hs-persp-list">
              <li data-motion-card>
                <h3>{FSM.tech[locale]}</h3>
                <p>{FSM.techBody[locale]}</p>
              </li>
              <li data-motion-card>
                <h3>{FSM.mgr[locale]}</h3>
                <p>{FSM.mgrBody[locale]}</p>
              </li>
            </ul>
            <p className="hs-panel-note">{FSM.scope[locale]}</p>
          </div>
          {tech && <img className="hs-persp-photo" src={tech.src} width={tech.width} height={tech.height} alt={tech.alt[locale]} loading="lazy" decoding="async" />}
        </div>
      </section>
    </div>
  );
}

/** Story placed on an imported product overview page, by its page key. */
export const HUB_STORIES: Record<string, () => ReactNode> = {
  'modules-contracting': () => <ConstructionStory />,
  'modules-crm': () => <CrmStory />,
  'modules-pos': () => <PosStory />,
};
