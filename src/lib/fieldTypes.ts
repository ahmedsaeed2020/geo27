/**
 * Field type support registry (P1.2). Every fieldtype found in the frozen corpus (41 types) and the optional Insights
 * source has an explicit rendering mode, so FormView never silently drops a field or pretends an editor exists.
 * READ_ONLY_EXPLICIT = the source control (map, signature pad, barcode renderer, icon picker) is not available in the
 * Virtual Core; the stored value is shown read-only with that explanation.
 */
export type FieldMode = "EDITABLE" | "EDITABLE_LIMITED" | "TABLE" | "LAYOUT" | "DISPLAY" | "READ_ONLY_EXPLICIT";
export interface FieldSupport { mode: FieldMode; control: string; note?: string; note_ar?: string }

export const FIELD_SUPPORT: Record<string, FieldSupport> = {
  Data: { mode: "EDITABLE", control: "text input" }, "Small Text": { mode: "EDITABLE", control: "textarea" }, Text: { mode: "EDITABLE", control: "textarea" },
  "Long Text": { mode: "EDITABLE", control: "textarea" },
  "Text Editor": { mode: "EDITABLE_LIMITED", control: "plain textarea", note: "Rich text formatting toolbar is not available; HTML is edited as text.", note_ar: "شريط تنسيق النص الغني غير متاح؛ يُحرَّر المحتوى كنص." },
  "HTML Editor": { mode: "EDITABLE_LIMITED", control: "code textarea", note: "Edited as source text; no preview.", note_ar: "يُحرَّر كنص مصدري دون معاينة." },
  "Markdown Editor": { mode: "EDITABLE_LIMITED", control: "textarea", note: "Edited as Markdown text; no preview.", note_ar: "يُحرَّر كنص ماركداون دون معاينة." },
  Code: { mode: "EDITABLE", control: "monospace textarea" }, JSON: { mode: "EDITABLE", control: "monospace textarea with JSON validity" },
  Int: { mode: "EDITABLE", control: "number" }, Float: { mode: "EDITABLE", control: "number" }, Currency: { mode: "EDITABLE", control: "number (formatted)" }, Percent: { mode: "EDITABLE", control: "number (%)" },
  Date: { mode: "EDITABLE", control: "date" }, Datetime: { mode: "EDITABLE", control: "datetime-local" }, Time: { mode: "EDITABLE", control: "time" },
  Check: { mode: "EDITABLE", control: "checkbox" }, Select: { mode: "EDITABLE", control: "select" }, Autocomplete: { mode: "EDITABLE", control: "text with options list" },
  Link: { mode: "EDITABLE", control: "link search (scoped, link filters, set_query)" },
  "Dynamic Link": { mode: "EDITABLE", control: "link search resolved from the discriminator field value" },
  Color: { mode: "EDITABLE", control: "color picker" }, Duration: { mode: "EDITABLE", control: "days/hours/minutes/seconds (stored as seconds)" },
  Rating: { mode: "EDITABLE", control: "stars (stored as a 0–1 fraction)" }, Phone: { mode: "EDITABLE", control: "tel input" },
  Password: { mode: "EDITABLE_LIMITED", control: "masked input", note: "Virtual store only: the value is not encrypted (DIGIT stores passwords in __Auth).", note_ar: "تخزين افتراضي فقط: القيمة غير مشفرة (يخزنها DIGIT في __Auth)." },
  Attach: { mode: "EDITABLE_LIMITED", control: "file chooser (file name only)", note: "No upload service: only the file name is stored.", note_ar: "لا توجد خدمة رفع: يُحفظ اسم الملف فقط." },
  "Attach Image": { mode: "EDITABLE_LIMITED", control: "file chooser (file name only)", note: "No upload service: only the file name is stored.", note_ar: "لا توجد خدمة رفع: يُحفظ اسم الملف فقط." },
  "Read Only": { mode: "DISPLAY", control: "read-only value (fetch_from)" }, Image: { mode: "DISPLAY", control: "image from the referenced field" },
  HTML: { mode: "DISPLAY", control: "client-rendered placeholder (form script slot)" }, Button: { mode: "DISPLAY", control: "button (local port when registered)" },
  Heading: { mode: "LAYOUT", control: "heading" }, "Section Break": { mode: "LAYOUT", control: "section" }, "Column Break": { mode: "LAYOUT", control: "column" },
  "Tab Break": { mode: "LAYOUT", control: "tab" }, Fold: { mode: "LAYOUT", control: "fold" },
  Table: { mode: "TABLE", control: "child grid (ChildGrid)" }, "Table MultiSelect": { mode: "TABLE", control: "child grid (ChildGrid)" },
  Geolocation: { mode: "READ_ONLY_EXPLICIT", control: "map", note: "The map control is not available in the virtual Core; the stored GeoJSON is shown read-only.", note_ar: "عنصر الخريطة غير متاح في النواة الافتراضية؛ تُعرض بيانات GeoJSON المخزنة للقراءة فقط." },
  "Attachment Gallery": { mode: "READ_ONLY_EXPLICIT", control: "attachment gallery", note: "The attachment gallery is not available in the virtual Core; the stored value is shown.", note_ar: "معرض المرفقات غير متاح في النواة الافتراضية؛ تُعرض القيمة المخزنة." },
  Signature: { mode: "READ_ONLY_EXPLICIT", control: "signature pad", note: "The signature pad is not available in the virtual Core.", note_ar: "لوحة التوقيع غير متاحة في النواة الافتراضية." },
  Barcode: { mode: "READ_ONLY_EXPLICIT", control: "barcode renderer", note: "Barcode rendering is not available; the stored value is shown as text.", note_ar: "عرض الباركود غير متاح؛ تُعرض القيمة المخزنة كنص." },
  Icon: { mode: "READ_ONLY_EXPLICIT", control: "icon picker", note: "The icon picker is not available; the stored icon name is shown.", note_ar: "منتقي الأيقونات غير متاح؛ يُعرض اسم الأيقونة المخزن." },
};
export function fieldSupport(fieldtype: string): FieldSupport {
  return FIELD_SUPPORT[fieldtype] ?? { mode: "READ_ONLY_EXPLICIT", control: "unsupported", note: `Field type "${fieldtype}" has no virtual control; the stored value is shown read-only.`, note_ar: "نوع الحقل هذا لا يملك عنصر تحكم افتراضيًا؛ تُعرض القيمة المخزنة للقراءة فقط." };
}

