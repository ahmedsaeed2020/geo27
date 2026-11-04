import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { localeHref, useLocale } from '@/lib/i18n';

/** Internal link that keeps the visitor's language and supports an in-page hash (department cards on hubs). */
export function NavLink({ path, hash, className, children, onClick, onFocus, onMouseEnter, ...rest }: {
  path: string;
  hash?: string | undefined;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  onFocus?: () => void;
  onMouseEnter?: () => void;
  'aria-current'?: 'page' | undefined;
  'data-live'?: string | undefined;
}) {
  const locale = useLocale();
  return (
    <Link
      to={localeHref(path, locale)}
      {...(hash ? { hash } : {})}
      className={className}
      onClick={onClick}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
      {...rest}
    >
      {children}
    </Link>
  );
}

export const NAV_COPY = {
  about: { ar: 'من نحن', en: 'About' },
  systems: { ar: 'الأنظمة', en: 'Systems' },
  resources: { ar: 'الموارد', en: 'Resources' },
  overview: { ar: 'نظرة عامة على', en: 'Overview of' },
  openMenu: { ar: 'عرض قائمة', en: 'Show menu for' },
  crossDept: { ar: 'عبر الأقسام', en: 'Across departments' },
  byRole: { ar: 'حسب الدور', en: 'By role' },
  byProblem: { ar: 'حسب التحدي', en: 'By business challenge' },
  realScreen: { ar: 'من شاشات DIGIT Pro الفعلية', en: 'From the live DIGIT Pro screens' },
  allSystems: { ar: 'كل الأنظمة', en: 'All systems' },
  moreSystems: { ar: 'أنظمة أخرى', en: 'More systems' },
  packages: { ar: 'الباقات', en: 'Packages' },
  industries: { ar: 'القطاعات', en: 'Industries' },
  services: { ar: 'الخدمات', en: 'Services' },
  demo: { ar: 'احجز ديمو Digit', en: 'Book Digit demo' },
  walkthrough: { ar: 'اطلب جولة على', en: 'Request a walkthrough of' },
  walkthroughBody: {
    ar: 'نعرض لك المجالات التي تهم منشأتك مباشرة مع فريق Digit.',
    en: 'The Digit team walks you through the areas that matter to your business.',
  },
  departments: { ar: 'أقسام', en: 'departments' },
  areas: { ar: 'مجالات', en: 'areas' },
  solutions: { ar: 'حلول', en: 'solutions' },
  menu: { ar: 'القائمة', en: 'Menu' },
  close: { ar: 'إغلاق القائمة', en: 'Close menu' },
  mainNav: { ar: 'القائمة الرئيسية', en: 'Main navigation' },
  home: { ar: 'الصفحة الرئيسية', en: 'Home' },
} as const;
