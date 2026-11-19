import pack from "./digit_ar_fields.json";

/** Exact English keys only; never normalize keys or write these labels into records. */
export const DIGIT_FIELDS: Readonly<Record<string, string>> = pack.strings;
export const DIGIT_FIELDS_SOURCE = "digit-fields" as const;

export function fieldTranslation(source: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(DIGIT_FIELDS, source) ? DIGIT_FIELDS[source] : undefined;
}