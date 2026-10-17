create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can read their own roles"
on public.user_roles for select to authenticated
using (auth.uid() = user_id);

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null default 'contact',
  name text not null,
  email text,
  phone text,
  company text,
  message text,
  locale text not null default 'ar',
  page_path text,
  status text not null default 'new'
);
grant insert on public.contact_requests to anon;
grant select, insert, update on public.contact_requests to authenticated;
grant all on public.contact_requests to service_role;
alter table public.contact_requests enable row level security;

create policy "Anyone can submit a request"
on public.contact_requests for insert to anon
with check (true);

create policy "Admins can read requests"
on public.contact_requests for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update requests"
on public.contact_requests for update to authenticated
using (public.has_role(auth.uid(), 'admin'));

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  visitor_id uuid not null,
  locale text not null default 'ar',
  title text
);
grant select, insert, update on public.chat_threads to anon;
grant select, insert, update, delete on public.chat_threads to authenticated;
grant all on public.chat_threads to service_role;
alter table public.chat_threads enable row level security;

create policy "Visitors manage threads by unguessable id"
on public.chat_threads for select to anon
using (true);

create policy "Visitors create threads"
on public.chat_threads for insert to anon
with check (true);

create policy "Visitors update their threads"
on public.chat_threads for update to anon
using (true);

create policy "Admins read all threads"
on public.chat_threads for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null,
  content text not null
);
grant select, insert on public.chat_messages to anon;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;
alter table public.chat_messages enable row level security;

create policy "Messages readable by thread id"
on public.chat_messages for select to anon
using (true);

create policy "Visitors append messages"
on public.chat_messages for insert to anon
with check (true);

create policy "Admins read all messages"
on public.chat_messages for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.site_settings to anon;
grant select, insert, update on public.site_settings to authenticated;
grant all on public.site_settings to service_role;
alter table public.site_settings enable row level security;

create policy "Settings are publicly readable"
on public.site_settings for select to anon
using (true);

create policy "Admins manage settings"
on public.site_settings for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins update settings"
on public.site_settings for update to authenticated
using (public.has_role(auth.uid(), 'admin'));