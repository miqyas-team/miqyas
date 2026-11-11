-- ============================================================
-- مقياس — الدفع بالتحويل البنكي، الإيصالات، الكوبونات، الفواتير
-- الأسعار المعلنة شاملة ضريبة القيمة المضافة (15%)
-- ============================================================

-- ------------------------------------------------------------
-- إعدادات الموقع (بيانات البنك والمنشأة للفاتورة)
-- ------------------------------------------------------------
create table public.site_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.site_settings (key, value) values
  ('seller_name', ''), ('vat_number', ''), ('cr_number', ''), ('seller_address', ''),
  ('bank_name', ''), ('bank_account_name', ''), ('bank_iban', ''),
  ('contact_email', ''), ('contact_whatsapp', '')
on conflict (key) do nothing;

alter table public.site_settings enable row level security;
create policy "settings: read" on public.site_settings for select using (true);
create policy "settings: admin write" on public.site_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- الكوبونات
-- ------------------------------------------------------------
create type public.coupon_scope as enum ('all', 'courses', 'services');

create table public.coupons (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  percent_off  int not null check (percent_off between 1 and 100),
  scope        public.coupon_scope not null default 'all',
  max_uses     int check (max_uses is null or max_uses > 0),
  used_count   int not null default 0,
  expires_at   date,
  is_active    boolean not null default true,
  note         text,
  created_at   timestamptz not null default now()
);

alter table public.coupons enable row level security;
-- لا قراءة عامة: التحقق عبر الدالة فقط حتى لا تُكشف الأكواد
create policy "coupons: admin" on public.coupons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- المدفوعات
-- ------------------------------------------------------------
create type public.payment_kind   as enum ('course', 'request');
create type public.payment_status as enum ('pending_review', 'confirmed', 'rejected');

create sequence public.invoice_seq start 1;

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  kind             public.payment_kind not null,
  course_id        uuid references public.courses (id) on delete set null,
  request_id       uuid references public.service_requests (id) on delete set null,
  description      text not null,                 -- اسم الدورة أو الخدمة وقت الدفع
  list_price       numeric(10, 2) not null,       -- السعر قبل الخصم (شامل الضريبة)
  coupon_code      text,
  discount         numeric(10, 2) not null default 0,
  total            numeric(10, 2) not null,       -- المبلغ المدفوع (شامل الضريبة)
  vat_amount       numeric(10, 2) not null,
  method           text not null default 'bank_transfer',
  status           public.payment_status not null default 'pending_review',
  receipt_path     text not null,                 -- حاوية receipts: {user_id}/...
  rejection_reason text,
  reviewed_by      uuid references public.profiles (id),
  reviewed_at      timestamptz,
  invoice_number   text unique,                   -- يُخصَّص عند التأكيد
  created_at       timestamptz not null default now(),
  check ((kind = 'course' and course_id is not null) or (kind = 'request' and request_id is not null))
);
create index on public.payments (status, created_at);
create index on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;
create policy "payments: own or admin" on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- الإنشاء والتعديل عبر الدوال فقط

-- ------------------------------------------------------------
-- الدوال
-- ------------------------------------------------------------

