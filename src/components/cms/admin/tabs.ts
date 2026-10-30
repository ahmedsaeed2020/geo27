import type { ComponentType } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  FileText,
  Globe,
  History,
  Image,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Palette,
  Shield,
  SquarePen,
  Rows3,
} from 'lucide-react';

export type Role = 'owner' | 'editor' | 'sales';
type Tab = { id: string; label: string; icon: ComponentType<{ size?: number }>; roles: Role[]; group: string };

export const TABS: Tab[] = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard, roles: ['owner', 'editor', 'sales'], group: '' },
  { id: 'pages', label: 'الصفحات', icon: FileText, roles: ['owner', 'editor'], group: 'المحتوى' },
  { id: 'stories', label: 'قصص الميزات', icon: BookOpen, roles: ['owner', 'editor'], group: 'المحتوى' },
  { id: 'resources', label: 'الموارد', icon: BookOpen, roles: ['owner', 'editor'], group: 'المحتوى' },
  { id: 'media', label: 'مكتبة الصور', icon: Image, roles: ['owner', 'editor'], group: 'المحتوى' },
  { id: 'home', label: 'أقسام الرئيسية', icon: Rows3, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'pro', label: 'أقسام صفحة Pro', icon: Rows3, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'navigation', label: 'روابط القائمة', icon: Menu, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'seo', label: 'محركات البحث', icon: Globe, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'redirects', label: 'التحويلات', icon: ArrowLeftRight, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'forms', label: 'نموذج الطلب', icon: SquarePen, roles: ['owner', 'editor'], group: 'الموقع' },
  { id: 'branding', label: 'الهوية', icon: Palette, roles: ['owner'], group: 'الموقع' },
  { id: 'leads', label: 'طلبات العملاء', icon: Inbox, roles: ['owner', 'sales'], group: 'العملاء' },
  { id: 'chats', label: 'محادثات المساعد', icon: MessagesSquare, roles: ['owner', 'sales'], group: 'العملاء' },
  { id: 'team', label: 'الفريق والصلاحيات', icon: Shield, roles: ['owner'], group: 'الإدارة' },
  { id: 'security', label: 'أمان الحساب', icon: KeyRound, roles: ['owner', 'editor', 'sales'], group: 'الإدارة' },
  { id: 'audit', label: 'سجل النشاط', icon: History, roles: ['owner', 'editor', 'sales'], group: 'الإدارة' },
];


/** Admin sections visible to a role; the server enforces the same scopes on every action. */
export function tabsFor(role: Role): Tab[] {
  return TABS.filter(t => t.roles.includes(role));
}
