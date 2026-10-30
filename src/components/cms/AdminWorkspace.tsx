import { useEffect, useState, type ComponentType } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeftRight,
  BookOpen,
  FileText,
  Globe,
  History,
  Image,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Palette,
  Shield,
  SquarePen,
} from 'lucide-react';
import { cmsWorkspace } from '@/lib/cms.functions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import Overview from './admin/Overview';
import DocumentList, { type ListKind } from './admin/DocumentList';
import PageEditor, { emptyContent } from './admin/PageEditor';
import SeoPanel from './admin/SeoPanel';
import MediaLibrary from './admin/MediaLibrary';
import Leads from './admin/Leads';
import Chats from './admin/Chats';
import Team from './admin/Team';
import Audit from './admin/Audit';
import Redirects from './admin/Redirects';
import FormsEditor from './admin/FormsEditor';
import BrandingEditor from './admin/BrandingEditor';
import SecurityPanel, { MfaChallenge } from './admin/Security';
import { ROLE_LABELS, WORKSPACE_KEY, type Doc } from './admin/shared';

type Role = 'owner' | 'editor' | 'sales';
type Tab = { id: string; label: string; icon: ComponentType<{ size?: number }>; roles: Role[]; group: string };

const TABS: Tab[] = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard, roles: ['owner', 'editor', 'sales'], group: '' },
  { id: 'pages', label: 'الصفحات', icon: FileText, roles: ['owner', 'editor'], group: 'المحتوى' },
  { id: 'stories', label: 'قصص الميزات', icon: BookOpen, roles: ['owner', 'editor'], group: 'المحتوى' },
  { id: 'resources', label: 'الموارد', icon: BookOpen, roles: ['owner', 'editor'], group: 'المحتوى' },
  { id: 'media', label: 'مكتبة الصور', icon: Image, roles: ['owner', 'editor'], group: 'المحتوى' },
  { id: 'navigation', label: 'روابط القائمة', icon: Menu, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'seo', label: 'محركات البحث', icon: Globe, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'redirects', label: 'التحويلات', icon: ArrowLeftRight, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'forms', label: 'نموذج الطلب', icon: SquarePen, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'branding', label: 'الهوية', icon: Palette, roles: ['owner'], group: 'الموقع' },
  { id: 'leads', label: 'طلبات العملاء', icon: Inbox, roles: ['owner', 'sales'], group: 'العملاء' },
  { id: 'chats', label: 'محادثات المساعد', icon: MessagesSquare, roles: ['owner', 'sales'], group: 'العملاء' },
  { id: 'team', label: 'الفريق والصلاحيات', icon: Shield, roles: ['owner'], group: 'الإدارة' },
  { id: 'security', label: 'أمان الحساب', icon: KeyRound, roles: ['owner', 'editor', 'sales'], group: 'الإدارة' },
  { id: 'audit', label: 'سجل النشاط', icon: History, roles: ['owner', 'editor', 'sales'], group: 'الإدارة' },
];

const LIST_TABS: Record<string, ListKind> = { pages: 'pages', stories: 'stories', resources: 'resources', navigation: 'navigation' };
const NEW_DOC: Record<ListKind, { path: string; kind: string }> = {
  pages: { path: '/lp/new-campaign', kind: 'page' },
  stories: { path: '/stories/new-story', kind: 'story' },
  resources: { path: '/resources/new-guide', kind: 'resource' },
  navigation: { path: '/cms-navigation', kind: 'navigation' },
};

function newDoc(kind: ListKind): Doc {
  const base = NEW_DOC[kind];
  return {
    id: '',
    path: base.path,
    kind: base.kind,
    draft: emptyContent(),
    published: null,
    scheduled: null,
    publish_at: null,
    unpublish_at: null,
    scheduled_by: null,
    state: 'draft',
    version: 0,
    updated_at: new Date().toISOString(),
    published_at: null,
    updated_by: null,
  } as Doc;
}

