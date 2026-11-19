import { Toaster } from "@/components/ui/sonner";
import { DigitIcon, useEnterpriseMode } from "./DigitIcon";

/** App-wide toasts: in the DIGIT Enterprise shell the status icons are the official DIGIT success/warning/info/close
 *  icons; the Standard Desk keeps sonner's defaults. */
export function EnterpriseToaster() {
  const ent = useEnterpriseMode();
  return (
    <Toaster position="bottom-right" closeButton
      {...(ent ? { icons: {
        success: <DigitIcon name="ui-success" size={18} />,
        warning: <DigitIcon name="ui-warning" size={18} />,
        info: <DigitIcon name="ui-info" size={18} />,
        error: <DigitIcon name="ui-close" size={18} />,
      } } : {})} />
  );
}