-- حساب الخصم (يُستدعى من صفحة الدفع للعرض فقط؛ الحساب النهائي داخل submit_payment)
create or replace function public.quote_payment(p_kind public.payment_kind, p_ref uuid, p_coupon text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_price numeric;
  v_desc  text;
  v_c     public.coupons;
  v_off   int := 0;
  v_err   text;
begin
  if p_kind = 'course' then
    select c.price, c.title_ar into v_price, v_desc
    from public.enrollments e join public.courses c on c.id = e.course_id
    where e.course_id = p_ref and e.user_id = auth.uid() and e.status = 'pending_payment';
  else
    select r.price, r.title into v_price, v_desc
    from public.service_requests r
    where r.id = p_ref and r.client_id = auth.uid() and r.status = 'awaiting_payment';
  end if;
  if v_price is null then raise exception 'nothing to pay' using errcode = 'P0002'; end if;

  if nullif(trim(p_coupon), '') is not null then
    select * into v_c from public.coupons where code = upper(trim(p_coupon));
    if not found or not v_c.is_active then v_err := 'invalid';
    elsif v_c.expires_at is not null and v_c.expires_at < current_date then v_err := 'expired';
    elsif v_c.max_uses is not null and v_c.used_count >= v_c.max_uses then v_err := 'used_up';
    elsif (v_c.scope = 'courses' and p_kind <> 'course') or (v_c.scope = 'services' and p_kind <> 'request') then v_err := 'scope';
    else v_off := v_c.percent_off;
    end if;
  end if;

  return jsonb_build_object(
    'description', v_desc,
    'list_price', v_price,
    'percent_off', v_off,
    'discount', round(v_price * v_off / 100.0, 2),
    'total', round(v_price - v_price * v_off / 100.0, 2),
    'coupon_error', v_err
  );
end;
$$;

-- إرسال إيصال التحويل
create or replace function public.submit_payment(p_kind public.payment_kind, p_ref uuid, p_coupon text, p_receipt_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q     jsonb;
  v_id  uuid;
  v_tot numeric;
begin
  if p_receipt_path is null or split_part(p_receipt_path, '/', 1) <> auth.uid()::text then
    raise exception 'invalid receipt' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where user_id = auth.uid() and status = 'pending_review'
             and ((p_kind = 'course' and course_id = p_ref) or (p_kind = 'request' and request_id = p_ref))) then
    raise exception 'already submitted' using errcode = 'P0001';
  end if;

  q := public.quote_payment(p_kind, p_ref, p_coupon);
  if q ->> 'coupon_error' is not null then raise exception 'coupon %', q ->> 'coupon_error' using errcode = 'P0001'; end if;
  v_tot := (q ->> 'total')::numeric;

  insert into public.payments (user_id, kind, course_id, request_id, description, list_price, coupon_code, discount, total, vat_amount, receipt_path)
  values (auth.uid(), p_kind,
          case when p_kind = 'course' then p_ref end,
          case when p_kind = 'request' then p_ref end,
          q ->> 'description', (q ->> 'list_price')::numeric,
          case when (q ->> 'percent_off')::int > 0 then upper(trim(p_coupon)) end,
          (q ->> 'discount')::numeric, v_tot, round(v_tot - v_tot / 1.15, 2), p_receipt_path)
  returning id into v_id;
  return v_id;
end;
$$;

-- مراجعة الإيصال: التأكيد يفعّل الاشتراك أو يبدأ تنفيذ الطلب
create or replace function public.review_payment(p_payment uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select * into p from public.payments where id = p_payment for update;
  if not found or p.status <> 'pending_review' then raise exception 'not pending' using errcode = 'P0001'; end if;

  if not p_approve then
    if nullif(trim(p_reason), '') is null then raise exception 'reason required' using errcode = 'P0001'; end if;
    update public.payments set status = 'rejected', rejection_reason = trim(p_reason), reviewed_by = auth.uid(), reviewed_at = now() where id = p.id;
    return;
  end if;

  update public.payments
     set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(),
         invoice_number = 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 5, '0')
   where id = p.id;

  if p.coupon_code is not null then
    update public.coupons set used_count = used_count + 1 where code = p.coupon_code;
  end if;

  if p.kind = 'course' then
    update public.enrollments set status = 'active' where course_id = p.course_id and user_id = p.user_id and status = 'pending_payment';
  else
    update public.service_requests set status = 'in_progress', updated_at = now() where id = p.request_id and status = 'awaiting_payment';
    insert into public.request_events (request_id, actor_id, type, from_value, to_value)
    values (p.request_id, auth.uid(), 'status', 'awaiting_payment', 'in_progress');
  end if;
end;
$$;

revoke execute on function public.quote_payment(public.payment_kind, uuid, text) from anon;
revoke execute on function public.submit_payment(public.payment_kind, uuid, text, text) from anon;
revoke execute on function public.review_payment(uuid, boolean, text) from anon;

-- ------------------------------------------------------------
-- الإيصالات (خاصة): صاحبها يرفع ويقرأ، والمدير يقرأ
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('receipts', 'receipts', false, 10485760)
on conflict (id) do nothing;

create policy "receipts: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ------------------------------------------------------------
-- الإيراد في لوحة المدير صار من المدفوعات المؤكدة
-- ------------------------------------------------------------
create or replace function public.admin_revenue(p_months int default 6)
returns jsonb
language sql stable security definer set search_path = public as $$
  with months as (
    select generate_series(
             (date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1))::date,
             date_trunc('month', now())::date, interval '1 month')::date as m
  )
  select jsonb_agg(jsonb_build_object(
           'month', to_char(m, 'YYYY-MM'),
           'courses',  coalesce((select sum(total) from public.payments where status = 'confirmed' and kind = 'course'  and date_trunc('month', reviewed_at)::date = m), 0),
           'services', coalesce((select sum(total) from public.payments where status = 'confirmed' and kind = 'request' and date_trunc('month', reviewed_at)::date = m), 0)
         ) order by m)
  from months
  where public.is_admin()
$$;

revoke execute on function public.admin_revenue(int) from anon;
