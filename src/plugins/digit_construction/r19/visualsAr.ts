/**
 * Arabic for the fixed labels the R19 visuals use (stage names, bridge steps, matrix columns, movement kinds,
 * exception names). Display-only: r19Workspace.tsx localizes chart data on Arabic screens; record names, codes and
 * stored values are never translated.
 */
export const VIS_AR: Record<string, string> = {
  "Contract value": "قيمة العقد",
  // department dashboards (owner UX depth round 2026-11-14)
  "Certified (cumulative)": "المعتمد (تراكمي)", "Collected (cumulative)": "المحصل (تراكمي)", "Material requests": "طلبات المواد", "RFQs awaiting quotes": "طلبات عروض بانتظار العروض", "Quotations to order": "عروض بانتظار أمر الشراء",
  "Orders to receive": "أوامر بانتظار الاستلام", "Receipts to invoice": "استلامات بانتظار الفوترة", "Invoices to pay": "فواتير بانتظار السداد", "On time": "في الموعد", "Quality": "الجودة", "Price": "السعر", "Score": "التقييم",
  "Cash in": "التدفق الداخل", "Live": "سارٍ", "Expired": "منتهٍ", "Not issued": "غير صادر", "Cash out": "التدفق الخارج", "Forecast change": "تغير التوقع", "Ready": "جاهز", "Material": "مواد", "Drawing": "رسومات", "Equipment": "معدات", "Permit": "تصريح", "Labour": "عمالة",
  // bridges / funnels / profiles
  "Open change events": "أحداث تغيير مفتوحة", "Variations pending": "أوامر تغيير معلقة", "Certified not invoiced": "معتمد غير مفوتر", "Receivables outstanding": "ذمم قائمة", "Retention held": "محتجزات محتجزة",
  "Total exposure": "إجمالي التعرض", "All workflow documents": "كل مستندات مسارات العمل", "Past draft": "تجاوزت المسودة", "Decided": "تم البت فيها", "Recorded": "مسجلة", "Priced": "مسعّرة", "Submitted": "مقدمة", "Won": "فائزة",
  "Certified gross": "الإجمالي المعتمد", "Invoiced gross": "الإجمالي المفوتر", "Left to invoice": "متبقٍ للفوترة", "Claimed": "المطالب به", "Certified": "المعتمد", "Invoiced": "المفوتر", "Collected": "المحصل",
  "Open events": "أحداث مفتوحة", "Approved not varied": "معتمد ولم يصبح أمر تغيير", "Unapproved change value": "قيمة التغيير غير المعتمدة", "CR expiring": "سجل تجاري ينتهي", "Insurance expiring": "تأمين ينتهي",
  "Score below 60": "تقييم أقل من 60", "Suspended": "موقوف", "Back charges open": "خصومات مفتوحة", "Final account disputed": "حساب ختامي متنازع عليه", "Gross": "الإجمالي", "Retention": "المحتجزات",
  "Advance recovery": "استرداد الدفعة المقدمة", "Other deductions & back charges": "خصومات أخرى وخصومات مرتدة", "Net": "الصافي", "Original": "الأصلية", "Approved revisions": "تعديلات معتمدة", "Transfers in": "مناقلات واردة",
  "Transfers out": "مناقلات صادرة", "Revised budget": "الموازنة المعدلة", "Forecast overruns": "تجاوزات متوقعة", "Forecast underruns": "وفورات متوقعة", "EAC": "التكلفة المتوقعة عند الإنجاز", "Total approved spend": "إجمالي المصروف المعتمد",
  "Other settlements": "تسويات أخرى", "Outstanding": "القائم", "Advance terms": "شروط الدفعة المقدمة", "Recovered": "المسترد", "UNALLOCATED": "غير موزع",
  // matrix columns / lanes
  "RFI": "طلب استيضاح", "Submittal": "مقدَّم", "Not yet certified": "غير معتمد بعد", "Billed": "المستخلص", "Open": "المفتوح", "Draft": "مسودة", "Approved": "معتمد", "Technical": "فني", "Commercial": "تجاري", "Financial": "مالي",
  "Not due": "غير مستحق", "Under Review": "قيد المراجعة", "Pricing Requested": "مطلوب تسعيره", "Rejected": "مرفوض", "Cancelled": "ملغى", "Under Assessment": "قيد التقييم", "Disputed": "متنازع عليه",
  // retention / advance movements
  "receipt": "مقبوض", "payment": "مدفوع", "recovery": "استرداد", "held": "محتجز", "released": "مفرج عنه", "reserved": "محجوز",
  // cost source exceptions (domain/costVerify.ts EXCEPTION_LABEL)
  "Unmapped Cost Code": "رمز تكلفة غير مربوط", "Cost Code Not in Budget": "رمز تكلفة خارج الموازنة", "Possible Double Count": "احتمال احتساب مزدوج", "Billed Amount Mismatch": "اختلاف المبلغ المستخلص",
  "Bill Not Invoiced": "مستخلص غير مفوتر", "Expense Not Posted": "مصروف غير مرحّل", "Allocation Source Changed": "تغير مصدر التخصيص", "Allocation Source Missing": "مصدر التخصيص مفقود",
  "High": "مرتفعة", "Medium": "متوسطة", "Low": "منخفضة", "Quantity variance": "فرق كمية", "Price variance": "فرق سعر", "CR": "السجل التجاري", "Insurance": "التأمين",
};