/** Frappe Duration: seconds ↔ d/h/m/s parts (frappe/public/js/frappe/utils/datetime.js seconds_to_duration). */
export function secondsToParts(total: number): { days: number; hours: number; minutes: number; seconds: number } {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  return { days: Math.floor(t / 86400), hours: Math.floor((t % 86400) / 3600), minutes: Math.floor((t % 3600) / 60), seconds: t % 60 };
}
export const partsToSeconds = (p: { days?: number; hours?: number; minutes?: number; seconds?: number }) =>
  (Number(p.days) || 0) * 86400 + (Number(p.hours) || 0) * 3600 + (Number(p.minutes) || 0) * 60 + (Number(p.seconds) || 0);
export function formatDuration(total: unknown, opts: { hide_days?: boolean; hide_seconds?: boolean } = {}): string {
  const p = secondsToParts(Number(total) || 0); const out: string[] = [];
  const hours = opts.hide_days ? p.hours + p.days * 24 : p.hours;
  if (!opts.hide_days && p.days) out.push(`${p.days}d`);
  if (hours) out.push(`${hours}h`); if (p.minutes) out.push(`${p.minutes}m`);
  if (!opts.hide_seconds && p.seconds) out.push(`${p.seconds}s`);
  return out.join(" ") || "0s";
}
/** Rating: Frappe ≥14 stores value/total as a fraction; `options` may set the number of stars (default 5). */
export const ratingStars = (options: unknown) => { const n = parseInt(String(options ?? ""), 10); return n > 0 && n <= 10 ? n : 5; };
export const ratingToStars = (v: unknown, total: number) => { const x = Number(v) || 0; return Math.round((x > 1 ? x / total : x) * total); };
