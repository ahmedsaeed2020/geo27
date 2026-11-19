/** Evaluates Frappe depends_on expressions via the controlled interpreter (no code execution). */
import { evalDependsSafe } from "./expr";

export function evalDepends(expr: string | undefined, doc: Record<string, unknown>): boolean {
  return evalDependsSafe(expr, doc).value;
}
export { evalDependsSafe };
