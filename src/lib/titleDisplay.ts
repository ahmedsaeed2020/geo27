/**
 * Form title display: frappe shows a title taken from a Select option or from a Link to a translated DocType
 * (DocType.translated_doctype, restored by scripts/extract-translated-doctypes.py) through __(), so an Arabic
 * screen reads e.g. "استلام مواد" for Stock Entry Type "Material Receipt" while the stored value stays English.
 */
import TRANSLATED from "./translatedDoctypes.json";
import type { DocTypeMeta } from "./catalog";

const SET = new Set<string>(TRANSLATED as string[]);

export const isTranslatedDoctype = (dt: string) => SET.has(dt);

/** Whether this DocType's title value is a translatable label (Select option or translated-DocType link), not record content. */
export function titleTranslated(meta: DocTypeMeta): boolean {
  const f = meta.title_field ? meta.fields.find((x) => x.fieldname === meta.title_field) : undefined;
  return !!f && (f.fieldtype === "Select" || (f.fieldtype === "Link" && SET.has(String(f.options ?? ""))));
}
