/** One validation message with its bilingual "how to fix" line (src/lib/coreShared/fixHints.ts). The message itself is shown unchanged. */
import { useLang } from "@/i18n";
import { fixHint } from "@/lib/coreShared/fixHints";

export function FixHintLine({ message }: { message: string }) {
  const ar = useLang() === "ar"; const h = fixHint(message);
  return <p data-form-error>{message}{h && <span className="mt-0.5 block text-xs text-foreground" data-fix-hint><span className="font-semibold">{ar ? "طريقة الحل:" : "How to fix:"}</span> {ar ? h[1] : h[0]}</span>}</p>;
}
