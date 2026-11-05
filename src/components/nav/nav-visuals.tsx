// Menu imagery: every product family has its own icon and its own context photo (shown under the brand's green
// overlay when no real screen is being previewed), and every department or POS activity has a distinct icon, so no
// two entries in one menu share a symbol. Photos are reused approved imagery; no product UI is drawn here.
import type { LucideIcon } from 'lucide-react';
import {
  Activity, BadgeCheck, Building, Building2, CakeSlice, Calculator, CalendarCheck, CalendarClock, ChartPie, ClipboardList,
  Coffee, Coins, Construction, FileCheck, FileSignature, Flower2, Gauge, Glasses, HandCoins, Handshake, HardHat,
  HeartHandshake, Landmark, LayoutDashboard, Magnet, MapPin, Network, Pill, Receipt, ReceiptText, Refrigerator, Ruler,
  ScanSearch, Settings2, ShieldCheck, ShoppingCart, Smartphone, Sofa, Scissors, Store, Target, TrendingUp, TriangleAlert,
  Truck, UserRoundCheck, UserRoundPlus, Users, Wallet, Warehouse, Wrench,
} from 'lucide-react';
import type { L, ProductKey } from '@/content/catalog';
import { PHOTOS } from '@/content/specialist/photos';
import retailCheckout from '@/assets/frames/pos-retail-checkout.webp.asset.json';

export type FamilyVisual = { icon: LucideIcon; photo: { src: string; alt: L } };

const profile = (key: string) => ({ src: PHOTOS[key]?.src ?? '', alt: PHOTOS[key]?.alt ?? { ar: '', en: '' } });

export const FAMILY_VISUAL: Record<ProductKey, FamilyVisual> = {
  pro: { icon: Landmark, photo: profile('corporate-model-table') },
  hr: { icon: Users, photo: profile('role-training') },
  construction: { icon: HardHat, photo: profile('construction-aerial') },
  crm: { icon: HeartHandshake, photo: profile('crm-sales-call') },
  fsm: { icon: Wrench, photo: profile('fsm-rooftop-technician') },
  pos: { icon: Store, photo: { src: retailCheckout.url, alt: { ar: 'كاشير يمسح منتجًا عند نقطة البيع في متجر سعودي', en: 'A cashier scanning a product at the till in a Saudi store' } } },
};

/** Keyed `${product}:${department or solution id}`. */
const DEPARTMENT_ICON: Record<string, LucideIcon> = {
  'pro:accounting': Calculator,
  'pro:selling': HandCoins,
  'pro:purchasing': ShoppingCart,
  'pro:inventory': Warehouse,
  'pro:fixed-assets': Building2,
  'hr:core-hr': Network,
  'hr:talent-hcm': UserRoundPlus,
  'hr:workforce-management': CalendarClock,
  'hr:payroll-rewards': Wallet,
  'hr:employee-experience': UserRoundCheck,
  'hr:people-intelligence': ChartPie,
  'hr:administration-governance': ShieldCheck,
  'construction:portfolio': LayoutDashboard,
  'construction:estimating': Ruler,
  'construction:projects': Construction,
  'construction:contracts': FileSignature,
  'construction:subcontractors': Users,
  'construction:claims': Receipt,
  'construction:procurement': Truck,
  'construction:budget-cost': Coins,
  'construction:financial-closeout': FileCheck,
  'crm:management': Gauge,
  'crm:leads': Magnet,
  'crm:opportunities': Target,
  'crm:activities': CalendarCheck,
  'crm:accounts': Building,
  'crm:sales-management': TrendingUp,
  'crm:administration': Settings2,
  'fsm:operations': Activity,
  'fsm:sites': MapPin,
  'fsm:agreements': Handshake,
  'fsm:work-orders': ClipboardList,
  'fsm:inspection': ScanSearch,
  'fsm:deficiencies': TriangleAlert,
  'fsm:billing': ReceiptText,
  'fsm:quality': BadgeCheck,
  'fsm:administration': Settings2,
  'pos:mobile-shops': Smartphone,
  'pos:florist': Flower2,
  'pos:salons': Scissors,
  'pos:electrical-appliances': Refrigerator,
  'pos:furniture': Sofa,
  'pos:optical': Glasses,
  'pos:restaurants-cafes': Coffee,
  'pos:sweets': CakeSlice,
  'pos:pharmacies': Pill,
};

export const departmentIcon = (product: ProductKey, id: string): LucideIcon => DEPARTMENT_ICON[`${product}:${id}`] ?? FAMILY_VISUAL[product].icon;
