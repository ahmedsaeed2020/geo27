/**
 * Public addresses of DIGIT FSM + ITM: /fsm/… and /fsm/doc/<doctype>/<name>.
 * The implementation stays under /plugins/digit_fsm internally; the shared router rewrite exposes only the clean path.
 */
export const FSM_APP = "digit_fsm";
export const FSM_INTERNAL = `/plugins/${FSM_APP}`;
export const FSM_PUBLIC = "/fsm";
const inside = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

/** Visible /fsm address → internal router path. */
export function fsmInput(url: URL): URL | undefined {
  if (!inside(url.pathname, FSM_PUBLIC)) return undefined;
  const rest = url.pathname.slice(FSM_PUBLIC.length).replace(/^\/+|\/+$/g, "");
  const segs = rest.split("/").filter(Boolean);
  const out = new URL(url.href);
  if (segs[0] === "doc" && segs.length >= 2 && segs.length <= 3) {
    out.pathname = `/app/${url.searchParams.get("src") || "erpnext"}/${segs.slice(1).join("/")}`;
    out.searchParams.delete("src");
    out.searchParams.set("app", FSM_APP);
    return out;
  }
  out.pathname = rest ? `${FSM_INTERNAL}/${rest}` : FSM_INTERNAL;
  return out;
}

/** Internal app path → its visible /fsm address. */
export function fsmOutput(url: URL): URL | undefined {
  const p = url.pathname;
  if (inside(p, FSM_INTERNAL)) {
    const rest = p.slice(FSM_INTERNAL.length).replace(/^\/+/, "");
    const out = new URL(url.href);
    if (out.searchParams.get("app") === FSM_APP) out.searchParams.delete("app");
    out.pathname = rest ? `${FSM_PUBLIC}/${rest}` : FSM_PUBLIC;
    return out;
  }
  if (url.searchParams.get("app") !== FSM_APP) return undefined;
  const doc = /^\/app\/([^/]+)\/([^/]+)(\/[^/]+)?\/?$/.exec(p);
  if (doc) {
    const out = new URL(url.href);
    out.pathname = `${FSM_PUBLIC}/doc/${doc[2]}${doc[3] ?? ""}`;
    out.searchParams.delete("app");
    if (doc[1] !== "erpnext") out.searchParams.set("src", doc[1]!);
    return out;
  }
  const report = /^\/report\/([^/]+)\/?$/.exec(p);
  if (report) {
    const out = new URL(url.href);
    out.pathname = `${FSM_PUBLIC}/report/${report[1]}`;
    out.searchParams.delete("app");
    return out;
  }
  return undefined;
}
