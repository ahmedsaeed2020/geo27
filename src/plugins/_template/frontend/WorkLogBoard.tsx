/**
 * Frontend CANDIDATE for the digit_app_template Frappe export (strategy: desk_page, route /app/template-work-board).
 * Never imported by the virtual Core: the exporter copies this file as raw text into <app>/frontend/ (src/plugins/appPackage.ts).
 * On a real site it reads Template Work Log through the standard Frappe REST API with the user's session; build and
 * staging verification are separate, authorized steps.
 */
import { useEffect, useState } from "react";

type WorkLog = { name: string; title: string; status: string; planned_hours?: number };

export function WorkLogBoard() {
  const [rows, setRows] = useState<WorkLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ fields: JSON.stringify(["name", "title", "status", "planned_hours"]), limit_page_length: "100" });
    fetch(`/api/resource/Template Work Log?${q.toString()}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { data: WorkLog[] }) => setRows(j.data))
      .catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <p role="alert">{error}</p>;
  const by = (s: string) => rows.filter((r) => r.status === s);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {["Open", "Done"].map((s) => (
        <section key={s}>
          <h3>{s} ({by(s).length})</h3>
          {by(s).map((r) => <a key={r.name} href={`/app/template-work-log/${encodeURIComponent(r.name)}`} style={{ display: "block" }}>{r.title}</a>)}
        </section>
      ))}
    </div>
  );
}

export default WorkLogBoard;
