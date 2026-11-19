/**
 * HR organisation chart (owner round H1-06) on the Enterprise OrgChart: the company's active employees in scope under
 * their managers, department colour, Saudi / non-Saudi tag, each name opening Employee 360. On Employee 360 the chart
 * opens on the employee (manager chain, the employee and their direct reports); on 01.1 it opens two levels.
 */
import { Link } from "@tanstack/react-router";
import { useStoreVersion } from "@/lib/adapter";
import { OrgChart, type OrgPerson } from "@/components/enterprise/kit/OrgChart";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { arLabel } from "@/components/digithr/workspaces/shared";
import { orgPeople } from "@/plugins/digit_hr/product/people";

type R = Record<string, unknown> & { name: string };
export function EmployeeOrg({ emp, company }: { emp?: R | undefined; company?: string | undefined }) {
  const { tx } = useTx(); useStoreVersion(); const ar = tx("ar", "en") === "ar";
  const co = company ?? (emp ? String(emp["company"] ?? "") : undefined);
  const people: OrgPerson[] = orgPeople(co || undefined).map((p) => ({ id: p.id, parent: p.parent, name: tx(arLabel(p.name), p.name), title: p.title ? tx(arLabel(p.title), p.title) : undefined, dept: p.dept ? tx(arLabel(p.dept), p.dept) : undefined, hue: p.hue,
    ...(p.nationality ? { tag: { label: p.nationality === "Saudi" ? tx("سعودي", "Saudi") : tx("غير سعودي", "Non-Saudi"), tone: p.nationality === "Saudi" ? "saudi" as const : "other" as const } } : {}),
    link: (n) => <Link to="/digit-hr/employees/$name" params={{ name: p.id }} search={{ tab: "profile" }} className="hover:underline">{n}</Link> }));
  return <OrgChart people={people} ar={ar} focus={emp?.name} depth={emp ? 1 : 0} fileName={`org-chart-${emp?.name ?? "company"}`} attrs={{ "data-hr-org": emp?.name ?? co ?? "all" }} />;
}
