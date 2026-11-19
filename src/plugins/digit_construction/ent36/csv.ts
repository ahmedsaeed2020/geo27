/** Minimal RFC 4180 CSV read / write for the owner work list (quoted fields, doubled quotes, embedded newlines, UTF-8 BOM). */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, ""); const out: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; } else if (ch === "\n") { row.push(f.replace(/\r$/, "")); out.push(row); row = []; f = ""; } else f += ch;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out.filter((r) => r.some((x) => x !== ""));
}
export function toCsv(rows: string[][]): string {
  return "\uFEFF" + rows.map((r) => r.map((x) => (/[",\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(",")).join("\r\n") + "\r\n";
}
export function records(text: string): Record<string, string>[] {
  const [h, ...rs] = parseCsv(text); return rs.map((r) => Object.fromEntries(h!.map((k, i) => [k, r[i] ?? ""])));
}
