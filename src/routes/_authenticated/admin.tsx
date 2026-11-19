import AdminWorkspace from "@/components/cms/AdminWorkspace";
import { createFileRoute, useNavigate, useRouterState, Outlet } from "@tanstack/react-router";
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { crmIdentity } from '@/lib/crm.functions';
import CrmWorkspace from '@/components/crm/CrmWorkspace';
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type RequestRow = {
  id: string;
  created_at: string;
  kind: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  status: string;
  page_path: string | null;
};
type ThreadRow = { id: string; created_at: string; updated_at: string; locale: string; title: string | null };
type MessageRow = { id: string; role: string; content: string; created_at: string };
type SettingRow = { key: string; value: unknown; updated_at: string };

const TABS = [
  { id: "requests", label: "طلبات النماذج" },
  { id: "chats", label: "محادثات المساعد" },
  { id: "settings", label: "إعدادات الموقع" },
] as const;

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "إدارة المحتوى والعملاء — GeoInTime" }, { name: "description", content: "لوحة إدارة GeoInTime الخاصة للمحتوى والطلبات." }, { property: "og:title", content: "إدارة GeoInTime" }, { property: "og:description", content: "إدارة محتوى وطلبات GeoInTime." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminPage,
});

function AdminPage() {
  const path=useRouterState({select:s=>s.location.pathname});
  const api=useServerFn(crmIdentity);
  const identity=useQuery({queryKey:['crm-identity'],queryFn:()=>api()});
  if(path.startsWith('/admin/crm')) return <Outlet/>;
  if(identity.isPending) return <p className="p-8" dir="rtl">جارٍ تحميل الإدارة…</p>;
  if(identity.data?.role==='sales'||identity.data?.role==='disabled'||identity.data?.role==='admin'&&!identity.data.siteAdmin) return <CrmWorkspace/>;
  return <AdminWorkspace/>;
}
