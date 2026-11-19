/**
 * DIGIT Enterprise export factory — the app-agnostic engine. Given an app's release descriptor, the files of its
 * checked-in Frappe package and its owned virtual sources, it validates, packs deterministic ZIPs, and generates the
 * release manifest, installation guide and checksums. All business knowledge stays in each app's descriptor/package;
 * this module only reads, checks and packs. It is build-time only (Node/Bun CLI scripts/export-app.ts and tests) and is
 * never imported by browser code.
 */
import { createHash } from "node:crypto";
import { strToU8, zipSync, type Zippable } from "fflate";
import {
  RELEASE_STAGES, type Artifact, type CheckResult, type CheckStatus, type FactoryContext, type FactoryRefusal,
  type ReleaseDescriptor, type ReleaseManifest, type ReleaseStage, type SourceFile, type StageResult,
} from "./types";

export const FACTORY_VERSION = "digit-export-factory/1.0.0";
/** Fixed ZIP entry time (local fields, so the bytes do not depend on the build machine's time zone). */
export const ZIP_EPOCH = "1980-01-01T12:00:00";

/** The four DIGIT application targets of the Enterprise programme and what each needs before it can be exported. */
export const KNOWN_APPS: Record<string, { title: string; needed: string[] }> = {
  digit_pro: { title: "DIGIT Pro", needed: ["src/plugins/digit_pro/release.json", "frappe_apps/digit_pro (installable Frappe package)"] },
  digit_hr: { title: "DIGIT HR", needed: ["src/plugins/digit_hr/release.json", "frappe_apps/digit_hr (installable Frappe package)"] },
  digit_crm: {
    title: "DIGIT CRM",
    needed: [
      "DIGIT CRM application source (owning plugin, UI, routes) imported into this Final Core",
      "Approved DIGIT CRM BRD / screen contracts and Native Fit-Gap decisions",
      "Installable Frappe package frappe_apps/digit_crm (pyproject.toml, digit_crm/hooks.py, modules.txt, DocTypes)",
      "src/plugins/digit_crm/release.json release descriptor",
    ],
  },
  digit_construction: {
    title: "DIGIT Construction",
    needed: [
      "DIGIT Construction application source (owning plugin, UI, routes) imported into this Final Core",
      "Approved DIGIT Construction BRD / screen contracts and Native Fit-Gap decisions",
      "Installable Frappe package frappe_apps/digit_construction (pyproject.toml, digit_construction/hooks.py, modules.txt, DocTypes)",
      "src/plugins/digit_construction/release.json release descriptor",
    ],
  },
};

const text = (d: Uint8Array) => new TextDecoder().decode(d);
export const sha256 = (d: Uint8Array | string) => createHash("sha256").update(typeof d === "string" ? strToU8(d) : d).digest("hex");
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
export const normaliseApp = (a: string) => a.trim().replace(/^.*\//, "");

/** Files never shipped in a release (build caches, editor files, nested repositories, installed dependencies). */
export function shouldPack(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => p === "__pycache__" || p === "node_modules" || p === ".git" || p === ".DS_Store" || p === ".pytest_cache")) return false;
  return !/\.(pyc|pyo|swp)$/.test(path);
}

// ---------------------------------------------------------------- descriptor

/** Structural errors of a release descriptor ("" list = valid). */
export function descriptorErrors(d: unknown, app: string): string[] {
  const e: string[] = [];
  if (!d || typeof d !== "object") return ["descriptor is not a JSON object"];
  const r = d as Partial<ReleaseDescriptor>;
  if (r.schema !== 1) e.push("schema must be 1");
  if (r.app !== app) e.push(`app must be "${app}" (found ${JSON.stringify(r.app)})`);
  for (const k of ["title", "title_ar", "frappe_package"] as const) if (typeof r[k] !== "string" || !r[k]) e.push(`${k} is required`);
  if (!r.frontend || !["desk-assets", "hosted-spa", "none"].includes(r.frontend.kind)) e.push("frontend.kind must be desk-assets | hosted-spa | none");
  if (r.frontend?.kind === "hosted-spa" && (!r.frontend.entry_html || !r.frontend.bundle_dir)) e.push("hosted-spa frontend needs entry_html and bundle_dir");
  if (r.preflight !== undefined && !Array.isArray(r.preflight)) e.push("preflight must be a list of commands");
  for (const k of ["sources", "docs", "required_apps", "integrations", "env", "staging_checks", "known_limitations"] as const) if (!Array.isArray(r[k])) e.push(`${k} must be a list`);
  if (!r.target || typeof r.target !== "object") e.push("target must be an object of version ranges");
  for (const p of [r.frappe_package, ...(r.sources ?? []), ...(r.docs ?? [])]) if (typeof p === "string" && (p.startsWith("/") || p.split("/").includes(".."))) e.push(`path must be repository-relative: ${p}`);
  return e;
}

