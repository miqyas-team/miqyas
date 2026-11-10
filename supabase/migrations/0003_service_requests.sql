-- ============================================================
-- مقياس — الأمر 4: طلب خدمات GIS
-- أنواع الخدمات، الطلبات ومراحلها، الملفات، المحادثة، سجل الأحداث
-- ============================================================

create type public.service_pricing as enum ('fixed', 'custom');
create type public.request_status  as enum ('new', 'quoting', 'awaiting_payment', 'in_progress', 'review', 'completed', 'cancelled');
create type public.request_file_kind as enum ('input', 'deliverable');

-- ------------------------------------------------------------
-- أنواع الخدمات
-- ------------------------------------------------------------
create table public.service_types (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar           text not null,
  name_en           text not null,
  description_ar    text,
  description_en    text,
  icon              text not null default 'Map',
  pricing           public.service_pricing not null default 'custom',
  price             numeric(10, 2) check (price is null or price >= 0),   -- للخدمات بسعر ثابت
  unit_ar           text,   -- مثل «للساعة»
  unit_en           text,
  requires_location boolean not null default false,
  is_academic       boolean not null default false,   -- يتطلب تعهد «مساعدة لا تنفيذ نيابة»
  is_active         boolean not null default true,
  position          int not null default 0,
  check (pricing = 'custom' or price is not null)
);

insert into public.service_types (slug, name_ar, name_en, description_ar, description_en, icon, pricing, price, unit_ar, unit_en, requires_location, is_academic, position) values
  ('graduation-guidance', 'توجيه مشاريع التخرج', 'Graduation project guidance',
   'نساعدك في اختيار المنهجية والأدوات، ونراجع خرائطك وتحليلاتك قبل التسليم.', 'We help you choose the method and tools, and review your maps and analysis before submission.',
   'GraduationCap', 'custom', null, null, null, false, true, 1),
  ('consulting', 'استشارة فنية', 'Technical consultation',
   'جلسة مع مختص لحل مشكلة أو مراجعة عملك أو الإجابة عن أسئلتك.', 'A session with a specialist to fix an issue, review your work or answer your questions.',
   'MessagesSquare', 'fixed', 150, 'للساعة', 'per hour', false, false, 2),
  ('mapping', 'رسم الخرائط', 'Mapping',
   'خرائط موضوعية وإخراج كارتوغرافي احترافي جاهز للطباعة والنشر.', 'Thematic maps and professional cartographic layouts.',
   'Map', 'custom', null, null, null, true, false, 3),
  ('spatial-analysis', 'التحليل المكاني', 'Spatial analysis',
   'تحليل الملاءمة والشبكات والكثافة والتغيّر لدعم القرار.', 'Suitability, network, density and change analysis.',
   'Layers', 'custom', null, null, null, true, false, 4),
  ('land-survey', 'الرفع المساحي', 'Land surveying',
   'رفع ميداني ومعالجة بيانات المساحة وإعداد المخططات.', 'Field surveys, data processing and plan preparation.',
   'Ruler', 'custom', null, null, null, true, false, 5),
  ('data-conversion', 'تحويل البيانات', 'Data conversion',
   'من CAD إلى GIS، وإصلاح الإحداثيات، وتنظيف البيانات وتحويل الصيغ.', 'CAD to GIS, coordinate fixes, data cleaning and format conversion.',
   'FileCog', 'fixed', 99, 'للملف', 'per file', false, false, 6);

