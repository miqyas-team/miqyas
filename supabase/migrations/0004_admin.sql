-- ============================================================
-- مقياس — الأمر 6: لوحة الإدارة ومركز الطلبات
-- إحصائيات، تصحيح التمارين، رؤية المدرّب لمتدرّبيه
-- ============================================================

-- المدرّب يرى أسماء المشتركين في دوراته (لتصحيح تمارينهم)
create policy "profiles: course staff read students" on public.profiles for select to authenticated
  using (exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.user_id = profiles.id and c.instructor_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- تصحيح تمرين: المدير أو مدرّب الدورة فقط
-- ------------------------------------------------------------
create or replace function public.grade_submission(
  p_submission uuid,
  p_status     public.submission_status,
  p_grade      int default null,
  p_feedback   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_course uuid;
begin
  select course_id into v_course from public.assignment_submissions where id = p_submission for update;
  if not found then raise exception 'submission not found' using errcode = 'P0002'; end if;
  if not public.is_course_staff(v_course) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status = 'submitted' then raise exception 'invalid status' using errcode = 'P0001'; end if;
  if p_grade is not null and (p_grade < 0 or p_grade > 100) then raise exception 'invalid grade' using errcode = 'P0001'; end if;

  update public.assignment_submissions
     set status = p_status,
         grade = p_grade,
         feedback = nullif(trim(p_feedback), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission;
end;
$$;

revoke execute on function public.grade_submission(uuid, public.submission_status, int, text) from anon;

-- ------------------------------------------------------------
-- إحصائيات لوحة المدير (للمدير فقط)
-- الإيراد تقديري حتى ربط سجل المدفوعات (الأمر 7):
--   الدورات = سعر كل اشتراك مفعّل في شهر إنشائه
--   الخدمات = سعر كل طلب في شهر انتقاله إلى «قيد التنفيذ» (تأكيد الدفع)
-- ------------------------------------------------------------
create or replace function public.admin_stats(p_months int default 6)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start date := (date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1))::date;
  result  jsonb;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;

  with months as (
    select generate_series(v_start, date_trunc('month', now())::date, interval '1 month')::date as m
  ),
  course_rev as (
    select date_trunc('month', e.created_at)::date as m, sum(c.price) as amount
    from public.enrollments e join public.courses c on c.id = e.course_id
    where e.status in ('active', 'completed') and c.price > 0 and e.created_at >= v_start
    group by 1
  ),
  paid_requests as (
    select distinct on (ev.request_id) ev.request_id, date_trunc('month', ev.created_at)::date as m
    from public.request_events ev
    where ev.type = 'status' and ev.to_value = 'in_progress'
    order by ev.request_id, ev.created_at
  ),
  service_rev as (
    select p.m, sum(r.price) as amount
    from paid_requests p join public.service_requests r on r.id = p.request_id
    where p.m >= v_start and r.status <> 'cancelled' and r.price is not null
    group by 1
  )
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total',   (select count(*) from public.profiles),
      'new30',   (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
      'by_role', (select coalesce(jsonb_object_agg(role, n), '{}') from (select role, count(*) n from public.profiles group by role) x)
    ),
    'enrollments', jsonb_build_object(
      'total',     (select count(*) from public.enrollments where status <> 'cancelled'),
      'active',    (select count(*) from public.enrollments where status = 'active'),
      'completed', (select count(*) from public.enrollments where status = 'completed'),
      'pending',   (select count(*) from public.enrollments where status = 'pending_payment'),
      'new30',     (select count(*) from public.enrollments where created_at >= now() - interval '30 days' and status <> 'cancelled')
    ),
    'certificates', (select count(*) from public.certificates),
    'requests', jsonb_build_object(
      'by_status',  (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.service_requests group by status) x),
      'unassigned', (select count(*) from public.service_requests where assigned_to is null and status not in ('completed', 'cancelled')),
      'overdue',    (select count(*) from public.service_requests where due_date < current_date and status not in ('completed', 'cancelled'))
    ),
    'pending_grading', (select count(*) from public.assignment_submissions where status = 'submitted'),
    'revenue', (
      select jsonb_agg(jsonb_build_object(
               'month', to_char(months.m, 'YYYY-MM'),
               'courses', coalesce(cr.amount, 0),
               'services', coalesce(sr.amount, 0)) order by months.m)
      from months
      left join course_rev cr on cr.m = months.m
      left join service_rev sr on sr.m = months.m
    ),
    'top_courses', (
      select coalesce(jsonb_agg(x order by x.enrollments desc), '[]')
      from (
        select c.title_ar, c.title_en, count(e.*) as enrollments
        from public.courses c left join public.enrollments e on e.course_id = c.id and e.status <> 'cancelled'
        group by c.id order by count(e.*) desc limit 5
      ) x
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_stats(int) from anon;