/** Why an app cannot be exported at all, or null when it can. Missing apps fail visibly instead of being invented. */
export function refusal(app: string, descriptor: unknown, packageFound: boolean, ctx: Pick<FactoryContext, "registered">): FactoryRefusal | null {
  const known = KNOWN_APPS[app];
  if (descriptor === undefined) {
    return { app, status: "SOURCE_REQUIRED", reasons: [`${known?.title ?? app}: no release descriptor src/plugins/${app}/release.json in this repository`, ...(ctx.registered[app] ? [] : [`${app} is not a registered DIGIT app in src/plugins/registry.ts`])], needed: known?.needed ?? [`src/plugins/${app}/release.json`, `installable Frappe package for ${app}`] };
  }
  const errs = descriptorErrors(descriptor, app);
  if (errs.length) return { app, status: "INVALID_DESCRIPTOR", reasons: errs, needed: ["a valid release descriptor (see docs/digit-app-builder/EXPORT_FACTORY.md)"] };
  if (!ctx.registered[app]) return { app, status: "NOT_REGISTERED", reasons: [`${app} has a descriptor but no registered plugin manifest`], needed: [`register ${app} in src/plugins/registry.ts`] };
  if (!packageFound) return { app, status: "SOURCE_REQUIRED", reasons: [`Frappe package ${(descriptor as ReleaseDescriptor).frappe_package} not found`], needed: known?.needed ?? [] };
  return null;
}

// ---------------------------------------------------------------- parsers

