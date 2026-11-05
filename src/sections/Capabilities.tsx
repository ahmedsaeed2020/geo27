import type { ComponentType, SVGProps } from "react";
import { ArrowLeft, ArrowRight, Network, FileStack, BellRing, ShieldCheck, LayoutDashboard, FileBarChart2 } from "lucide-react";
import { useLocale, localeHref } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
import { CAPABILITIES, CAPABILITY_CARDS, type CapabilityIcon } from "@/content/home";

const ICONS: Record<CapabilityIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  "360": Network, documents: FileStack, approvals: BellRing, permissions: ShieldCheck, dashboards: LayoutDashboard, reports: FileBarChart2,
};

/** Cross-system capabilities, each opening the DIGIT Pro V4 page that shows it on real screens. */
export default function Capabilities() {
  const l = useLocale();
  const Arrow = l === "ar" ? ArrowLeft : ArrowRight;
  return (
    <section id="capabilities" className="py-20 max-md:py-14" style={{ background: "linear-gradient(160deg, var(--deep), var(--dark))" }}>
      <div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
        <div className="text-center">
          <p className="font-monospace text-[14px] font-bold tracking-[2px] text-mint uppercase">{CAPABILITIES.eyebrow[l]}</p>
          <SectionHeading k="capabilities" className="mt-3 text-[36px] leading-[1.2] font-extrabold text-paper max-md:text-[28px]">
            {CAPABILITIES.heading[l]}
          </SectionHeading>
          <p className="mx-auto mt-4 max-w-[640px] text-[17px] leading-[1.7] text-paper/74">{CAPABILITIES.lede[l]}</p>
        </div>

        <ul className="mt-12 grid list-none grid-cols-3 gap-6 p-0 max-lg:grid-cols-2 max-lg:gap-5 max-md:grid-cols-1">
          {CAPABILITY_CARDS.map(c => {
            const Icon = ICONS[c.icon];
            return (
              <li key={c.icon} data-motion-card>
                <a
                  href={localeHref(c.href, l)}
                  className="group flex h-full flex-col rounded-[16px] border border-paper/14 bg-paper/6 p-[22px] text-start transition-colors hover:border-mint/50 hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-mint"
                >
                  <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-mint/12 text-mint">
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <h3 className="text-[16.5px] font-extrabold text-paper">{c.title[l]}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-[1.7] text-paper/66">{c.body[l]}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-mint">
                    {CAPABILITIES.open[l]} <Arrow className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
