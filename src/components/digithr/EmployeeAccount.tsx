/**
 * DEC-015 (owner ruling 18/11/2026): «إنشاء حساب» on the employee page. The account is created only when HR presses
 * the button (never automatically); the dialog shows whether this employee needs an account and asks for the e-mail
 * when the record has none. Writes go through r10/features/native.ts createEmployeeUser (role- and scope-checked).
 */
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import type { Doc } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { EntDialog } from "@/components/enterprise/Surfaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canCreateUser, createEmployeeUser, employeeEmail } from "@/plugins/digit_hr/r10/features/native";
import { accountNeed, NEED_REASON } from "@/plugins/digit_hr/userAccounts";
import { useTx } from "./HrNav";

/** Plain status of the employee's account for the profile facts: linked user, «لا يحتاج حسابًا», or missing. */
export function accountState(emp: Doc): { linked: string; needs: boolean; reason: [string, string] } {
  const n = accountNeed(emp);
  return { linked: String(emp["user_id"] ?? ""), needs: n.needs, reason: NEED_REASON[n.reason] };
}

export function EmployeeAccountButton({ emp, variant = "band" }: { emp: Doc; variant?: "band" | "inline" }) {
  const { tx, lang } = useTx(); const ar = lang === "ar"; const user = useSessionUser();
  const [open, setOpen] = useState(false); const [email, setEmail] = useState("");
  if (String(emp["user_id"] ?? "") || !canCreateUser(user)) return null;
  const st = accountState(emp); const known = employeeEmail(emp);
  const submit = () => {
    const r = createEmployeeUser(emp.name, user, known ? "" : email);
    if (r.ok) { toast.success(ar ? r.message[1] : r.message[0]); setOpen(false); }
    else toast.error([ar ? r.message[1] : r.message[0], ...(r.errors ?? []).slice(0, 3)].join("\n"));
  };
  return <>
    <button type="button" onClick={() => { setEmail(""); setOpen(true); }} data-create-account={emp.name}
      className={variant === "band" ? "ek-context-btn inline-flex items-center gap-2" : "r1-add-link inline-flex items-center gap-1"}>
      {tx("إنشاء حساب", "Create account")}<UserPlus size={variant === "band" ? 16 : 13} aria-hidden />
    </button>
    <EntDialog open={open} onOpenChange={setOpen} id="employee-account" size="sm" icon={<UserPlus className="h-4 w-4" />}
      kicker={tx("حساب الدخول", "Sign-in account")} title={tx("إنشاء حساب للموظف", "Create an account for this employee")}
      footer={<><Button variant="outline" onClick={() => setOpen(false)}>{tx("إلغاء", "Cancel")}</Button>
        <Button onClick={submit} disabled={!known && !email.trim()} data-confirm-account>{tx("إنشاء الحساب وربطه", "Create and link")}</Button></>}>
      <div className="grid gap-3 text-sm">
        <p data-account-need={st.needs ? "yes" : "no"}>
          <span className="font-medium">{tx("يحتاج حساب مستخدم: ", "Needs user account: ")}</span>
          {st.needs ? tx("نعم", "Yes") : tx("لا", "No")} <span className="text-muted-foreground">— {ar ? st.reason[1] : st.reason[0]}</span>
        </p>
        {!st.needs && <p className="text-xs text-muted-foreground">{tx("عمال المواقع لا يحتاجون حسابًا. أنشئه فقط إذا كان هذا الموظف سيستخدم الخدمة الذاتية أو يعتمد طلبات.", "Site workers do not need an account. Create one only if this employee will use self-service or approve requests.")}</p>}
        {known
          ? <p>{tx("البريد: ", "E-mail: ")}<bdi data-no-i18n>{known}</bdi></p>
          : <label className="grid gap-1"><span>{tx("البريد الإلكتروني للعمل", "Work e-mail")}</span>
              <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.sa" data-account-email
                onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) submit(); }} /></label>}
        <p className="text-xs text-muted-foreground">{tx("يحصل الحساب على دور «موظف» للخدمة الذاتية فقط، ولا يُرسل بريد ترحيب.", "The account gets the Employee role for self-service only; no welcome e-mail is sent.")}</p>
      </div>
    </EntDialog>
  </>;
}
