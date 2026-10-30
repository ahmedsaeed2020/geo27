import { useMemo, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Archive, ArchiveRestore, Image as ImageIcon, Lock, RefreshCw, Save, Upload } from 'lucide-react';
import { addMediaVariant, archiveCmsMedia, replaceCmsMedia, updateCmsMedia, uploadCmsMedia } from '@/lib/media.functions';
import { blobToBase64, imageSize, makeVariants } from '@/lib/image-variants';
import { SHOTS } from '@/content/product-shots';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import AuthedImage from './AuthedImage';
import { EmptyState, errorText, Field, formatDate, NativeSelect, StatusPill, useRefresh, type ConfigRow, type Doc, type Media } from './shared';

const MAX = 8 * 1024 * 1024;
type Filter = 'all' | 'pending' | 'approved' | 'unused' | 'archived';

export function usageOf(url: string, docs: Doc[], config: ConfigRow[]) {
  const has = (v: unknown) => !!v && JSON.stringify(v).includes(url);
  return {
    published: [...docs.filter(d => has(d.published) || has(d.scheduled)).map(d => d.path), ...config.filter(c => has(c.published)).map(c => `الإعدادات: ${c.key}`)],
    drafts: [...docs.filter(d => has(d.draft) && !has(d.published)).map(d => d.path), ...config.filter(c => has(c.draft) && !has(c.published)).map(c => `الإعدادات: ${c.key}`)],
  };
}

