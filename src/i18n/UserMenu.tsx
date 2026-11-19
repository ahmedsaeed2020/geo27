import { useState } from "react";
import { LangToggle } from "./LangToggle";
import { arabicDigits, setArabicDigits, useLang } from "./index";

/** Avatar menu (navbar user dropdown): language switch + digit style. */
export function UserMenu() {
  const [open, setOpen] = useState(false);
  useLang();
  return (
    <div className="relative">
      <button type="button" aria-label="User menu" onClick={() => setOpen(!open)} className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">A</button>
      {open && (
        <div className="absolute end-0 top-9 z-40 w-56 space-y-2 rounded-md border border-border bg-popover p-3 text-xs shadow-lg">
          <div className="font-semibold">Administrator</div>
          <div className="flex items-center justify-between gap-2"><span>Language</span><LangToggle /></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={arabicDigits()} onChange={(e) => setArabicDigits(e.target.checked)} /> <span>Arabic-Indic digits</span></label>
        </div>
      )}
    </div>
  );
}
