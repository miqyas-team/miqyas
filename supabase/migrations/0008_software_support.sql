-- ============================================================
-- مقياس — تحميل البرامج عبر الدعم الفني (خدمة بسعر ثابت)
-- زر «تحميل» في صفحة البرامج يفتح طلب خدمة: يدفع العميل ثم يتواصل
-- معه الفريق في محادثة الطلب ويساعده في التحميل والتثبيت.
-- ============================================================

-- بعض الخدمات (كالدعم الفني) لا تحتاج ملفات نهائية قبل الإغلاق
alter table public.service_types add column if not exists requires_deliverable boolean not null default true;

insert into public.service_types (slug, name_ar, name_en, description_ar, description_en, icon, pricing, price, unit_ar, unit_en, requires_location, is_academic, requires_deliverable, position)
values ('software-install', 'تحميل وتثبيت البرامج', 'Software download & setup',
        'يتواصل معك الدعم الفني في محادثة الطلب، ويساعدك في تحميل البرنامج من مصدره الرسمي وتثبيته وتفعيله.',
        'Tech support contacts you in the request chat and helps you download the software from its official source, install and activate it.',
        'FileCog', 'fixed', 49, 'للبرنامج', 'per software', false, false, false, 0)
on conflict (slug) do nothing;

-- روابط التحميل الرسمية للفريق فقط: تُنقل إلى جدول منفصل لا يقرؤه العامة
create table public.software_links (
  software_id  uuid primary key references public.software (id) on delete cascade,
  download_url text not null check (download_url ~* '^https://')
);
insert into public.software_links (software_id, download_url) select id, download_url from public.software;
alter table public.software drop column download_url;

alter table public.software_links enable row level security;
create policy "software_links: team read" on public.software_links for select to authenticated
  using (public.has_role(array['admin', 'team']::public.app_role[]));
create policy "software_links: admin write" on public.software_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- إعادة تعريف انتقال المراحل: شرط الملف النهائي حسب نوع الخدمة
create or replace function public.request_transition(
  p_request  uuid,
  p_to       public.request_status,
  p_price    numeric default null
)
returns public.request_status
language plpgsql security definer set search_path = public as $$
declare
  r        public.service_requests;
  v_admin  boolean := public.is_admin();
  v_team   boolean;
  v_client boolean;
  v_ok     boolean := false;
  v_needs  boolean;
begin
  select * into r from public.service_requests where id = p_request for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  v_team   := r.assigned_to = auth.uid();
  v_client := r.client_id = auth.uid();
  select requires_deliverable into v_needs from public.service_types where id = r.service_type_id;

  if v_admin then
    v_ok := true;
  elsif v_team then
    v_ok := (r.status = 'in_progress' and p_to = 'review');
  elsif v_client then
    v_ok := (r.status in ('new', 'quoting', 'awaiting_payment') and p_to = 'cancelled')
         or (r.status = 'review' and p_to in ('completed', 'in_progress'));
  end if;

  if not v_ok then raise exception 'transition not allowed' using errcode = '42501'; end if;

  if p_to = 'awaiting_payment' then
    if coalesce(p_price, r.price) is null then raise exception 'price required' using errcode = 'P0001'; end if;
    if p_price is not null and p_price is distinct from r.price then
      insert into public.request_events (request_id, actor_id, type, from_value, to_value)
      values (r.id, auth.uid(), 'price', r.price::text, p_price::text);
      r.price := p_price;
    end if;
  end if;

  if p_to = 'review' and coalesce(v_needs, true)
     and not exists (select 1 from public.request_files where request_id = r.id and kind = 'deliverable') then
    raise exception 'deliverable required' using errcode = 'P0001';
  end if;

  update public.service_requests
     set status = p_to, price = r.price, updated_at = now(),
         completed_at = case when p_to = 'completed' then now() else completed_at end
   where id = r.id;

  insert into public.request_events (request_id, actor_id, type, from_value, to_value)
  values (r.id, auth.uid(), 'status', r.status::text, p_to::text);

  return p_to;
end;
$$;
