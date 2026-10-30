import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { UserPlus } from 'lucide-react';
import { removeCmsRole, setCmsRole } from '@/lib/cms-admin.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EmptyState, errorText, Field, formatDate, NativeSelect, ROLE_LABELS, useRefresh, type TeamMember } from './shared';

type EditableRole = 'owner' | 'editor' | 'sales';
const ROLE_HELP: Record<EditableRole, string> = {
  owner: 'كل الصلاحيات: النشر والهوية والفريق والطلبات',
  editor: 'يحرر المحتوى ويرسل للمراجعة؛ لا يرى الطلبات ولا ينشر',
  sales: 'يرى الطلبات والمحادثات ويحدّث حالتها؛ لا يحرر المحتوى',
};

export default function Team({ rows, currentUser, notice }: { rows: TeamMember[]; currentUser: string; notice: (s: string) => void }) {
  const grant = useServerFn(setCmsRole);
  const remove = useServerFn(removeCmsRole);
  const refresh = useRefresh();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EditableRole>('editor');
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await task();
      await refresh();
      notice(done);
    } catch (e) {
      notice(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      <form
        className="rounded-lg border border-border bg-card p-5"
        onSubmit={e => {
          e.preventDefault();
          void run(async () => {
            await grant({ data: { email, role } });
            setEmail('');
          }, 'تم منح الصلاحية.');
        }}
      >
        <h3 className="mb-1 font-bold">إضافة عضو للفريق</h3>
        <p className="mb-4 text-sm text-muted-foreground">أنشئ الحساب أولًا من إدارة المستخدمين في Lovable Cloud، ثم أدخل بريده هنا.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <Field label="بريد الحساب">
            <Input type="email" dir="ltr" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
          </Field>
          <Field label="الصلاحية">
            <NativeSelect value={role} onChange={e => setRole(e.target.value as EditableRole)}>
              <option value="editor">{ROLE_LABELS.editor}</option>
              <option value="sales">{ROLE_LABELS.sales}</option>
              <option value="owner">{ROLE_LABELS.owner}</option>
            </NativeSelect>
          </Field>
          <Button type="submit" disabled={busy || !email}>
            <UserPlus size={16} />
            منح
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
      </form>

      <div className="overflow-x-auto">
        <table className="v3-cms-table">
          <thead>
            <tr>
              <th>الحساب</th>
              <th>الصلاحية</th>
              <th>آخر دخول</th>
              <th>
                <span className="sr-only">إجراءات</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.user_id}>
                <td dir="ltr" className="text-start">
                  {m.email || m.user_id}
                  {m.user_id === currentUser && <span className="ms-2 text-xs text-muted-foreground">(أنت)</span>}
                </td>
                <td>
                  {m.role === 'admin' ? (
                    ROLE_LABELS.admin
                  ) : (
                    <NativeSelect
                      aria-label={`صلاحية ${m.email}`}
                      className="max-w-[12rem]"
                      value={m.role}
                      disabled={busy}
                      onChange={e => run(() => grant({ data: { userId: m.user_id, role: e.target.value as EditableRole } }), 'تم تحديث الصلاحية.')}
                    >
                      <option value="owner">{ROLE_LABELS.owner}</option>
                      <option value="editor">{ROLE_LABELS.editor}</option>
                      <option value="sales">{ROLE_LABELS.sales}</option>
                    </NativeSelect>
                  )}
                </td>
                <td>{formatDate(m.last_sign_in_at)}</td>
                <td>
                  {m.role !== 'admin' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={busy}>
                          إزالة الصلاحية
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>إزالة صلاحية {m.email}؟</AlertDialogTitle>
                          <AlertDialogDescription>سيفقد الحساب الوصول للوحة فورًا، وتُلغى إسنادات الطلبات له. يبقى الحساب نفسه موجودًا.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={() => run(() => remove({ data: { userId: m.user_id } }), 'أُزيلت الصلاحية.')}>إزالة</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <EmptyState>لا يوجد أعضاء بعد.</EmptyState>}
    </div>
  );
}
