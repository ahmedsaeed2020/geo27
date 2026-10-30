import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bot, MessageSquare, User } from 'lucide-react';
import { getChatTranscript, listChatThreads } from '@/lib/cms-admin.functions';
import { Input } from '@/components/ui/input';
import { EmptyState, formatDate } from './shared';

export default function Chats() {
  const list = useServerFn(listChatThreads);
  const transcript = useServerFn(getChatTranscript);
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const threads = useQuery({ queryKey: ['cms-chats'], queryFn: () => list() });
  const messages = useQuery({ queryKey: ['cms-chat', active], queryFn: () => transcript({ data: { threadId: active ?? '' } }), enabled: !!active });

  if (threads.isPending) return <p className="text-muted-foreground">جارٍ تحميل المحادثات…</p>;
  if (threads.error) return <p role="alert" className="text-destructive">تعذّر تحميل المحادثات.</p>;
  const rows = threads.data.filter(t => !q || (t.title ?? '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="cms-split">
      <div className="min-w-0">
        <Input aria-label="بحث المحادثات" placeholder="ابحث في عناوين المحادثات" value={q} onChange={e => setQ(e.target.value)} className="mb-3" />
        <p className="mb-3 text-xs text-muted-foreground">{threads.data.length} محادثة · للاطلاع فقط؛ لا تُعدّل محادثات الزوار.</p>
        <ul className="space-y-2">
          {rows.map(t => (
            <li key={t.id}>
              <button type="button" className="cms-list-item" data-active={active === t.id} onClick={() => setActive(t.id)}>
                <span className="flex items-center gap-2 font-semibold">
                  <MessageSquare size={15} aria-hidden="true" />
                  <span className="truncate">{t.title || 'محادثة بدون عنوان'}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.messages} رسالة · {t.locale === 'en' ? 'English' : 'العربية'} · {formatDate(t.updated_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!rows.length && <EmptyState>لا توجد محادثات.</EmptyState>}
      </div>
      <section className="min-w-0 rounded-lg border border-border bg-card p-5" aria-live="polite">
        {!active && <p className="text-muted-foreground">اختر محادثة لعرض نصها.</p>}
        {active && messages.isPending && <p className="text-muted-foreground">جارٍ التحميل…</p>}
        {active && messages.error && <p className="text-destructive">تعذّر تحميل المحادثة.</p>}
        {active && messages.data && (
          <ol className="space-y-4">
            {messages.data.map(m => (
              <li key={m.id} className="cms-chat-line" data-role={m.role}>
                <span className="cms-chat-avatar" aria-hidden="true">
                  {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {m.role === 'user' ? 'الزائر' : 'المساعد'} · {formatDate(m.created_at)}
                  </p>
                  <p className="whitespace-pre-line break-words text-sm" dir="auto">
                    {m.content}
                  </p>
                </div>
              </li>
            ))}
            {!messages.data.length && <li className="text-muted-foreground">لا توجد رسائل في هذه المحادثة.</li>}
          </ol>
        )}
      </section>
    </div>
  );
}
