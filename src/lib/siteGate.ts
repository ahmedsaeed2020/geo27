/** Client-side memo of the server sign-in check, so in-app navigation does not call the server on every page. */
let signedIn = false;
export const isMarkedSignedIn = () => signedIn;
export const markSignedIn = () => { signedIn = true; };
export const markSignedOut = () => { signedIn = false; };

/** fetch() rejects with a TypeError ("Failed to fetch") when the request never reaches the server (restart, network drop). */
const isNetworkFailure = (e: unknown) => e instanceof TypeError;

/**
 * Runs a server check, retrying only when the request could not reach the server (about 4.5 s in total: 0.3, 0.6, 1.2,
 * 2.4 s). A dev-server restart or a brief network drop no longer replaces the page with the error screen; a real
 * server answer (signed in or not) and every other error are returned / thrown unchanged, so the gate never opens on
 * a failure.
 */
export async function withNetworkRetry<T>(call: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await call();
    } catch (e) {
      if (typeof window === "undefined" || i >= tries - 1 || !isNetworkFailure(e)) throw e;
      await new Promise((r) => setTimeout(r, 300 * 2 ** i));
    }
  }
}
