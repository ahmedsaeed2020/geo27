import { Link } from '@tanstack/react-router';
import { PRODUCTS } from '@/content/catalog';
import { localeHref, useLocale } from '@/lib/i18n';
import '@/product-orbit.css';

const COPY = {
  ar: { kicker: 'منظومة DIGIT', title: 'نظام واحد في المركز، وكل إدارة تدور حوله', lead: 'المالية والموارد البشرية والمقاولات والعملاء والخدمة الميدانية ونقاط البيع على بيانات واحدة. اختر المنتج لتبدأ.', core: 'بيانات واحدة' },
  en: { kicker: 'The DIGIT ecosystem', title: 'One system at the center, every department around it', lead: 'Finance, HR, construction, customers, field service and point of sale on one set of data. Pick a product to start.', core: 'One data core' },
};

export default function ProductOrbit() {
  const l = useLocale();
  const c = COPY[l];
  const n = PRODUCTS.length;
  return (
    <section className="po" aria-labelledby="po-title">
      <div className="po-wrap">
        <div className="po-copy">
          <p className="po-kicker">{c.kicker}</p>
          <h2 id="po-title" className="po-title">{c.title}</h2>
          <p className="po-lead">{c.lead}</p>
        </div>
        <div className="po-stage">
          <div className="po-ring po-ring-1" aria-hidden="true" />
          <div className="po-ring po-ring-2" aria-hidden="true" />
          <div className="po-rays" aria-hidden="true" />
          <div className="po-core" aria-hidden="true">
            <span className="po-core-name">DIGIT</span>
            <span className="po-core-sub">{c.core}</span>
          </div>
          <ul className="po-orbit">
            {PRODUCTS.map((p, i) => (
              <li key={p.key} className="po-node" style={{ ['--a' as string]: `${(360 / n) * i - 90}deg` }}>
                <Link to={localeHref(p.overview, l)} className="po-chip">
                  <strong>{p.area[l]}</strong>
                  <span>{p.name[l]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <ul className="po-list">
          {PRODUCTS.map(p => (
            <li key={p.key}><Link to={localeHref(p.overview, l)} className="po-chip"><strong>{p.area[l]}</strong><span>{p.name[l]}</span></Link></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
