-- ============================================================
-- مقياس — رسائل «تواصل معنا»
-- ============================================================

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 100),
  email       text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 200),
  phone       text check (phone is null or char_length(phone) <= 20),
  topic       text not null default 'general' check (topic in ('general', 'courses', 'services', 'partnership', 'other')),
  message     text not null check (char_length(message) between 10 and 4000),
  user_id     uuid references public.profiles (id) on delete set null,
  handled_at  timestamptz,
  handled_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index on public.contact_messages (created_at desc) where handled_at is null;

alter table public.contact_messages enable row level security;

-- أي زائر يرسل؛ المدير وحده يقرأ ويعالج
create policy "contact: anyone can send" on public.contact_messages for insert to anon, authenticated
  with check (handled_at is null and handled_by is null and (user_id is null or user_id = auth.uid()));
create policy "contact: admin read" on public.contact_messages for select to authenticated
  using (public.is_admin());
create policy "contact: admin handle" on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
