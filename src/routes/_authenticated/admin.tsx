import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type RequestRow = {
  id: string;
  created_at: string;
  kind: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  status: string;
  page_path: string | null;
};
type ThreadRow = { id: string; created_at: string; updated_at: string; locale: string; title: string | null };
type MessageRow = { id: string; role: string; content: string; created_at: string };
type SettingRow = { key: string; value: unknown; updated_at: string };

const TABS = [
  { id: "requests", label: "طلبات النماذج" },
  { id: "chats", label: "محادثات المساعد" },
  { id: "settings", label: "إعدادات الموقع" },
] as const;

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("requests");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
      setAuthorized(Boolean(isAdmin));
    });
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">جارٍ التحقق…</div>;
  }
  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center" dir="rtl">
        <h1 className="text-xl font-bold">هذا الحساب ليس مشرفًا</h1>
        <p className="text-sm text-muted-foreground">سجّلت الدخول بنجاح، لكن حسابك يحتاج صلاحية مشرف من مالك الموقع.</p>
        <Button variant="outline" onClick={handleSignOut}>تسجيل الخروج</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-lg font-bold">لوحة تحكم موقع Digit</h1>
        <Button variant="outline" size="sm" onClick={handleSignOut}>تسجيل الخروج</Button>
      </header>
      <nav className="flex gap-2 border-b border-border px-6 py-2">
        {TABS.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "default" : "ghost"} size="sm" onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </nav>
      <main className="p-6">
        {tab === "requests" && <RequestsTab />}
        {tab === "chats" && <ChatsTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}

function RequestsTab() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const load = useCallback(() => {
    supabase
      .from("contact_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setRows((data as RequestRow[]) ?? []));
  }, []);
  useEffect(load, [load]);

  async function setStatus(id: string, status: string) {
    await supabase.from("contact_requests").update({ status }).eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات بعد.</p>}
      {rows.map((row) => (
        <div key={row.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{row.name} <span className="text-xs text-muted-foreground">({row.kind})</span></p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("ar-SA")}</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                value={row.status}
                onChange={(e) => setStatus(row.id, e.target.value)}
              >
                <option value="new">جديد</option>
                <option value="contacted">تم التواصل</option>
                <option value="closed">مغلق</option>
              </select>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">{[row.email, row.phone, row.company].filter(Boolean).join(" · ")}</p>
          {row.message && <p className="mt-2 text-sm">{row.message}</p>}
          {row.page_path && <p className="mt-1 text-xs text-muted-foreground" dir="ltr">من: {row.page_path}</p>}
        </div>
      ))}
    </div>
  );
}

function ChatsTab() {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("chat_threads")
      .select("id, created_at, updated_at, locale, title")
      .order("updated_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setThreads((data as ThreadRow[]) ?? []));
  }, []);

  useEffect(() => {
    if (!active) return;
    supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", active)
      .order("created_at")
      .then(({ data }) => setMessages((data as MessageRow[]) ?? []));
  }, [active]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        {threads.length === 0 && <p className="text-sm text-muted-foreground">لا توجد محادثات بعد.</p>}
        {threads.map((thread) => (
          <button
            key={thread.id}
            onClick={() => setActive(thread.id)}
            className={`rounded-lg border px-3 py-2 text-start text-sm ${active === thread.id ? "border-primary bg-accent" : "border-border"}`}
          >
            {new Date(thread.updated_at).toLocaleString("ar-SA")} · {thread.locale}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
        {!active && <p className="text-sm text-muted-foreground">اختر محادثة لعرضها.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground self-start" : "bg-muted self-end"}`}>
            {m.content}
          </div>
        ))}
      </div>
    </div>
  );
}

const SETTING_KEYS = [
  { key: "pricing", label: "الأسعار والباقات", hint: "JSON لأسعار الباقات المعروضة" },
  { key: "seo", label: "إعدادات SEO", hint: "عناوين وأوصاف مخصصة لكل صفحة" },
  { key: "content", label: "محتوى الصفحات", hint: "نصوص قابلة للتعديل بالعربي والإنجليزي" },
] as const;

function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("key, value")
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const row of (data as SettingRow[]) ?? []) map[row.key] = JSON.stringify(row.value, null, 2);
        setSettings(map);
      });
  }, []);

  async function save(key: string) {
    let value: unknown;
    try {
      value = JSON.parse(settings[key] ?? "{}");
    } catch {
      alert("صيغة JSON غير صحيحة");
      return;
    }
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key, value: value as Record<string, never>, updated_at: new Date().toISOString() });
    if (!error) {
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        هذه الإعدادات تُحفظ في قاعدة البيانات وتُستخدم لتخصيص الموقع. عدّل القيم بصيغة JSON ثم احفظ.
      </p>
      {SETTING_KEYS.map(({ key, label, hint }) => (
        <div key={key} className="rounded-xl border border-border bg-card p-4">
          <p className="font-semibold">{label}</p>
          <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
          <Textarea
            dir="ltr"
            className="min-h-32 font-mono text-xs"
            value={settings[key] ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
            placeholder="{}"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => save(key)}>حفظ</Button>
            {saved === key && <span className="text-xs text-green-600">تم الحفظ</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