export default function AdminWorkspace() {
  const api = useServerFn(cmsWorkspace);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mfa, setMfa] = useState<'checking' | 'required' | 'ok'>('checking');
  const query = useQuery({ queryKey: WORKSPACE_KEY, queryFn: () => api(), enabled: mfa === 'ok' });
  const [tab, setTab] = useState('overview');
  const [active, setActive] = useState<Doc | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setMfa(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' ? 'required' : 'ok');
    });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: '/auth', replace: true });
  }

  if (mfa === 'required') return <MfaChallenge onVerified={() => setMfa('ok')} />;
  if (mfa === 'checking' || query.isPending)
    return (
      <p className="p-8 font-plex" dir="rtl">
        جارٍ تحميل لوحة Digit…
      </p>
    );
  if (query.error)
    return (
      <div className="p-8 font-plex" dir="rtl">
        <h1 className="text-2xl font-bold">لا يمكن فتح الإدارة</h1>
        <p className="mt-2 text-muted-foreground">{/Forbidden/.test(query.error.message) ? 'هذا الحساب لا يملك صلاحية على لوحة الإدارة.' : 'تعذّر تحميل البيانات. حدّث الصفحة.'}</p>
        <Button variant="outline" className="mt-4" onClick={signOut}>
          <LogOut size={16} />
          خروج
        </Button>
      </div>
    );

  const w = query.data;
  const role = w.role as Role;
  const owner = role === 'owner';
  const tabs = TABS.filter(t => t.roles.includes(role));
  const current = tabs.find(t => t.id === tab) ?? tabs[0];
  const groups = [...new Set(tabs.map(t => t.group))];
  const open = (id: string) => {
    setTab(id);
    setActive(null);
  };
  const listKind = LIST_TABS[current?.id ?? ''];

  return (
    <div className="v3-cms-layout font-plex text-foreground" dir="rtl">
      <aside className="v3-cms-nav">
        <h1 className="mb-1 text-2xl font-bold">
          DIGIT <span className="text-primary">CMS</span>
        </h1>
        <p className="mb-6 text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
        <nav aria-label="أقسام الإدارة" className="space-y-4">
          {groups.map(g => (
            <div key={g || 'main'} className="space-y-1">
              {g && <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground">{g}</p>}
              {tabs
                .filter(t => t.group === g)
                .map(t => (
                  <Button key={t.id} variant={current?.id === t.id ? 'default' : 'ghost'} className="w-full justify-start" aria-current={current?.id === t.id ? 'page' : undefined} onClick={() => open(t.id)}>
                    <t.icon size={17} />
                    {t.label}
                  </Button>
                ))}
            </div>
          ))}
        </nav>
        <Button variant="outline" className="mt-8 w-full" onClick={signOut}>
          <LogOut size={16} />
          خروج
        </Button>
      </aside>
      <main className="v3-cms-main">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">{current?.label}</h2>
          <a href="/" target="_blank" rel="noopener" className="text-sm text-primary underline-offset-4 hover:underline">
            فتح الموقع
          </a>
        </header>
        {notice && (
          <p role="status" className="mb-4 rounded-md border border-border bg-accent p-3 text-sm">
            {notice}
          </p>
        )}

        {current?.id === 'overview' && <Overview w={w} onOpen={open} />}
        {listKind &&
          (active ? (
            <PageEditor
              key={active.id || 'new'}
              doc={active}
              media={w.media}
              owner={owner}
              previews={w.previews}
              team={w.team}
              notice={setNotice}
              onBack={() => setActive(null)}
              onSaved={setActive}
            />
          ) : (
            <DocumentList docs={w.docs} kind={listKind} onEdit={setActive} onNew={() => setActive(newDoc(listKind))} />
          ))}
        {current?.id === 'seo' &&
          (active ? (
            <PageEditor key={active.id} doc={active} media={w.media} owner={owner} previews={w.previews} team={w.team} notice={setNotice} onBack={() => setActive(null)} onSaved={setActive} />
          ) : (
            <SeoPanel docs={w.docs} onEdit={setActive} />
          ))}
        {current?.id === 'media' && <MediaLibrary rows={w.media} docs={w.docs} config={w.config} owner={owner} notice={setNotice} />}
        {current?.id === 'redirects' && <Redirects rows={w.redirects} docs={w.docs} owner={owner} notice={setNotice} />}
        {current?.id === 'forms' && <FormsEditor rows={w.config} owner={owner} team={w.team} notice={setNotice} />}
        {current?.id === 'branding' && <BrandingEditor rows={w.config} media={w.media} owner={owner} team={w.team} notice={setNotice} />}
        {current?.id === 'leads' && <Leads rows={w.leads} team={w.team} notice={setNotice} />}
        {current?.id === 'chats' && <Chats />}
        {current?.id === 'team' && <Team rows={w.team} currentUser={w.userId} notice={setNotice} />}
        {current?.id === 'security' && <SecurityPanel owner={owner} aal={w.aal} config={w.config} notice={setNotice} />}
        {current?.id === 'audit' && <Audit rows={w.audit} team={w.team} docs={w.docs} />}
      </main>
    </div>
  );
}
