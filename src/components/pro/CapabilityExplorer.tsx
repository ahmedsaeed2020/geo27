import { useState } from 'react';
import { useLocale } from '@/lib/i18n';
import { PRO_COPY as C } from './pro-copy';
import { ProScreen, useSectionLightbox } from './ProScreens';
import { SectionShell, type SectionProps } from './ProSections';

/** Capabilities filtered by outcome; every item is available today and shown on the real screen it was verified on. */
export function ExplorerSection({ s, title, lede, eyebrow }: SectionProps<'explorer'>) {
  const locale = useLocale();
  const [theme, setTheme] = useState<string>('all');
  const visible = s.items.filter(i => theme === 'all' || i.theme === theme);
  const box = useSectionLightbox(visible.map(i => i.shot));
  return (
    <SectionShell id={s.id} kind="explorer" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]}>
      <div className="pv-dir-tools">
        <div className="pv-chips" role="radiogroup" aria-label={C.themes[locale]}>
          {[{ id: 'all', label: C.all }, ...s.themes].map(t => (
            <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className="pv-chip" onClick={() => setTheme(t.id)}>
              {t.label[locale]}
              <span dir="ltr">{t.id === 'all' ? s.items.length : s.items.filter(i => i.theme === t.id).length}</span>
            </button>
          ))}
        </div>
        <p className="pv-dir-count" aria-live="polite">
          <span dir="ltr">{visible.length}</span> {C.capabilitiesShown[locale]}
        </p>
      </div>
      <ul className="pv-explorer" role="list">
        {visible.map(item => (
          <li key={item.id} data-motion-card="">
            {item.shot && <ProScreen refId={item.shot} size="card" caption={false} open={box.open} />}
            <p className="pv-explorer-theme">{s.themes.find(t => t.id === item.theme)?.label[locale]}</p>
            <strong>{item.title[locale]}</strong>
            <span>{item.body[locale]}</span>
          </li>
        ))}
      </ul>
      {box.node}
    </SectionShell>
  );
}
