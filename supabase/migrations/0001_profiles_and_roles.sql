-- ============================================================
-- مقياس — الأمر 1: الحسابات والأدوار وصلاحيات RLS
-- ============================================================

-- الأدوار الأربعة
create type public.app_role as enum ('user', 'instructor', 'team', 'admin');

-- الملف الشخصي لكل مستخدم (يُنشأ تلقائياً عند التسجيل)
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null default '',
  email           text,
  phone           text check (phone is null or phone ~ '^05[0-9]{8}$'),
  specialization  text,
  organization    text,           -- الجامعة أو جهة العمل (اختياري)
  avatar_url      text,
  role            public.app_role not null default 'user',
  preferred_lang  text not null default 'ar' check (preferred_lang in ('ar', 'en')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index profiles_phone_key on public.profiles (phone) where phone is not null;
create index profiles_role_idx on public.profiles (role);

-- ------------------------------------------------------------
-- دوال مساعدة (security definer لتفادي التكرار اللانهائي في RLS)
-- ------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.has_role(roles public.app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() = any (roles), false)
$$;

-- ------------------------------------------------------------
-- إنشاء الملف الشخصي تلقائياً عند التسجيل (بريد أو Google)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, specialization, organization, avatar_url, preferred_lang)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'specialization', ''),
    nullif(new.raw_user_meta_data ->> 'organization', ''),
    new.raw_user_meta_data ->> 'avatar_url',
    case when new.raw_user_meta_data ->> 'preferred_lang' = 'en' then 'en' else 'ar' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- حماية الأعمدة الحساسة: لا يغيّر الدور أو البريد إلا المدير
-- (auth.uid() فارغ = محرّر SQL في لوحة Supabase، ويُسمح له لتعيين أول مدير)
-- ------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'only admins can change roles' using errcode = '42501';
    end if;
    new.email := old.email;
    new.id := old.id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

-- كل مستخدم يرى ملفه، والمدير يرى الجميع
create policy "profiles: read own or admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- كل مستخدم يعدّل ملفه (الدور محمي بالـ trigger)، والمدير يعدّل الجميع
create policy "profiles: update own or admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- الحذف للمدير فقط؛ الإضافة تتم عبر الـ trigger وحده
create policy "profiles: delete admin"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ملاحظة: صلاحيات رؤية المدرّب لمتدرّبيه، وعضو الفريق لعملاء الطلبات المسندة إليه،
-- تُضاف مع جداول الدورات والطلبات في الأوامر 3 و4.
