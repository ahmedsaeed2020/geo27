import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useRouter } from '@tanstack/react-router';
import { History, RotateCcw, Save, Send, Undo2 } from 'lucide-react';
import { getConfigHistory, saveSiteConfig } from '@/lib/cms-admin.functions';
import { parseConfig, type SiteConfigKey } from '@/lib/site-config-schema';
import { Button } from '@/components/ui/button';
import { errorText, formatDate, REVISION_LABELS, StatusPill, teamName, useRefresh, type ConfigRow, type TeamMember } from './shared';

type Value<K extends SiteConfigKey> = ReturnType<typeof parseConfig<K>>;

/** Draft/publish state for one site-settings key, shared by the forms, branding and section editors. */
export function useConfigEditor<K extends SiteConfigKey>(key: K, rows: ConfigRow[], notice: (s: string) => void) {
  const row = rows.find(r => r.key === key);
  const [value, setValueState] = useState<Value<K>>(() => parseConfig(key, row?.draft ?? row?.published));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = useServerFn(saveSiteConfig);
  const refresh = useRefresh();
  const router = useRouter();
  const published = row?.published ? parseConfig(key, row.published) : null;
  const unpublishedChanges = !!row && JSON.stringify(row.draft) !== JSON.stringify(row.published);

  const setValue = (next: Value<K>) => {
    setValueState(next);
    setDirty(true);
  };

  async function run(action: 'save' | 'publish' | 'unpublish') {
    setBusy(true);
    setError('');
    try {
      await save({ data: { key, value, version: row?.version ?? 0, action } });
      setDirty(false);
      await refresh();
      await router.invalidate();
      notice(action === 'publish' ? 'نُشرت الإعدادات على الموقع.' : action === 'unpublish' ? 'أُلغي النشر وعادت الإعدادات الأصلية.' : 'تم حفظ المسودة.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return { row, value, setValue, dirty, busy, error, run, published, unpublishedChanges, replace: setValue };
}

export function ConfigToolbar({
  editor,
  owner,
  publishLabel = 'نشر على الموقع',
}: {
  editor: ReturnType<typeof useConfigEditor>;
  owner: boolean;
  publishLabel?: string;
}) {
  const { row, dirty, busy, run, unpublishedChanges, error } = editor;
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run('save')} disabled={busy}>
          <Save size={16} />
          حفظ المسودة
        </Button>
        {owner && (
          <Button variant="outline" onClick={() => run('publish')} disabled={busy}>
            <Send size={16} />
            {publishLabel}
          </Button>
        )}
        {owner && row?.published && (
          <Button variant="ghost" onClick={() => run('unpublish')} disabled={busy}>
            <Undo2 size={16} />
            العودة للأصل
          </Button>
        )}
        {row?.published ? <StatusPill tone="good">منشور {formatDate(row.published_at)}</StatusPill> : <StatusPill>غير منشور — يظهر الأصل</StatusPill>}
        {(dirty || unpublishedChanges) && <StatusPill tone="warn">{dirty ? 'تعديلات غير محفوظة' : 'مسودة لم تُنشر'}</StatusPill>}
      </div>
      {!owner && <p className="text-xs text-muted-foreground">يحفظ المحرر المسودة؛ النشر يتم بواسطة المالك.</p>}
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function ConfigHistory<K extends SiteConfigKey>({ configKey, team, onRestore }: { configKey: K; team: TeamMember[]; onRestore: (v: Value<K>) => void }) {
  const load = useServerFn(getConfigHistory);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getConfigHistory>> | null>(null);
  return (
    <section className="mt-10">
      <Button variant="outline" size="sm" onClick={async () => setRows(await load({ data: { key: configKey } }))}>
        <History size={15} />
        الإصدارات السابقة
      </Button>
      {rows && (
        <ol className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map(r => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <strong>{REVISION_LABELS[r.action] ?? r.action}</strong> · <span dir="ltr">{teamName(team, r.author_id)}</span> · {formatDate(r.created_at)}
              </span>
              <Button variant="outline" size="sm" onClick={() => onRestore(r.value as Value<K>)}>
                <RotateCcw size={15} />
                استعادة للمسودة
              </Button>
            </li>
          ))}
          {!rows.length && <li className="px-4 py-3 text-sm text-muted-foreground">لا توجد إصدارات بعد.</li>}
        </ol>
      )}
    </section>
  );
}