function formatBytes(n: number | null | undefined) {
  if (!n) return '';
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export default function MediaLibrary({ rows, docs, config, owner, notice }: { rows: Media[]; docs: Doc[]; config: ConfigRow[]; owner: boolean; notice: (s: string) => void }) {
  const upload = useServerFn(uploadCmsMedia);
  const variant = useServerFn(addMediaVariant);
  const update = useServerFn(updateCmsMedia);
  const replace = useServerFn(replaceCmsMedia);
  const archive = useServerFn(archiveCmsMedia);
  const refresh = useRefresh();
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Media | null>(null);
  const [error, setError] = useState('');
  const replaceInput = useRef<HTMLInputElement>(null);

  const usage = useMemo(() => new Map(rows.map(m => [m.id, usageOf(m.url, docs, config)])), [rows, docs, config]);
  const visible = rows.filter(m => {
    const u = usage.get(m.id);
    const unused = !u?.published.length && !u?.drafts.length;
    const match = !q || `${m.title} ${m.alt_ar} ${m.alt_en}`.toLowerCase().includes(q.toLowerCase());
    const f =
      filter === 'all' ? !m.archived_at : filter === 'archived' ? !!m.archived_at : filter === 'pending' ? m.approval !== 'approved' && !m.archived_at : filter === 'approved' ? m.approval === 'approved' && !m.archived_at : unused && !m.archived_at;
    return match && f;
  });

  /** Stores the resized copies and returns their sizes so the open detail panel shows them immediately. */
  async function storeVariants(id: string, file: Blob) {
    const made = await makeVariants(file);
    for (const v of made) await variant({ data: { id, width: v.width, height: v.height, base64: await blobToBase64(v.blob) } });
    return made.map(v => ({ width: v.width, height: v.height }));
  }

  async function onUpload(file: File) {
    setError('');
    if (file.size > MAX) return setError('الحد الأقصى لحجم الصورة 8 ميجابايت.');
    setBusy('upload');
    try {
      const size = await imageSize(file);
      const name = file.name.replace(/\.[a-z0-9]+$/i, '');
      const row = await upload({ data: { base64: await blobToBase64(file), title: name, altAr: '', altEn: '', source: 'رفع من لوحة الإدارة', ...size } });
      setBusy('variants');
      const variants = await storeVariants(row.id, file);
      await refresh();
      setSelected({ ...(row as Media), variants });
      notice('رُفعت الصورة كمسودة. أضف الوصف بالعربية والإنجليزية ثم اعتمدها.');
    } catch (e) {
      setError(errorText(e, 'تعذّر رفع الصورة.'));
    } finally {
      setBusy('');
    }
  }

  async function onReplace(file: File) {
    if (!selected) return;
    setError('');
    if (file.size > MAX) return setError('الحد الأقصى لحجم الصورة 8 ميجابايت.');
    setBusy('replace');
    try {
      const size = await imageSize(file);
      await replace({ data: { id: selected.id, base64: await blobToBase64(file), ...size } });
      const variants = await storeVariants(selected.id, file);
      await refresh();
      setSelected({ ...selected, ...size, variants, replaced_at: new Date().toISOString() });
      notice('استُبدل ملف الصورة. كل الصفحات التي تستخدمها تعرض النسخة الجديدة خلال دقائق.');
    } catch (e) {
      setError(errorText(e, 'تعذّر استبدال الصورة.'));
    } finally {
      setBusy('');
    }
  }

  async function saveSelected(approval: 'draft' | 'approved') {
    if (!selected) return;
    setError('');
    setBusy('save');
    try {
      await update({
        data: { id: selected.id, title: selected.title, altAr: selected.alt_ar, altEn: selected.alt_en, source: selected.source || 'رفع من لوحة الإدارة', approval, focalX: selected.focal_x, focalY: selected.focal_y },
      });
      await refresh();
      setSelected(null);
      notice(approval === 'approved' ? 'اعتُمدت الصورة وأصبحت متاحة للصفحات.' : 'تم حفظ الصورة.');
    } catch (e) {
      setError(/descriptions before approval/.test(String((e as Error)?.message)) ? 'أضف الوصف العربي والإنجليزي قبل الاعتماد.' : errorText(e));
    } finally {
      setBusy('');
    }
  }

  const selUsage = selected ? usage.get(selected.id) : undefined;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <Input aria-label="بحث الصور" placeholder="ابحث بالاسم أو الوصف" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
        <NativeSelect aria-label="تصفية الصور" className="w-48" value={filter} onChange={e => setFilter(e.target.value as Filter)}>
          <option value="all">كل الصور النشطة</option>
          <option value="pending">بانتظار الاعتماد</option>
          <option value="approved">معتمدة</option>
          <option value="unused">غير مستخدمة</option>
          <option value="archived">مؤرشفة</option>
        </NativeSelect>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium aria-disabled:opacity-60" aria-disabled={!!busy}>
          <Upload size={16} />
          {busy === 'upload' ? 'جارٍ الرفع…' : busy === 'variants' ? 'تجهيز المقاسات…' : 'رفع صورة'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={!!busy}
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onUpload(f);
            }}
          />
        </label>
      </div>
      <p className="mb-5 text-xs text-muted-foreground">PNG أو JPEG أو WebP حتى 8 ميجابايت. تُجهّز نسخ أصغر تلقائيًا للجوال. الصور لا تظهر للزوار قبل اعتماد المالك.</p>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {selected && (
        <section className="mb-8 grid gap-6 rounded-lg border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <div className="relative overflow-hidden rounded-md bg-muted">
              <AuthedImage
                src={`${selected.url}${selected.replaced_at ? `?v=${new Date(selected.replaced_at).getTime()}` : ''}`}
                isPublic={selected.approval === 'approved' && !selected.archived_at}
                alt={selected.alt_ar || selected.title}
                width={selected.width ?? 600}
                height={selected.height ?? 400}
                className="aspect-[3/2] w-full object-cover"
                style={{ objectPosition: `${selected.focal_x}% ${selected.focal_y}%` }}
              />
              <span className="cms-focal" style={{ insetInlineStart: `${selected.focal_x}%`, top: `${selected.focal_y}%` }} aria-hidden="true" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              <span dir="ltr">
                {selected.width} × {selected.height}
              </span>{' '}
              · {formatBytes(selected.bytes)} · {((selected.variants as unknown[]) ?? []).length} مقاسات للجوال
            </p>
            <div className="mt-3 text-sm">
              <p className="font-semibold">مستخدمة في</p>
              {selUsage?.published.length || selUsage?.drafts.length ? (
                <ul className="mt-1 space-y-1 text-xs">
                  {selUsage.published.map(p => (
                    <li key={`p${p}`} dir="ltr" className="text-start">
                      <StatusPill tone="good">منشور</StatusPill> {p}
                    </li>
                  ))}
                  {selUsage.drafts.map(p => (
                    <li key={`d${p}`} dir="ltr" className="text-start">
                      <StatusPill>مسودة</StatusPill> {p}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">غير مستخدمة بعد.</p>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <Field label="الاسم">
              <Input value={selected.title} onChange={e => setSelected({ ...selected, title: e.target.value })} />
            </Field>
            <Field label="الوصف العربي (نص بديل)" hint="صف ما في الصورة لمن لا يراها.">
              <Input value={selected.alt_ar} onChange={e => setSelected({ ...selected, alt_ar: e.target.value })} />
            </Field>
            <Field label="English description (alt text)">
              <Input dir="ltr" value={selected.alt_en} onChange={e => setSelected({ ...selected, alt_en: e.target.value })} />
            </Field>
            <Field label="المصدر / حقوق الصورة">
              <Input value={selected.source} onChange={e => setSelected({ ...selected, source: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`نقطة التركيز الأفقية ${selected.focal_x}%`}>
                <Slider min={0} max={100} step={1} value={[selected.focal_x]} onValueChange={([v]) => setSelected({ ...selected, focal_x: v ?? 50 })} />
              </Field>
              <Field label={`نقطة التركيز الرأسية ${selected.focal_y}%`}>
                <Slider min={0} max={100} step={1} value={[selected.focal_y]} onValueChange={([v]) => setSelected({ ...selected, focal_y: v ?? 50 })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => saveSelected(selected.approval === 'approved' ? 'approved' : 'draft')} disabled={!!busy}>
                <Save size={16} />
                حفظ
              </Button>
              {owner && selected.approval !== 'approved' && (
                <Button variant="outline" onClick={() => saveSelected('approved')} disabled={!!busy}>
                  حفظ واعتماد للنشر
                </Button>
              )}
              {owner && selected.approval === 'approved' && (
                <Button variant="outline" onClick={() => saveSelected('draft')} disabled={!!busy || !!selUsage?.published.length} title={selUsage?.published.length ? 'مستخدمة في صفحات منشورة' : undefined}>
                  سحب الاعتماد
                </Button>
              )}
              <Button variant="outline" onClick={() => replaceInput.current?.click()} disabled={!!busy || (selected.approval === 'approved' && !owner)}>
                <RefreshCw size={16} />
                {busy === 'replace' ? 'جارٍ الاستبدال…' : 'استبدال الملف'}
              </Button>
              <input
                ref={replaceInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void onReplace(f);
                }}
              />
              {owner && (
                <Button
                  variant="ghost"
                  disabled={!!busy || (!selected.archived_at && !!(selUsage?.published.length || selUsage?.drafts.length))}
                  title={!selected.archived_at && (selUsage?.published.length || selUsage?.drafts.length) ? 'أزل الصورة من الصفحات أولًا' : undefined}
                  onClick={async () => {
                    try {
                      await archive({ data: { id: selected.id, archived: !selected.archived_at } });
                      await refresh();
                      setSelected(null);
                      notice(selected.archived_at ? 'استُعيدت الصورة.' : 'أُرشفت الصورة.');
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  {selected.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  {selected.archived_at ? 'استعادة' : 'أرشفة'}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setSelected(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        </section>
      )}

      <div className="v3-media-grid">
        {visible.map(m => {
          const u = usage.get(m.id);
          return (
            <button key={m.id} type="button" className="rounded-lg border border-border bg-card p-3 text-start transition-colors hover:border-primary" onClick={() => { setSelected(m); setError(''); }}>
              <AuthedImage
                src={`${m.url}?w=480${m.replaced_at ? `&v=${new Date(m.replaced_at).getTime()}` : ''}`}
                isPublic={m.approval === 'approved' && !m.archived_at}
                alt={m.alt_ar || m.title}
                width={m.width ?? 300}
                height={m.height ?? 200}
                loading="lazy"
                className="h-40 w-full rounded bg-muted object-contain"
              />
              <h3 className="mt-2 truncate font-bold">{m.title}</h3>
              <div className="mt-1 flex flex-wrap gap-1">
                {m.archived_at ? <StatusPill>مؤرشفة</StatusPill> : m.approval === 'approved' ? <StatusPill tone="good">معتمدة</StatusPill> : <StatusPill tone="warn">بانتظار الاعتماد</StatusPill>}
                {u?.published.length ? <StatusPill tone="info">في {u.published.length} منشور</StatusPill> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(m.created_at, false)}</p>
            </button>
          );
        })}
      </div>
      {!visible.length && <EmptyState>لا توجد صور مطابقة.</EmptyState>}

      <h3 className="mb-2 mt-10 flex items-center gap-2 text-xl font-bold">
        <Lock size={18} />
        {Object.keys(SHOTS).length} شاشة DIGIT Pro أصلية — محفوظة دون تعديل
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">أصول المنتج الأصلية مقفلة: يمكن اختيارها في الأقسام وصور المشاركة، ولا تُستبدل أو تُحذف من هنا.</p>
      <div className="v3-media-grid">
        {Object.values(SHOTS)
          .filter(s => !q || s.caption.ar.includes(q) || s.id.includes(q))
          .map(s => (
            <article key={s.id} className="rounded-lg border border-border bg-card p-3">
              <img src={s.src} alt={s.caption.ar} width={s.width} height={s.height} loading="lazy" className="h-36 w-full object-contain" />
              <p className="mt-2 text-sm font-bold">{s.caption.ar}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ImageIcon size={12} />
                <span dir="ltr">
                  {s.width} × {s.height}
                </span>
              </p>
            </article>
          ))}
      </div>
    </>
  );
}
