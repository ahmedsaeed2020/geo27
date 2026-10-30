import AdminWorkspace from "@/components/cms/AdminWorkspace";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  head: () => ({ meta: [{ title: "إدارة المحتوى والعملاء — DIGIT" }, { name: "description", content: "لوحة إدارة Digit الخاصة للمحتوى والطلبات والصور." }, { property: "og:title", content: "إدارة DIGIT" }, { property: "og:description", content: "إدارة محتوى وطلبات Digit." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminPage,
});

function AdminPage() { return <AdminWorkspace />; }