-- ------------------------------------------------------------
-- الطلبات
-- ------------------------------------------------------------
create table public.service_requests (
  id               uuid primary key default gen_random_uuid(),
  number           bigint generated always as identity (start with 1001) unique,  -- رقم ظاهر للعميل
  client_id        uuid not null references public.profiles (id) on delete cascade,
  service_type_id  uuid not null references public.service_types (id),
  title            text not null check (char_length(title) between 3 and 140),
  description      text not null check (char_length(description) >= 20),
  location_lat     double precision check (location_lat between -90 and 90),
  location_lng     double precision check (location_lng between -180 and 180),
  location_note    text,
  due_date         date,
  price            numeric(10, 2) check (price is null or price >= 0),
  assigned_to      uuid references public.profiles (id) on delete set null,
  status           public.request_status not null default 'new',
  academic_pledge  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index on public.service_requests (client_id, created_at desc);
create index on public.service_requests (assigned_to, status);
create index on public.service_requests (status, created_at);

create table public.request_files (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.service_requests (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  kind        public.request_file_kind not null,
  name        text not null,
  file_path   text not null,   -- داخل حاوية request-files: {request_id}/...
  size_bytes  bigint,
  created_at  timestamptz not null default now()
);

create table public.request_messages (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.service_requests (id) on delete cascade,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 4000),
  is_internal  boolean not null default false,   -- ملاحظة داخلية للفريق فقط
  created_at   timestamptz not null default now()
);
create index on public.request_messages (request_id, created_at);

create table public.request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.service_requests (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  type        text not null,   -- status | price | assign
  from_value  text,
  to_value    text,
  created_at  timestamptz not null default now()
);
create index on public.request_events (request_id, created_at);

-- ------------------------------------------------------------
-- دوال الصلاحيات
-- ------------------------------------------------------------
create or replace function public.is_request_staff(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.service_requests r where r.id = p_request and r.assigned_to = auth.uid())
$$;

create or replace function public.can_access_request(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_request_staff(p_request)
      or exists (select 1 from public.service_requests r where r.id = p_request and r.client_id = auth.uid())
$$;

-- ------------------------------------------------------------
-- عند الإنشاء: الخدمة بسعر ثابت تتخطى التسعير مباشرة إلى «بانتظار الدفع»
-- ------------------------------------------------------------
create or replace function public.prepare_service_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type public.service_types;
begin
  select * into v_type from public.service_types where id = new.service_type_id and is_active;
  if not found then raise exception 'service type not available' using errcode = 'P0001'; end if;
  if v_type.requires_location and (new.location_lat is null or new.location_lng is null) then
    raise exception 'location required' using errcode = 'P0001';
  end if;
  if v_type.is_academic and not new.academic_pledge then
    raise exception 'academic pledge required' using errcode = 'P0001';
  end if;

  new.client_id   := auth.uid();
  new.assigned_to := null;
  if v_type.pricing = 'fixed' then
    new.status := 'awaiting_payment';
    new.price  := v_type.price;
  else
    new.status := 'new';
    new.price  := null;
  end if;
  return new;
end;
$$;

create trigger service_requests_prepare
  before insert on public.service_requests
  for each row execute function public.prepare_service_request();

create or replace function public.log_request_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.request_events (request_id, actor_id, type, to_value) values (new.id, new.client_id, 'status', new.status::text);
  return new;
end;
$$;

create trigger service_requests_log_created
  after insert on public.service_requests
  for each row execute function public.log_request_created();

-- ------------------------------------------------------------
-- انتقال المراحل: القواعد على الخادم حسب الدور
-- ------------------------------------------------------------
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
begin
  select * into r from public.service_requests where id = p_request for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  v_team   := r.assigned_to = auth.uid();
  v_client := r.client_id = auth.uid();

  -- المدير: كل الانتقالات (التسعير يتطلب سعراً)
  if v_admin then
    v_ok := true;
  -- عضو الفريق المسند: يبدأ التنفيذ ويرسل للمراجعة
  elsif v_team then
    v_ok := (r.status = 'in_progress' and p_to = 'review');
  -- العميل: يلغي قبل الدفع، ويقبل التسليم أو يطلب تعديلاً
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

  if p_to = 'review' and not exists (select 1 from public.request_files where request_id = r.id and kind = 'deliverable') then
    raise exception 'deliverable required' using errcode = 'P0001';
  end if;

  update public.service_requests
     set status = p_to,
         price = r.price,
         updated_at = now(),
         completed_at = case when p_to = 'completed' then now() else completed_at end
   where id = r.id;

  insert into public.request_events (request_id, actor_id, type, from_value, to_value)
  values (r.id, auth.uid(), 'status', r.status::text, p_to::text);

  return p_to;
end;
$$;

create or replace function public.assign_request(p_request uuid, p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev uuid;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if p_member is not null and not exists (
    select 1 from public.profiles where id = p_member and role in ('team', 'admin')
  ) then
    raise exception 'not a team member' using errcode = 'P0001';
  end if;
  select assigned_to into v_prev from public.service_requests where id = p_request for update;
  update public.service_requests set assigned_to = p_member, updated_at = now() where id = p_request;
  insert into public.request_events (request_id, actor_id, type, from_value, to_value)
  values (p_request, auth.uid(), 'assign', v_prev::text, p_member::text);
end;
$$;

revoke execute on function public.request_transition(uuid, public.request_status, numeric) from anon;
revoke execute on function public.assign_request(uuid, uuid) from anon;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.service_types    enable row level security;
alter table public.service_requests enable row level security;
alter table public.request_files    enable row level security;
alter table public.request_messages enable row level security;
alter table public.request_events   enable row level security;

create policy "service_types: read active" on public.service_types for select
  using (is_active or public.is_admin());
create policy "service_types: admin write" on public.service_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- الطلب: صاحبه، والعضو المسند، والمدير. الإنشاء للعميل نفسه، والتعديل عبر الدوال.
create policy "requests: read" on public.service_requests for select to authenticated
  using (public.can_access_request(id));
create policy "requests: client insert" on public.service_requests for insert to authenticated
  with check (client_id = auth.uid());
create policy "requests: admin update" on public.service_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- الملفات: العميل يرفع «مدخلات»، والفريق يرفع «تسليمات»
create policy "request_files: read" on public.request_files for select to authenticated
  using (public.can_access_request(request_id));
create policy "request_files: insert" on public.request_files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_access_request(request_id)
    and (
      (kind = 'input' and exists (select 1 from public.service_requests r where r.id = request_id and r.client_id = auth.uid()))
      or (kind = 'deliverable' and public.is_request_staff(request_id))
    )
  );
create policy "request_files: delete own" on public.request_files for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_admin());

-- المحادثة: الملاحظات الداخلية للفريق فقط
create policy "messages: read" on public.request_messages for select to authenticated
  using (public.can_access_request(request_id) and (not is_internal or public.is_request_staff(request_id)));
create policy "messages: send" on public.request_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_request(request_id)
    and (not is_internal or public.is_request_staff(request_id))
    and exists (select 1 from public.service_requests r where r.id = request_id and r.status not in ('completed', 'cancelled'))
  );

create policy "events: read" on public.request_events for select to authenticated
  using (public.can_access_request(request_id));

-- أطراف الطلب يرون أسماء بعضهم (العميل ↔ العضو المسند)
create policy "profiles: request participants" on public.profiles for select to authenticated
  using (exists (
    select 1 from public.service_requests r
    where (r.client_id = profiles.id and r.assigned_to = auth.uid())
       or (r.assigned_to = profiles.id and r.client_id = auth.uid())
  ));

-- ------------------------------------------------------------
-- التخزين: {request_id}/{kind}/...
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('request-files', 'request-files', false, 52428800)   -- 50MB
on conflict (id) do nothing;

create policy "request-files: read" on storage.objects for select to authenticated
  using (bucket_id = 'request-files' and public.can_access_request(((storage.foldername(name))[1])::uuid));
create policy "request-files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'request-files' and public.can_access_request(((storage.foldername(name))[1])::uuid));
create policy "request-files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'request-files' and (owner = auth.uid() or public.is_admin()));
