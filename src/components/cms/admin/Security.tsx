import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { KeyRound, LogOut, ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { saveSiteConfig } from '@/lib/cms-admin.functions';
import { parseConfig } from '@/lib/site-config-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorText, formatDate, StatusPill, useRefresh, type ConfigRow } from './shared';

type Factor = { id: string; friendly_name?: string; factor_type: string; status: string; created_at: string };

function CodeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <Input
      id={id}
      dir="ltr"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="max-w-[12rem] text-center font-mono text-lg tracking-[0.4em]"
      placeholder="000000"
    />
  );
}

/** Shown before the workspace when the account has an authenticator app but this session has not used it yet. */
export function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function verify() {
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp[0];
      if (!factor) throw new Error('no factor');
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (verifyError) throw verifyError;
      onVerified();
    } catch {
      setError('الرمز غير صحيح أو انتهت صلاحيته. أدخل الرمز الحالي من التطبيق.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 font-plex" dir="rtl">
      <form
        className="w-full max-w-md space-y-5 rounded-lg border border-border bg-card p-8"
        onSubmit={e => {
          e.preventDefault();
          if (code.length === 6) void verify();
        }}
      >
        <KeyRound className="text-primary" size={28} aria-hidden="true" />
        <h1 className="text-2xl font-bold">رمز تطبيق المصادقة</h1>
        <p className="text-sm text-muted-foreground">هذا الحساب محمي بتطبيق مصادقة. أدخل الرمز المكوّن من 6 أرقام لفتح لوحة الإدارة.</p>
        <label htmlFor="mfa-code" className="block text-sm font-medium">
          الرمز
        </label>
        <CodeInput id="mfa-code" value={code} onChange={setCode} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || code.length !== 6}>
            تحقق
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.replace('/auth');
            }}
          >
            <LogOut size={16} />
            خروج
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function SecurityPanel({ owner, aal, config, notice }: { owner: boolean; aal: string; config: ConfigRow[]; notice: (s: string) => void }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = useServerFn(saveSiteConfig);
  const refresh = useRefresh();
  const row = config.find(c => c.key === 'security');
  const security = parseConfig('security', row?.published ?? row?.draft);
  const verified = factors.filter(f => f.status === 'verified');

  async function loadFactors() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.all ?? []) as Factor[]);
    setLoading(false);
  }
  useEffect(() => {
    void loadFactors();
  }, []);

  async function startEnroll() {
    setBusy(true);
    setError('');
    try {
      for (const f of factors.filter(f => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `DIGIT admin ${new Date().toISOString().slice(0, 10)}` });
      if (enrollError || !data) throw enrollError ?? new Error('enroll');
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      setError('تعذّر بدء الإعداد. حدّث الصفحة ثم أعد المحاولة.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!enrolling) return;
    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code });
      if (verifyError) throw verifyError;
      setEnrolling(null);
      setCode('');
      await loadFactors();
      await refresh();
      notice('تم تفعيل تطبيق المصادقة لهذا الحساب.');
    } catch {
      setError('الرمز غير صحيح. أدخل الرمز الحالي من التطبيق.');
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(id: string) {
    setBusy(true);
    setError('');
    try {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (removeError) throw removeError;
      await supabase.auth.refreshSession();
      await loadFactors();
      await refresh();
      notice('أُزيل تطبيق المصادقة من هذا الحساب.');
    } catch {
      setError('الإزالة تتطلب جلسة متحققة بتطبيق المصادقة. سجّل الدخول مجددًا وأدخل الرمز ثم أعد المحاولة.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRequirement(next: boolean) {
    setBusy(true);
    setError('');
    try {
      await save({ data: { key: 'security', value: { requireMfaForPublish: next }, version: row?.version ?? 0, action: 'save' } });
      await refresh();
      notice(next ? 'أصبح النشر يتطلب التحقق بتطبيق المصادقة.' : 'أُلغي شرط تطبيق المصادقة للنشر.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            {verified.length ? <ShieldCheck className="text-primary" size={20} /> : <ShieldAlert size={20} />}
            تطبيق المصادقة لحسابك
          </h3>
          {loading ? null : verified.length ? <StatusPill tone="good">مفعّل</StatusPill> : <StatusPill tone="warn">غير مفعّل</StatusPill>}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          يضيف رمزًا متغيرًا من تطبيق مثل Google Authenticator أو Microsoft Authenticator عند كل دخول. الجلسة الحالية: {aal === 'aal2' ? 'متحققة بالتطبيق' : 'بكلمة المرور فقط'}.
        </p>
        {verified.map(f => (
          <div key={f.id} className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 text-sm">
            <span>
              {f.friendly_name || 'تطبيق مصادقة'} · أُضيف {formatDate(f.created_at, false)}
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => removeFactor(f.id)}>
              إزالة
            </Button>
          </div>
        ))}
        {!verified.length && !enrolling && (
          <Button onClick={startEnroll} disabled={busy || loading}>
            <KeyRound size={16} />
            إعداد تطبيق المصادقة
          </Button>
        )}
        {enrolling && (
          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            <img src={enrolling.qr} alt="رمز QR لإضافة الحساب إلى تطبيق المصادقة" width={200} height={200} className="rounded-md border border-border bg-white p-2" />
            <div className="space-y-3 text-sm">
              <p>1. امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح يدويًا:</p>
              <code dir="ltr" className="block break-all rounded bg-muted px-3 py-2 font-mono text-xs">
                {enrolling.secret}
              </code>
              <label htmlFor="mfa-enroll" className="block">
                2. أدخل الرمز الظاهر في التطبيق
              </label>
              <CodeInput id="mfa-enroll" value={code} onChange={setCode} />
              <div className="flex gap-2">
                <Button onClick={confirmEnroll} disabled={busy || code.length !== 6}>
                  تفعيل
                </Button>
                <Button variant="ghost" onClick={() => setEnrolling(null)}>
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      {owner && (
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold">اشتراط التطبيق للنشر</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                عند التفعيل، لا يمكن النشر أو الجدولة أو تغيير الهوية والإعدادات العامة إلا من جلسة تحققت بتطبيق المصادقة.
              </p>
              {!security.requireMfaForPublish && aal !== 'aal2' && (
                <p className="mt-2 text-xs text-muted-foreground">فعّل تطبيق المصادقة لحسابك وتحقق منه في هذه الجلسة أولًا.</p>
              )}
            </div>
            <Switch
              aria-label="اشتراط تطبيق المصادقة للنشر"
              checked={security.requireMfaForPublish}
              disabled={busy || aal !== 'aal2'}
              onCheckedChange={toggleRequirement}
            />
          </div>
        </section>
      )}
    </div>
  );
}
