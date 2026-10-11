import accEg from "@/assets/personas/acc-eg-a.jpg.asset.json";
import accSa from "@/assets/personas/acc-sa-a.jpg.asset.json";
import accSaF from "@/assets/personas/acc-sa-f-a.jpg.asset.json";
import advisor from "@/assets/personas/advisor-sa-a.jpg.asset.json";
import cfo from "@/assets/personas/cfo-sa-a.jpg.asset.json";
import hr from "@/assets/personas/hr-sa-a.jpg.asset.json";
import owner from "@/assets/personas/owner-sa-a.jpg.asset.json";
import pm from "@/assets/personas/pm-sa-a.jpg.asset.json";
import proc from "@/assets/personas/proc-sa-a.jpg.asset.json";
import retail from "@/assets/personas/retail-sa-a.jpg.asset.json";
import sales from "@/assets/personas/sales-sa-a.jpg.asset.json";
import wh from "@/assets/personas/wh-sa-a.jpg.asset.json";

export const PERSONAS = {
  accEg: accEg.url,
  accSa: accSa.url,
  accSaF: accSaF.url,
  advisor: advisor.url,
  cfo: cfo.url,
  hr: hr.url,
  owner: owner.url,
  pm: pm.url,
  proc: proc.url,
  retail: retail.url,
  sales: sales.url,
  wh: wh.url,
} as const;

export type PersonaKey = keyof typeof PERSONAS;
