const ITEMS: { label: string; icon: React.ReactNode }[] = [
  {
    label: "الفوترة الإلكترونية",
    icon: (
      <svg fill="none" stroke="#34D399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 32 32">
        <rect height="24" rx="2.5" width="16" x="8" y="4"></rect>
        <path d="M12 10h8M12 14h8M12 18h5"></path>
        <circle cx="21" cy="22" fill="#34D399" r="4" stroke="none"></circle>
      </svg>
    ),
  },
  {
    label: "عربي وإنجليزي",
    icon: (
      <svg fill="none" stroke="#34D399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="11"></circle>
        <path d="M5 16h22M16 5c3 3 3 19 0 22M16 5c-3 3-3 19 0 22"></path>
      </svg>
    ),
  },
  {
    label: "سحابي أو محلي",
    icon: (
      <svg fill="none" stroke="#34D399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 32 32">
        <path d="M10 17a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 22 9.5a4 4 0 0 1 .3 7.5"></path>
        <rect fill="#34D399" height="4" rx="1" stroke="none" width="12" x="10" y="22"></rect>
      </svg>
    ),
  },
  {
    label: "منصة ERP متكاملة",
    icon: (
      <svg fill="none" stroke="#34D399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 32 32">
        <rect fill="#34D399" height="6" rx="1.4" stroke="none" width="6" x="13" y="13"></rect>
        <rect height="5" rx="1.2" width="5" x="5" y="5"></rect>
        <rect height="5" rx="1.2" width="5" x="22" y="5"></rect>
        <rect height="5" rx="1.2" width="5" x="5" y="22"></rect>
        <rect height="5" rx="1.2" width="5" x="22" y="22"></rect>
        <path d="M10 7.5h4M18 7.5h4M10 24.5h4M18 24.5h4"></path>
      </svg>
    ),
  },
  {
    label: "لوحات وتقارير",
    icon: (
      <svg fill="none" stroke="#34D399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 32 32">
        <rect height="20" rx="2.5" width="22" x="5" y="6"></rect>
        <path d="M5 11h22M10 21v-4M15 21v-7M20 21v-3"></path>
      </svg>
    ),
  },
  {
    label: "تدريب ودعم",
    icon: (
      <svg fill="none" stroke="#34D399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 32 32">
        <circle cx="16" cy="11" r="4"></circle>
        <path d="M9 25c0-4 3-7 7-7s7 3 7 7"></path>
      </svg>
    ),
  },
];

export default function TrustStrip() {
  return (
    <section id="trust-strip" className="border-t border-[rgba(52,211,153,.15)] bg-[#053a2c] text-paper">
      <div className="mx-auto grid max-w-[1600px] grid-cols-6 gap-3.5 px-7 py-[18px] max-lg:grid-cols-3 max-md:grid-cols-2">
        {ITEMS.map((it) => (
          <div key={it.label} className="flex flex-col items-center gap-[7px] text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[rgba(52,211,153,.12)] [&>svg]:h-[22px] [&>svg]:w-[22px]">
              {it.icon}
            </div>
            <span className="text-[11.5px] leading-[1.4] text-[rgba(244,243,238,.82)]">{it.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