/** Static read of hooks.py: values the release depends on (no Python execution). */
export function parseHooks(src: string, app: string) {
  const str = (name: string) => new RegExp(`^${name}\\s*=\\s*["']([^"']+)["']`, "m").exec(src)?.[1];
  const list = (name: string) => {
    const m = new RegExp(`^${name}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(src);
    return m ? [...m[1]!.matchAll(/["']([^"']+)["']/g)].map((x) => x[1]!) : [];
  };
  const assetRefs = [...new Set([...src.matchAll(new RegExp(`["'](/assets/${app}/[^"'\\s]+)["']`, "g"))].map((m) => m[1]!))];
  const publicRefs = [...new Set([...src.matchAll(/["'](public\/[^"'\s]+)["']/g)].map((m) => m[1]!))];
  // dotted Python paths into the app ("digit_hr.install.after_install"); route strings and asset URLs are excluded
  const pyRefs = [...new Set([...src.matchAll(new RegExp(`["'](${app}(?:\\.[A-Za-z_][A-Za-z0-9_]*)+)["']`, "g"))].map((m) => m[1]!))];
  const toRoutes = [...new Set([...src.matchAll(/["']to_route["']\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]!))];
  const fixtures = /^fixtures\s*=/m.test(src);
  return { appName: str("app_name"), appVersion: str("app_version"), requiredApps: list("required_apps").map(normaliseApp), assetRefs, publicRefs, pyRefs, toRoutes, fixtures };
}

/** Static read of pyproject.toml: project name, Python requirement and bench Frappe dependencies. */
export function parsePyproject(src: string) {
  const name = /^name\s*=\s*"([^"]+)"/m.exec(src)?.[1];
  const python = /^requires-python\s*=\s*"([^"]+)"/m.exec(src)?.[1] ?? null;
  const deps: Record<string, string> = {};
  const sec = /\[tool\.bench\.frappe-dependencies\]([\s\S]*?)(?:\n\[|$)/.exec(src)?.[1] ?? "";
  for (const m of sec.matchAll(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/gm)) deps[m[1]!] = m[2]!;
  return { name, python, deps };
}

// ---------------------------------------------------------------- package view

/** Files of the package keyed by path relative to the package root (e.g. "digit_hr/hooks.py"). */
export function packageView(files: SourceFile[], pkgRoot: string): Map<string, Uint8Array> {
  const pre = pkgRoot.replace(/\/$/, "") + "/";
  const out = new Map<string, Uint8Array>();
  for (const f of files) if (f.path.startsWith(pre)) out.set(f.path.slice(pre.length), f.data);
  return out;
}

/** DocTypes defined by the package: <app>/<module>/doctype/<slug>/<slug>.json with "doctype": "DocType". */
export function packageDoctypes(pkg: Map<string, Uint8Array>, app: string): string[] {
  const out: string[] = [];
  for (const [p, d] of pkg) {
    const m = new RegExp(`^${app}/[^/]+/doctype/([^/]+)/([^/]+)\\.json$`).exec(p);
    if (!m || m[1] !== m[2]) continue;
    try { const j = JSON.parse(text(d)) as { doctype?: string; name?: string }; if (j.doctype === "DocType" && j.name) out.push(j.name); } catch { /* reported by the schema validator */ }
  }
  return out.sort();
}

// ---------------------------------------------------------------- checks

const check = (id: string, title: string, details: string[], warn: string[] = []): CheckResult =>
  ({ id, title, status: details.length ? "FAIL" : warn.length ? "WARN" : "PASS", details: details.length ? details : warn });

export interface PackageFacts { version: string | null; python: string | null; owned: string[]; migrations: string[]; frontendStatus: CheckStatus }

/** Static checks over the package (C1–C7, C10). External checks (Python compile, schema validator, frozen catalog) are
 *  appended from ctx.external; absent ones are NOT_RUN, never PASS. */
export function checkPackage(desc: ReleaseDescriptor, pkg: Map<string, Uint8Array>, ctx: FactoryContext, sourcesFound: { missing: string[] }): { checks: CheckResult[]; facts: PackageFacts } {
  const app = desc.app;
  const has = (p: string) => pkg.has(p);
  const read = (p: string) => (pkg.has(p) ? text(pkg.get(p)!) : "");
  const checks: CheckResult[] = [];

  // C1 descriptor + registration
  const c1: string[] = [];
  if (!ctx.registered[app]) c1.push(`${app} is not registered in src/plugins/registry.ts`);
  const py = parsePyproject(read("pyproject.toml"));
  if (py.name && py.name !== app) c1.push(`pyproject name ${py.name} != ${app}`);
  const c1w = ctx.experiences.includes(app) ? [] : [`${app} has no Enterprise experience slot (it is not shown in the app selector)`];
  checks.push(check("C1", "Descriptor, registration and package identity", c1, c1w));

  // C2 package structure (bench layout)
  const c2: string[] = [];
  for (const p of ["pyproject.toml", "README.md", `${app}/__init__.py`, `${app}/hooks.py`, `${app}/modules.txt`, `${app}/patches.txt`]) if (!has(p)) c2.push(`missing ${p}`);
  const modules = read(`${app}/modules.txt`).split("\n").map((s) => s.trim()).filter(Boolean);
  for (const m of modules) { const dir = m.toLowerCase().replace(/[\s-]+/g, "_"); if (![...pkg.keys()].some((k) => k.startsWith(`${app}/${dir}/`))) c2.push(`module folder ${app}/${dir}/ for "${m}" is missing`); }
  if (sourcesFound.missing.length) c2.push(...sourcesFound.missing.map((s) => `owned source path not found: ${s}`));
  checks.push(check("C2", "Package structure and owned sources", c2));

  // C3 versions
  const c3: string[] = []; const c3w: string[] = [];
  const version = /__version__\s*=\s*["']([^"']+)["']/.exec(read(`${app}/__init__.py`))?.[1] ?? null;
  const hooks = parseHooks(read(`${app}/hooks.py`), app);
  if (!version) c3.push(`${app}/__init__.py has no __version__`);
  else if (!SEMVER.test(version)) c3.push(`__version__ ${version} is not semantic`);
  if (hooks.appVersion && version && hooks.appVersion !== version) c3.push(`hooks.app_version ${hooks.appVersion} != __version__ ${version}`);
  if (hooks.appName && hooks.appName !== app) c3.push(`hooks.app_name ${hooks.appName} != ${app}`);
  const pv = ctx.registered[app];
  if (pv && version && pv !== version) c3w.push(`virtual plugin manifest version ${pv} differs from the Frappe package version ${version} (independent version lines; the release uses ${version})`);
  checks.push(check("C3", "Version consistency", c3, c3w));

  // C4 dependencies
  const c4: string[] = [];
  const req = new Set(hooks.requiredApps); const want = new Set(desc.required_apps.map(normaliseApp));
  const wantNonFrappe = [...want].filter((a) => a !== "frappe");
  for (const a of wantNonFrappe) if (!req.has(a)) c4.push(`hooks.required_apps does not declare ${a}`);
  for (const a of req) if (!want.has(a)) c4.push(`hooks.required_apps declares ${a}, not listed in the descriptor`);
  for (const [a, range] of Object.entries(desc.target)) {
    if (a === "python") { if (py.python !== range) c4.push(`requires-python ${py.python ?? "(none)"} != target ${range}`); continue; }
    if (py.deps[a] !== range) c4.push(`[tool.bench.frappe-dependencies] ${a} = ${py.deps[a] ?? "(none)"}, target ${range}`);
  }
  for (const a of Object.keys(py.deps)) if (!(a in desc.target)) c4.push(`pyproject depends on ${a}, not in the descriptor target`);
  checks.push(check("C4", "Dependency declaration (required_apps, bench dependency ranges)", c4));

  // C5 no bundled core / foreign apps
  const c5: string[] = []; const excluded = [...pkg.keys()].filter((p) => !shouldPack(p));
  for (const core of ["frappe", "erpnext", "hrms", "crm", "payments", "insights"]) if ([...pkg.keys()].some((k) => k.startsWith(`${core}/`) || k.startsWith(`${app}/${core}/__init__.py`))) c5.push(`package bundles a copy of ${core}`);
  checks.push(check("C5", "No bundled Frappe/ERPNext/HRMS core or foreign app", c5, excluded.length ? [`${excluded.length} cache/editor files excluded from the ZIP`] : []));

  // C6 DocType ownership collisions
  const owned = packageDoctypes(pkg, app); const c6: string[] = [];
  for (const dt of owned) {
    if (ctx.catalogDoctypes.has(dt)) c6.push(`${dt} collides with a native catalog DocType`);
    for (const [other, names] of Object.entries(ctx.otherOwned)) if (other !== app && names.includes(dt)) c6.push(`${dt} is also owned by ${other}`);
  }
  checks.push(check("C6", `Owned DocTypes (${owned.length}) collide with no native or other-app DocType`, c6));

  // C7 referenced assets / modules exist
  const c7: string[] = [];
  const www = [...pkg.keys()].filter((k) => k.startsWith(`${app}/www/`) && k.endsWith(".html"));
  const assetRefs = new Set(hooks.assetRefs);
  for (const w of www) for (const m of read(w).matchAll(new RegExp(`["'](/assets/${app}/[^"'\\s?#]+)`, "g"))) assetRefs.add(m[1]!);
  const bundleDir = desc.frontend.kind === "hosted-spa" ? desc.frontend.bundle_dir!.replace(/\/$/, "") : null;
  const bundleMissing: string[] = [];
  for (const ref of assetRefs) {
    const rel = `${app}/public/${ref.slice(`/assets/${app}/`.length)}`;
    if (has(rel)) continue;
    if (bundleDir && rel.startsWith(`${app}/${bundleDir}/`)) bundleMissing.push(ref); else c7.push(`referenced asset ${ref} not found (${rel})`);
  }
  for (const ref of hooks.publicRefs) if (!has(`${app}/${ref}`)) c7.push(`hooks reference ${ref} not found`);
  for (const ref of hooks.pyRefs) {
    const parts = ref.split(".").slice(1); let ok = false;
    for (let i = parts.length; i >= 1 && !ok; i--) {
      const mod = parts.slice(0, i).join("/"); const rest = parts.slice(i);
      const file = has(`${app}/${mod}.py`) ? `${app}/${mod}.py` : has(`${app}/${mod}/__init__.py`) ? `${app}/${mod}/__init__.py` : null;
      if (!file) continue;
      ok = rest.length === 0 || new RegExp(`^(?:def|class)\\s+${rest[0]}\\b|^${rest[0]}\\s*=`, "m").test(read(file));
    }
    if (!ok) c7.push(`hooks reference ${ref} does not resolve to a Python module/function in the package`);
  }
  for (const r of hooks.toRoutes) if (!www.some((w) => w === `${app}/www/${r}.html` || w === `${app}/www/${r}/index.html`)) c7.push(`website route target ${r} has no www page`);
  checks.push(check("C7", "Every hooks/www reference resolves inside the package", c7));

  // C10 frontend
  const c10: string[] = []; const c10w: string[] = [];
  if (desc.frontend.kind === "hosted-spa") {
    if (!has(`${app}/${desc.frontend.entry_html}`)) c10.push(`entry page ${desc.frontend.entry_html} missing`);
    if (bundleMissing.length || ![...pkg.keys()].some((k) => k.startsWith(`${app}/${bundleDir}/`))) {
      c10.push(`compiled frontend bundle ${app}/${bundleDir}/ is absent (${bundleMissing.length} referenced bundle files missing)`);
      if (desc.frontend.gap) c10.push(`gap: ${desc.frontend.gap}`);
    }
  } else if (desc.frontend.kind === "desk-assets") {
    if (!hooks.assetRefs.length && !hooks.publicRefs.length) c10w.push("hooks include no Desk assets");
  }
  const c10r = check("C10", `Frappe frontend delivery (${desc.frontend.kind})`, c10, c10w);
  checks.push(c10r);

  // external
  checks.push(ctx.external.python ?? { id: "C8", title: "Python sources compile", status: "NOT_RUN", details: ["not executed"] });
  checks.push(ctx.external.schema ?? { id: "C9", title: "Frappe v16 schema validation (scripts/validate_frappe_app.py)", status: "NOT_RUN", details: ["not executed"] });
  checks.push(ctx.external.catalog ?? { id: "C11", title: "Frozen Core catalog unchanged", status: "NOT_RUN", details: ["not executed"] });

  const migrations = read(`${app}/patches.txt`).split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#") && !s.startsWith("["));
  return { checks: checks.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))), facts: { version, python: py.python, owned, migrations, frontendStatus: c10r.status } };
}

/** Readiness from evidence: a stage passes only if every earlier stage passed. Hosted stages stay NOT_RUN without a
 *  staging bench; production is never authorised by the factory. */
export function readiness(app: string, checks: CheckResult[], built: boolean, ctx: Pick<FactoryContext, "registered" | "experiences">): ReleaseManifest["readiness"] {
  const by = (ids: string[]) => ids.every((id) => checks.find((c) => c.id === id)?.status === "PASS" || checks.find((c) => c.id === id)?.status === "WARN");
  const r = {} as Record<ReleaseStage, StageResult>;
  const gates: Record<ReleaseStage, boolean | null> = {
    VIRTUAL_APP_INTEGRATED: !!ctx.registered[app] && ctx.experiences.includes(app),
    EXPORT_SOURCE_COMPLETE: by(["C1", "C2", "C5"]),
    EXPORT_PACKAGE_BUILT: built,
    EXPORT_STATIC_VALIDATED: checks.every((c) => c.status === "PASS" || c.status === "WARN"),
    FRAPPE_TEST_INSTALLED: null,
    FRAPPE_HOSTED_UI_VERIFIED: null,
  };
  let ok = true; let highest: ReleaseStage | "NONE" = "NONE";
  for (const s of RELEASE_STAGES) {
    const g = gates[s];
    if (g === null) { r[s] = "NOT_RUN"; ok = false; continue; }
    r[s] = ok && g ? "PASS" : "FAIL";
    if (r[s] === "PASS") highest = s; else ok = false;
  }
  return { ...r, highest, production: "PRODUCTION_NOT_AUTHORIZED" };
}

// ---------------------------------------------------------------- packing

/** Byte-identical ZIP for identical input: sorted entries, fixed entry time, fixed compression level. */
export function deterministicZip(entries: { path: string; data: Uint8Array }[]): Uint8Array {
  const [d, t] = ZIP_EPOCH.split("T") as [string, string];
  const [y, mo, da] = d.split("-").map(Number) as [number, number, number];
  const [h, mi, s] = t.split(":").map(Number) as [number, number, number];
  const mtime = new Date(y, mo - 1, da, h, mi, s);
  const z: Zippable = {};
  for (const e of [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) z[e.path] = [e.data, { mtime, level: 6 }];
  return zipSync(z);
}

export const artifact = (file: string, data: Uint8Array, entries?: number): Artifact => ({ file, sha256: sha256(data), bytes: data.byteLength, ...(entries !== undefined ? { entries } : {}) });

// ---------------------------------------------------------------- documents

const statusIcon = (s: string) => (s === "PASS" ? "PASS" : s === "WARN" ? "PASS (warning)" : s);

/** Installation guide generated from the same manifest as the artifacts, so it can never describe another build. */
export function installGuide(m: ReleaseManifest, desc: ReleaseDescriptor): string {
  const zip = m.artifacts.find((a) => a.file.endsWith("-frappe.zip"));
  const src = m.artifacts.find((a) => a.file.endsWith("-source.zip"));
  const L: string[] = [];
  L.push(`# ${m.title} ${m.version} — Installation guide`, "");
  L.push(`Generated by ${m.factory} from commit \`${m.source.commit}\`${m.source.dirty ? " (working tree had uncommitted changes)" : ""} at ${m.built_at}.`);
  L.push(`Readiness: **${m.readiness.highest}** — ${m.readiness.production}. Hosted Frappe stages are not verified by this release.`, "");
  L.push("## Artifacts", "", "| File | SHA-256 | Bytes |", "|---|---|---|");
  for (const a of m.artifacts) L.push(`| ${a.file} | \`${a.sha256}\` | ${a.bytes} |`);
  L.push("", "Verify before installing: `sha256sum -c SHA256SUMS`.", "");
  L.push("## Prerequisites", "");
  for (const [a, r] of Object.entries(m.target)) L.push(`- ${a} ${r}`);
  L.push(`- Required Frappe apps installed on the site first: ${m.required_apps.join(", ")}`);
  if (desc.frontend.build) L.push(`- Frontend build toolchain: \`${desc.frontend.build}\``);
  L.push("- A STAGING site (never production) with a fresh backup.", "");
  L.push("## Install on a staging bench", "", "```bash");
  L.push("bench --site <staging-site> backup --with-files");
  L.push(`unzip ${zip?.file ?? `${m.app}-frappe.zip`} -d /tmp/${m.app}-release   # creates /tmp/${m.app}-release/${m.app}`);
  L.push(`bench get-app /tmp/${m.app}-release/${m.app}`);
  for (const c of desc.preflight ?? []) L.push(`${c}   # read-only preflight`);
  L.push(`bench --site <staging-site> install-app ${m.app}`);
  L.push(`bench --site <staging-site> migrate`);
  L.push(`bench build --app ${m.app}`);
  L.push("bench restart", "```", "");
  L.push("## Configuration", "");
  if (!m.env.length) L.push("- No environment variables are required.");
  for (const e of m.env) L.push(`- \`${e.name}\` (${e.required ? "required" : "optional"}): ${e.purpose}`);
  if (!m.integrations.length) L.push("- No external integrations are included.");
  for (const i of m.integrations) L.push(`- Integration **${i.name}** — ${i.status}: ${i.needs}`);
  L.push("", "## Migrations", "");
  L.push(m.migrations.length ? m.migrations.map((p) => `- \`${p}\``).join("\n") : "- No patches (patches.txt is empty); `bench migrate` syncs the app's DocTypes and fixtures only.");
  L.push("", "## Owned DocTypes", "", m.owned_doctypes.length ? m.owned_doctypes.map((d) => `- ${d}`).join("\n") : "- None (the app adds presentation and logic over native records only).");
  L.push("", "## Frontend", "", `Delivery: **${m.frontend.kind}** — ${m.frontend.summary}`, `Status: **${m.frontend.status}**${m.frontend.gap && m.frontend.status === "FAIL" ? ` — ${m.frontend.gap}` : ""}`);
  L.push("", "## Rollback", "", "```bash", `bench --site <staging-site> uninstall-app ${m.app}`, "bench --site <staging-site> restore <backup-file> --with-public-files <public.tar> --with-private-files <private.tar>   # if data must return to the pre-install state", "bench restart", "```");
  L.push("Uninstalling removes the app's own DocTypes and their rows; native ERPNext/HRMS records are not touched by the app.", "");
  L.push("## Staging verification checklist", "", ...desc.staging_checks.map((c) => `- [ ] ${c}`), "");
  L.push("## Static validation (this build)", "", "| Check | Result | Details |", "|---|---|---|");
  for (const c of m.checks) L.push(`| ${c.id} ${c.title} | ${statusIcon(c.status)} | ${c.details.slice(0, 4).join("; ").replace(/\|/g, "\\|") || "—"}${c.details.length > 4 ? ` (+${c.details.length - 4} more)` : ""} |`);
  L.push("", "## Readiness", "", "| Stage | Result |", "|---|---|");
  for (const s of RELEASE_STAGES) L.push(`| ${s} | ${m.readiness[s]} |`);
  L.push(`| PRODUCTION | NOT AUTHORIZED |`, "");
  L.push("## Known limitations", "", ...(m.known_limitations.length ? m.known_limitations.map((k) => `- ${k}`) : ["- None recorded."]), "");
  if (src) L.push(`The source archive ${src.file} holds the app-owned virtual sources, docs and the Frappe package for review.`, "");
  return L.join("\n");
}

/** Release manifest assembly (pure). */
export function buildManifest(desc: ReleaseDescriptor, facts: PackageFacts, checks: CheckResult[], artifacts: Artifact[], ctx: FactoryContext, builtAt: string, built: boolean): ReleaseManifest {
  return {
    schema: 1, factory: FACTORY_VERSION, app: desc.app, title: desc.title, title_ar: desc.title_ar,
    version: facts.version ?? "0.0.0", virtual_plugin_version: ctx.registered[desc.app] ?? null,
    source: { commit: ctx.commit, dirty: ctx.dirty, package: desc.frappe_package },
    built_at: builtAt, reproducible_zip_epoch: ZIP_EPOCH,
    target: desc.target, required_apps: desc.required_apps, python: facts.python,
    frontend: { ...desc.frontend, status: facts.frontendStatus },
    owned_doctypes: facts.owned, migrations: facts.migrations,
    integrations: desc.integrations, env: desc.env,
    artifacts, checks, readiness: readiness(desc.app, checks, built, ctx), known_limitations: desc.known_limitations,
  };
}

/** SHA256SUMS in coreutils format. */
export const sumsFile = (arts: Artifact[]) => arts.map((a) => `${a.sha256}  ${a.file}`).join("\n") + "\n";

/** The guide must list every artifact with its checksum (C12, checked after writing). */
export function guideConsistency(guide: string, arts: Artifact[]): CheckResult {
  const miss = arts.filter((a) => !guide.includes(a.file) || !guide.includes(a.sha256)).map((a) => `guide does not list ${a.file} with its checksum`);
  return { id: "C12", title: "Installation guide matches the built artifacts", status: miss.length ? "FAIL" : "PASS", details: miss };
}
