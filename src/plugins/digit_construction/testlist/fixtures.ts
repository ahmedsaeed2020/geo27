/**
 * Records the demo does not ship but the test list reads (saved views, dashboard layouts, issued print copies, cost
 * allocations, exception reviews, budget transfers) are created once through the same services the screens call,
 * as Administrator — exactly like the server-parity fixtures — so their fields can be saved and read back.
 */
export async function serviceFixtures(): Promise<Record<string, boolean>> {
  const { adapter } = await import("@/lib/adapter");
  const LA = await import("../domain/layoutActions");
  const LY = await import("../domain/layouts");
  const { dashboardByKey } = await import("../analytics/catalog");
  const PA = await import("../domain/printActions");
  const PR = await import("../domain/print");
  const V = { ...(await import("../domain/costVerify")), ...(await import("../domain/costActions")) };
  const D = await import("../domain/data");
  const made: Record<string, boolean> = {};
  const dd = dashboardByKey("executive")!;
  const sys = LY.resolveLayout(dd);
  if (!adapter.list("Digit Dashboard Layout").length) made["layout"] = LA.saveLayout(dd.key, "User", "Administrator", sys.metrics.slice(0, 3).map((id, i) => ({ type: "Metric" as const, id, hidden: i === 2 }))).ok;
  if (!adapter.list("Digit Saved View").length) made["view"] = LA.saveView("Project Cost Sources", "Test list view", { project: "DCC-PRJ-A", rf: JSON.stringify([["bucket", "=", "actual"]]) }).ok;
  if (!adapter.list("Digit Print Artifact").length) {
    const cert = adapter.list("Digit Client Certificate").find((c) => ["Confirmed", "Invoiced"].includes(String(c["workflow_state"])));
    if (cert) made["print"] = (await PA.issuePrint({ doctype: "Digit Client Certificate", name: cert.name, format: PR.formatsFor("Digit Client Certificate")[0]!.name, as_of: "2026-10-18", copy_reason: "Test list" })).ok;
  }
  for (const pj of adapter.list("Project").map((x) => x.name)) {
    const ver = V.costVerification(pj);
    const ex = ver.exceptions.find((e) => e.allocatable);
    const line = ex && D.costPosition(pj).lines[0];
    if (ex && line && !adapter.list("Digit Cost Allocation").length) made["allocation"] = V.allocateSource(pj, { doctype: ex.source_doctype, name: ex.source_name, row: ex.row }, String(line.line_key), "Test list allocation").ok;
    const rv = ver.exceptions.find((e) => e.status === "Open" && !e.allocatable);
    if (rv && !adapter.list("Digit Cost Exception Review").length) made["review"] = V.reviewException(pj, rv, "Accepted as Is", "Test list review").ok;
  }
  if (!adapter.list("Digit Budget Transfer").length) {
    for (const b of adapter.list("Digit Project Cost Budget").filter((x) => x["workflow_state"] === "Approved")) {
      const pos = D.costPosition(String(b["project"])).lines;
      const from = pos.find((l) => l.revised - l.committed - l.actual > 100); const to = pos.find((l) => l !== from);
      if (!from || !to) continue;
      try { adapter.insertDoc("Digit Budget Transfer", { budget: b.name, project: b["project"], company: b["company"], from_line: from.line_key, to_line: to.line_key, amount: 100, reason: "Test list transfer", workflow_state: "Draft" }); made["transfer"] = true; break; } catch (e) { made["transfer"] = false; void e; }
    }
  }
  return made;
}
