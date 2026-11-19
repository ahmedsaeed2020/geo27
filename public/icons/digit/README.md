# DIGIT — مكتبة الأيقونات الموحّدة (All-in-One)
**آخر تحديث:** 7 يوليو 2026 · **المصدر الرسمي:** Google Drive → `04_MARKETING_AND_BRAND/_SOURCES/` (icons.zip · id `1IBfMkqB_VelIu7uRklzJLWvdSxTCAJHr`)

## الجرد
| الفولدر | العائلة | الأسماء | الملفات | الحالة |
|---|---|---|---|---|
| `module-icons/` | الموديولات | 13 | 26 | 10 Official + 3 Extended (crm/hr/manufacturing — بانتظار التوقيع) |
| `feature-icons/` | الفيتشرز (القدرات) | 10 | 20 | Official — من الدرايف |
| `industry-icons/` | القطاعات / الصناعات | 10 | 20 | Official — من الدرايف |
| `service-icons/` | الخدمات | 10 | 20 | Extended — جديد بالكامل، بانتظار توقيع المالك |
| `pos-icons/` | قطاعات نقاط البيع | 4 | 8 | Official — من الدرايف |
| `trust-icons/` | الثقة والتواصل | 8 | 16 | Official — من الدرايف |
| `ui-icons/` | أيقونات واجهة النظام | 25 | 50 | Official — من الدرايف |
| `logo/` | الشعار والعلامة | 6 | 6 | Official — من الدرايف |

**الإجمالي:** 164 ملف SVG + 2 PNG.

## وصفة العلامة (المستخرجة من الملفات الرسمية)
- `viewBox="0 0 100 100"` · `width/height=100` · `role="img"` + `aria-label`.
- **الفاتح:** حبر `#0B1F17` + عنصر أكسنت زمردي واحد فقط `#0A8754` · **الغامق:** حبر `#FFFFFF` + أكسنت منت `#34D399`.
- أشكال هندسية صلبة (rect/circle/polygon) + strokes بعرض 7–10 بأطراف مستديرة عند الحاجة · المحتوى داخل نطاق ~16–84.
- التسمية: `digit-<family>-<name>-light|dark.svg` · العائلات: `mod / feat / ind / svc / pos / trust / ui`.

## العناصر الجديدة (Extended — بانتظار توقيع المالك)
1. **service-icons** (10 × 2): implementation · customization · training · data-migration · hosting · support · zatca-onboarding · erpnext · maintenance · discovery.
2. **موديولات مضافة** داخل `module-icons/` (3 × 2): `digit-mod-crm` (فَنِل مبيعات مركزي) · `digit-mod-hr` (شخصان، الرأس الأيسر بصرياً أكسنت) · `digit-mod-manufacturing` (مصنع بسقف مسنّن ومدخنة وباب أكسنت).
   - ملاحظة: **Projects موجود أصلاً** في الطقم الرسمي (`digit-mod-projects`) — لم يُنشأ بديل له.
3. القرار الحاكم: تنتقل من `Extended` إلى `Official` فقط بعد توقيع المالك ثم رفعها إلى `_SOURCES` في الدرايف.

## المعاينة
افتح `PREVIEW_ALL_ICONS.html` — كل الأيقونات مدمجة inline (يشتغل من أي مكان)، عرض مزدوج فاتح/غامق، وشارة Extended على كل عنصر جديد.
