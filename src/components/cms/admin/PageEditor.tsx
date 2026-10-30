import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useRouter } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, CalendarClock, Check, Copy, History, Link2, Plus, RotateCcw, Save, Trash2, XCircle } from 'lucide-react';
import { getCmsHistory, saveCmsDocument } from '@/lib/cms.functions';
import { createPreviewLink, revokePreviewLinks } from '@/lib/cms-admin.functions';
import { cmsContentSchema, type CmsBlock, type CmsContent } from '@/lib/cms-schema';
import { SHOTS } from '@/content/product-shots';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DOC_STATE_LABELS, errorText, Field, formatDate, NativeSelect, REVISION_LABELS, StatusPill, teamName, useRefresh, type Doc, type Media, type PreviewRow, type TeamMember } from './shared';

export const emptyContent = (): CmsContent => ({
  ar: { title: '', description: '', blocks: [], sourceEdits: {} },
  en: { title: '', description: '', blocks: [], sourceEdits: {} },
  indexable: true,
  evidence: 'pending',
  formEnabled: true,
  ogImage: '',
  canonical: '',
});

const BLOCK_TYPES: Record<CmsBlock['type'], string> = { story: 'قصة', workflow: 'رحلة عمل', faq: 'سؤال شائع', resource: 'مورد', cta: 'دعوة ديمو' };
type Action = 'save' | 'review' | 'publish' | 'unpublish' | 'rollback' | 'schedule' | 'unschedule';

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function PageEditor({
  doc,
  media,
  owner,
  previews,
  team,
  onBack,
  onSaved,
  notice,
}: {
  doc: Doc;
  media: Media[];
  owner: boolean;
  previews: PreviewRow[];
  team: TeamMember[];
  onBack: () => void;
  onSaved: (d: Doc) => void;
  notice: (s: string) => void;
}) {
  const parsed = cmsContentSchema.safeParse(doc.draft);
  const [c, setC] = useState<CmsContent>(parsed.success ? parsed.data : emptyContent());
  const [path, setPath] = useState(doc.path);
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getCmsHistory>> | null>(null);
  const [publishAt, setPublishAt] = useState(toLocalInput(doc.publish_at));
  const [unpublishAt, setUnpublishAt] = useState(toLocalInput(doc.unpublish_at));
  const [link, setLink] = useState<{ ar: string; en: string; expiresAt: string } | null>(null);
  const [hours, setHours] = useState(72);
  const save = useServerFn(saveCmsDocument);
  const hist = useServerFn(getCmsHistory);
  const makeLink = useServerFn(createPreviewLink);
  const revoke = useServerFn(revokePreviewLinks);
  const refresh = useRefresh();
  const router = useRouter();
  const approvedMedia = media.filter(m => m.approval === 'approved' && !m.archived_at);
  const local = c[locale];
  const activeLinks = previews.filter(p => p.document_id === doc.id).length;

  const edit = (next: CmsContent) => {
    setC(next);
    setDirty(true);
  };
  const update = (v: Partial<typeof local>) => edit({ ...c, [locale]: { ...local, ...v } });
  const updateBlock = (id: string, v: Partial<CmsBlock>) => update({ blocks: local.blocks.map(b => (b.id === id ? { ...b, ...v } : b)) });
  const move = (i: number, dir: -1 | 1) => {
    const a = [...local.blocks];
    const j = i + dir;
    const x = a[i];
    const y = a[j];
    if (!x || !y) return;
    a[i] = y;
    a[j] = x;
    update({ blocks: a });
  };

  async function act(action: Action) {
    setBusy(true);
    setError('');
    try {
      const d = await save({
        data: {
          ...(doc.id ? { id: doc.id } : {}),
          path,
          kind: doc.kind,
          content: c,
          version: doc.version,
          action,
          ...(action === 'schedule' ? { publishAt: fromLocalInput(publishAt), unpublishAt: fromLocalInput(unpublishAt) } : {}),
        },
      });
      setDirty(false);
      onSaved(d);
      await refresh();
      await router.invalidate();
      const done: Record<Action, string> = {
        save: 'تم حفظ المسودة.',
        review: 'أُرسلت الصفحة للمراجعة.',
        publish: 'نُشرت الصفحة.',
        unpublish: 'أُلغي نشر الصفحة.',
        rollback: 'استُعيد الإصدار ونُشر.',
        schedule: 'تم حفظ الجدولة.',
        unschedule: 'أُلغيت الجدولة.',
      };
      notice(done[action]);
      if (action === 'unschedule') {
        setPublishAt('');
        setUnpublishAt('');
      }
    } catch (e) {
      setError(errorText(e, 'تعذّر الحفظ.'));
    } finally {
      setBusy(false);
    }
  }

  async function shareLink() {
    if (!doc.id) return;
    setBusy(true);
    setError('');
    try {
      const r = await makeLink({ data: { documentId: doc.id, hours } });
      const origin = window.location.origin;
      const en = r.path === '/' ? '/en' : `/en${r.path}`;
      setLink({ ar: `${origin}${r.path}?preview=${r.token}`, en: `${origin}${en}?preview=${r.token}`, expiresAt: r.expiresAt });
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notice('نُسخ الرابط.');
    } catch {
      notice('انسخ الرابط يدويًا من الحقل.');
    }
  };

  const stateTone = doc.state === 'published' ? 'good' : doc.state === 'review' ? 'info' : 'muted';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => (!dirty || window.confirm('لديك تعديلات غير محفوظة. الخروج دون حفظ؟') ? onBack() : undefined)}>
          رجوع
        </Button>
        <StatusPill tone={stateTone}>{DOC_STATE_LABELS[doc.state] ?? doc.state}</StatusPill>
        {doc.publish_at && <StatusPill tone="info">نشر مجدول {formatDate(doc.publish_at)}</StatusPill>}
        {doc.unpublish_at && <StatusPill tone="warn">إلغاء نشر مجدول {formatDate(doc.unpublish_at)}</StatusPill>}
        {dirty && <StatusPill tone="warn">تعديلات غير محفوظة</StatusPill>}
        <span className="text-xs text-muted-foreground">الإصدار {doc.version} · آخر تعديل {formatDate(doc.updated_at)}</span>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button onClick={() => act('save')} disabled={busy}>
          <Save size={16} />
          حفظ المسودة
        </Button>
        {!owner && (
          <Button variant="outline" onClick={() => act('review')} disabled={busy}>
            إرسال للمراجعة
          </Button>
        )}
        {owner && (
          <>
            <Button onClick={() => act('publish')} disabled={busy}>
              <Check size={16} />
              نشر الآن
            </Button>
            {doc.published && (
              <Button variant="outline" onClick={() => act('unpublish')} disabled={busy}>
                إلغاء النشر
              </Button>
            )}
          </>
        )}
        <Button
          variant="outline"
          disabled={!doc.id}
          onClick={async () => {
            if (doc.id) setHistory(await hist({ data: doc.id }));
          }}
        >
          <History size={16} />
          الإصدارات
        </Button>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold">
            <Link2 size={16} />
            رابط معاينة للمراجعين
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">يعرض الصفحة كاملة بالمسودة المحفوظة لمن يملك الرابط فقط، دون فهرسة. احفظ قبل المشاركة. الروابط النشطة: {activeLinks}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="الصلاحية" className="w-36">
              <NativeSelect value={hours} onChange={e => setHours(Number(e.target.value))}>
                <option value={24}>24 ساعة</option>
                <option value={72}>3 أيام</option>
                <option value={168}>7 أيام</option>
              </NativeSelect>
            </Field>
            <Button variant="outline" onClick={shareLink} disabled={busy || !doc.id || dirty}>
              إنشاء رابط
            </Button>
            {activeLinks > 0 && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (!doc.id) return;
                  await revoke({ data: { documentId: doc.id } });
                  setLink(null);
                  await refresh();
                  notice('أُلغيت كل روابط المعاينة لهذه الصفحة.');
                }}
              >
                <XCircle size={16} />
                إلغاء الروابط
              </Button>
            )}
          </div>
          {dirty && <p className="mt-2 text-xs text-muted-foreground">احفظ المسودة أولًا ليعرض الرابط آخر تعديلاتك.</p>}
          {link && (
            <div className="mt-3 space-y-2">
              {(['ar', 'en'] as const).map(l => (
                <div key={l} className="flex gap-2">
                  <Input readOnly dir="ltr" value={link[l]} aria-label={l === 'ar' ? 'رابط المعاينة العربي' : 'English preview link'} onFocus={e => e.currentTarget.select()} />
                  <Button size="icon" variant="outline" aria-label="نسخ" onClick={() => copy(link[l])}>
                    <Copy size={15} />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">ينتهي {formatDate(link.expiresAt)}. لن يظهر هذا الرابط مرة أخرى؛ انسخه الآن.</p>
            </div>
          )}
        </section>

        {owner && (
          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold">
              <CalendarClock size={16} />
              الجدولة
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">ينشر المسودة الحالية تلقائيًا في الموعد، ويمكن تحديد موعد لإيقاف الصفحة (مثل حملة تنتهي). التوقيت حسب جهازك.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نشر في">
                <Input type="datetime-local" dir="ltr" value={publishAt} onChange={e => setPublishAt(e.target.value)} />
              </Field>
              <Field label="إلغاء النشر في">
                <Input type="datetime-local" dir="ltr" value={unpublishAt} onChange={e => setUnpublishAt(e.target.value)} />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => act('schedule')} disabled={busy || (!publishAt && !unpublishAt)}>
                حفظ الجدولة
              </Button>
              {(doc.publish_at || doc.unpublish_at) && (
                <Button variant="ghost" onClick={() => act('unschedule')} disabled={busy}>
                  إلغاء الجدولة
                </Button>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant={locale === 'ar' ? 'default' : 'outline'} onClick={() => setLocale('ar')}>
          العربية
        </Button>
        <Button variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>
          English
        </Button>
        <NativeSelect aria-label="جهاز المعاينة" className="w-36" value={device} onChange={e => setDevice(e.target.value as typeof device)}>
          <option value="desktop">كمبيوتر</option>
          <option value="mobile">جوال</option>
        </NativeSelect>
      </div>

      <div className="v3-editor-grid">
        <div className="space-y-4" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <Field label="المسار" hint={doc.id ? 'لا يتغير المسار بعد الإنشاء؛ استخدم التحويلات لنقل الصفحة.' : 'مثال: /lp/ramadan-offer'}>
            <Input dir="ltr" value={path} onChange={e => setPath(e.target.value.toLowerCase())} disabled={!!doc.id} />
          </Field>
          <Field label={locale === 'ar' ? 'العنوان (SEO)' : 'Title (SEO)'} hint={`${local.title.length}/60`}>
            <Input value={local.title} onChange={e => update({ title: e.target.value })} />
          </Field>
          <Field label={locale === 'ar' ? 'الوصف (SEO)' : 'Description (SEO)'} hint={`${local.description.length}/160`}>
            <Textarea value={local.description} onChange={e => update({ description: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.formEnabled} onChange={e => edit({ ...c, formEnabled: e.target.checked })} />
            إظهار نموذج الطلب
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.indexable} onChange={e => edit({ ...c, indexable: e.target.checked })} />
            السماح لمحركات البحث بالفهرسة
          </label>
          <Field label="الرابط الأساسي (canonical)">
            <Input dir="ltr" value={c.canonical} onChange={e => edit({ ...c, canonical: e.target.value })} placeholder={path} />
          </Field>
          <Field label="صورة المشاركة">
            <NativeSelect value={c.ogImage} onChange={e => edit({ ...c, ogImage: e.target.value })}>
              <option value="">بدون صورة</option>
              {approvedMedia.map(m => (
                <option key={m.id} value={m.url}>
                  {m.title}
                </option>
              ))}
              {Object.values(SHOTS).map(s => (
                <option key={s.id} value={s.src}>
                  {s.caption.ar}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="دليل النشر" hint="الصفحات التي تذكر قدرات المنتج لا تُنشر قبل اعتماد المالك للدليل.">
            <NativeSelect value={c.evidence} disabled={!owner} onChange={e => edit({ ...c, evidence: e.target.value as CmsContent['evidence'] })}>
              <option value="pending">قيد التحقق — مسودة</option>
              <option value="approved">معتمد من المالك</option>
            </NativeSelect>
          </Field>

          {Object.keys(local.sourceEdits).length > 0 && <h3 className="border-t border-border pt-5 font-bold">النصوص الأصلية</h3>}
          {Object.entries(local.sourceEdits).map(([id, text]) => (
            <Field key={id} label={id}>
              <Textarea value={text} onChange={e => update({ sourceEdits: { ...local.sourceEdits, [id]: e.target.value } })} />
            </Field>
          ))}

          <h3 className="border-t border-border pt-5 font-bold">أقسام الصفحة</h3>
          {local.blocks.map((b, i) => (
            <div key={b.id} className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center gap-1">
                <span className="flex-1 text-sm font-semibold">
                  {i + 1} · {BLOCK_TYPES[b.type]}
                </span>
                <Button size="icon" variant="ghost" aria-label="تحريك للأعلى" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={16} />
                </Button>
                <Button size="icon" variant="ghost" aria-label="تحريك للأسفل" disabled={i === local.blocks.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={16} />
                </Button>
                <Button size="icon" variant="ghost" aria-label="حذف القسم" onClick={() => update({ blocks: local.blocks.filter(x => x.id !== b.id) })}>
                  <Trash2 size={16} />
                </Button>
              </div>
              <Field label="العنوان">
                <Input value={b.title} onChange={e => updateBlock(b.id, { title: e.target.value })} />
              </Field>
              <Field label="المحتوى">
                <Textarea rows={4} value={b.body} onChange={e => updateBlock(b.id, { body: e.target.value })} />
              </Field>
              <Field label="الشاشة الفعلية">
                <NativeSelect value={b.shotId} onChange={e => updateBlock(b.id, { shotId: e.target.value })}>
                  <option value="">بدون شاشة</option>
                  {Object.values(SHOTS).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.caption.ar}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="صورة من المكتبة">
                <NativeSelect
                  value={b.mediaUrl}
                  onChange={e => {
                    const m = approvedMedia.find(x => x.url === e.target.value);
                    updateBlock(b.id, { mediaUrl: e.target.value, mediaAlt: m ? (locale === 'ar' ? m.alt_ar : m.alt_en) : '' });
                  }}
                >
                  <option value="">بدون صورة</option>
                  {approvedMedia.map(m => (
                    <option key={m.id} value={m.url}>
                      {m.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="رابط مرتبط">
                <Input dir="ltr" value={b.href} onChange={e => updateBlock(b.id, { href: e.target.value })} placeholder="/modules/sales" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={b.enabled} onChange={e => updateBlock(b.id, { enabled: e.target.checked })} />
                ظاهر
              </label>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BLOCK_TYPES) as CmsBlock['type'][]).map(type => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => update({ blocks: [...local.blocks, { id: crypto.randomUUID(), type, title: '', body: '', shotId: '', mediaUrl: '', mediaAlt: '', href: '', enabled: true }] })}
              >
                <Plus size={14} />
                {BLOCK_TYPES[type]}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <div className="v3-cms-preview" data-device={device} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <p className="text-xs text-muted-foreground">معاينة المسودة · {locale.toUpperCase()}</p>
            <h1 className="mt-4 text-3xl font-bold">{local.title}</h1>
            <p>{local.description}</p>
            {local.blocks
              .filter(b => b.enabled)
              .map(b => {
                const s = Object.values(SHOTS).find(x => x.id === b.shotId);
                return (
                  <article key={b.id} className="border-b border-border py-6">
                    <h2 className="text-xl font-bold">{b.title}</h2>
                    <p className="whitespace-pre-line">{b.body}</p>
                    {b.mediaUrl && <img src={b.mediaUrl} alt={b.mediaAlt} width={1200} height={800} className="mt-4 aspect-[3/2] w-full object-contain" />}
                    {s && <img src={s.src} alt={s.caption[locale]} width={s.width} height={s.height} className="mt-4 w-full" />}
                  </article>
                );
              })}
          </div>
        </div>
      </div>

      {history && (
        <section className="mt-8">
          <h3 className="mb-3 font-bold">الإصدارات السابقة ({history.length})</h3>
          <ol className="divide-y divide-border rounded-lg border border-border bg-card">
            {history.map(h => {
              const snapshot = h.snapshot as { draft?: unknown; published?: unknown };
              const restore = cmsContentSchema.safeParse(h.action === 'publish' ? (snapshot.published ?? snapshot.draft) : snapshot.draft);
              return (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <strong>{REVISION_LABELS[h.action] ?? h.action}</strong> · <span dir="ltr">{teamName(team, h.author_id)}</span> · {formatDate(h.created_at)}
                    {restore.success && <span className="ms-2 text-muted-foreground">«{restore.data.ar.title || restore.data.en.title}»</span>}
                  </span>
                  <span className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!restore.success}
                      onClick={() => {
                        if (!restore.success) return;
                        edit(restore.data);
                        notice('استُعيد الإصدار إلى المسودة. احفظ أو انشر لتطبيقه.');
                      }}
                    >
                      <RotateCcw size={15} />
                      استعادة للمسودة
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}
