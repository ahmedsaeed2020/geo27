/**
 * Recovery from outdated page files. After an update the browser can still hold the previous page, whose code-split
 * files (hashed names) no longer exist, so loading the next screen fails with "Failed to fetch dynamically imported
 * module" and the root error screen replaces the page. A full reload fetches the current files.
 *
 * TanStack's lazyRouteComponent reloads only once per exact message per session and route chunks loaded by the router
 * itself never reload, so a second update in the same session left a blank error screen. Here each outdated file may
 * reload once per RETRY_MS, which still stops a reload loop when the file is truly gone.
 */
const KEY = "digit-virtual-core:stale-chunk-reload";
const RETRY_MS = 30000;

export function isStaleChunkError(error: unknown): boolean {
  const msg = typeof error === "string" ? error : typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : "";
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(msg);
}

/**
 * Reloads the page unless the same file already triggered a reload within RETRY_MS (a file that is truly gone then
 * shows the error screen instead of looping); a different outdated file after a later update reloads again.
 * Returns whether it reloads.
 */
export function reloadForStaleChunk(error?: unknown): boolean {
  if (typeof window === "undefined") return false;
  const msg = typeof error === "string" ? error : String((error as { message?: unknown })?.message ?? "");
  const sig = msg.match(/https?:\/\/\S+|\/@?[\w./-]+\.(?:m?js|css)/)?.[0] ?? msg;
  let last: { t: number; sig: string } = { t: 0, sig: "" };
  try { last = { ...last, ...(JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Partial<typeof last>) }; } catch { /* storage blocked or old value */ }
  if (last.sig === sig && Date.now() - last.t < RETRY_MS) return false;
  try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), sig })); } catch { /* ignore */ }
  window.location.reload();
  return true;
}

let installed = false;
/** Browser-wide listeners: Vite's preload failure event and unhandled dynamic-import rejections. */
export function installStaleChunkRecovery(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("vite:preloadError", (ev) => { if (reloadForStaleChunk((ev as Event & { payload?: unknown }).payload)) ev.preventDefault(); });
  window.addEventListener("unhandledrejection", (ev) => { if (isStaleChunkError(ev.reason)) reloadForStaleChunk(ev.reason); });
}
