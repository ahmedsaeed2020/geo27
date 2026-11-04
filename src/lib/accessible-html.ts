import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * Imported source HTML marks decorative icons as role="img" without giving them a name (and sometimes an empty
 * aria-label). Screen readers then announce an unnamed image. A wrapper whose icon already carries its own label just
 * drops the redundant role; an unnamed SVG is hidden from assistive technology. Named images are left untouched.
 */
const START_TAG = /<([a-zA-Z][\w-]*)(\s[^<>]*?)?(\/?)>/g;

const hasName = (attrs: string, rest: string, tag: string) =>
  /\saria-label="[^"]*\S[^"]*"/.test(attrs) ||
  /\saria-labelledby="[^"]+"/.test(attrs) ||
  /\stitle="[^"]*\S[^"]*"/.test(attrs) ||
  (tag === "svg" && /^\s*<title[\s>]/i.test(rest));

export function accessibleHtml(html: string): string {
  if (!html || !html.includes('role="img"')) return html;
  return html.replace(START_TAG, (whole: string, rawTag: string, rawAttrs: string | undefined, selfClose: string, offset: number) => {
    const attrs = rawAttrs ?? "";
    if (!/\srole="img"/.test(attrs)) return whole;
    const tag = rawTag.toLowerCase();
    if (hasName(attrs, html.slice(offset + whole.length, offset + whole.length + 40), tag)) return whole;
    let next = attrs.replace(/\srole="img"/, "").replace(/\saria-label="\s*"/, "");
    if (tag === "svg" && !/\saria-hidden=/.test(next)) next += ' aria-hidden="true" focusable="false"';
    return `<${rawTag}${next}${selfClose}>`;
  });
}

/** Applies {@link accessibleHtml} to every dangerouslySetInnerHTML in an element tree (after localization). */
export function withAccessibleHtml(tree: ReactNode): ReactNode {
  if (Array.isArray(tree)) return tree.map(withAccessibleHtml);
  if (!isValidElement(tree)) return tree;
  const element = tree as ReactElement<Record<string, unknown>>;
  const props = element.props;
  const inner = props["dangerouslySetInnerHTML"] as { __html?: unknown } | undefined;
  const changes: Record<string, unknown> = {};
  if (inner && typeof inner.__html === "string") {
    const fixed = accessibleHtml(inner.__html);
    if (fixed !== inner.__html) changes["dangerouslySetInnerHTML"] = { __html: fixed };
  }
  const children = props["children"];
  if (children !== undefined && typeof children !== "string") {
    const next = withAccessibleHtml(children as ReactNode);
    if (next !== children) {
      return Array.isArray(next) ? cloneElement(element, changes, ...next) : cloneElement(element, changes, next);
    }
  }
  return Object.keys(changes).length ? cloneElement(element, changes) : tree;
}
