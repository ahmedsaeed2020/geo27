import { Parser } from "htmlparser2";
import { createElement, type ReactNode } from "react";

/** Source rich text becomes inert React nodes; source attributes and executable elements are never retained. */
export function messageNodes(value: unknown): ReactNode[] {
  const root: ReactNode[] = [];
  const stack: { tag: string; children: ReactNode[] }[] = [{ tag: "", children: root }];
  const allowed = new Set(["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "blockquote", "code", "pre"]);
  const hidden = new Set(["script", "style", "iframe", "object", "template", "svg", "math"]);
  let suppressed = 0, key = 0;
  const parser = new Parser({
    onopentag(tag) { if (hidden.has(tag) || suppressed) suppressed++; stack.push({ tag, children: [] }); },
    ontext(text) { if (!suppressed) stack.at(-1)?.children.push(text); },
    onclosetag(tag) {
      const node = stack.pop(); if (!node || !stack.length) return;
      if (suppressed) { suppressed--; return; }
      if (allowed.has(tag)) stack.at(-1)?.children.push(createElement(tag, { key: key++ }, ...(tag === "br" ? [] : node.children)));
      else stack.at(-1)?.children.push(...node.children);
    },
  }, { decodeEntities: true });
  parser.write(String(value ?? "")); parser.end(); return root;
}
export function messageText(value: unknown): string {
  let text = "", suppressed = 0;
  const parser = new Parser({
    onopentag(tag) { if (["script", "style", "iframe", "object", "template", "svg", "math"].includes(tag) || suppressed) suppressed++; },
    ontext(part) { if (!suppressed) text += part; },
    onclosetag() { if (suppressed) suppressed--; else text += " "; },
  }, { decodeEntities: true });
  parser.write(String(value ?? "")); parser.end(); return text.replace(/\s+/g, " ").trim();
}
export function MessageContent({ value }: { value: unknown }) {
  return <div data-no-i18n className="space-y-1 whitespace-pre-wrap break-words [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5">{messageNodes(value)}</div>;
}
