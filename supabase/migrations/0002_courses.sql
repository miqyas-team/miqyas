-- ============================================================
-- مقياس — الأمر 3: نظام الدورات
-- دورات ← وحدات ← دروس (فيديو + مرفقات + اختبار/تمرين)
-- اشتراكات، تقدّم، دفعات مباشرة، قائمة انتظار، شهادات
-- ============================================================

create type public.course_level      as enum ('beginner', 'intermediate', 'advanced');
create type public.course_format     as enum ('recorded', 'live');
create type public.enrollment_status as enum ('pending_payment', 'active', 'completed', 'cancelled');
create type public.question_kind     as enum ('mcq', 'true_false');
create type public.submission_status as enum ('submitted', 'approved', 'needs_revision', 'rejected');
create type public.cohort_status     as enum ('open', 'full', 'running', 'finished');

-- ------------------------------------------------------------
-- الجداول
-- ------------------------------------------------------------
create table public.courses (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_ar        text not null,
  title_en        text not null,
  summary_ar      text,
  summary_en      text,
  description_ar  text,
  description_en  text,
  outcomes_ar     text[] not null default '{}',   -- محاور الدورة / ماذا ستتعلم
  outcomes_en     text[] not null default '{}',
  level           public.course_level not null,
  format          public.course_format not null default 'recorded',
  software        text[] not null default '{}',
  price           numeric(10, 2) not null default 0 check (price >= 0),
  hours           numeric(5, 1),
  cover_url       text,
  tone            text not null default 'primary',
  instructor_id   uuid references public.profiles (id) on delete set null,  -- للصلاحيات
  instructor_name_ar text,   -- للعرض العام (الملفات الشخصية غير عامة)
  instructor_name_en text,
  instructor_bio_ar  text,
  instructor_bio_en  text,
  pass_score      int not null default 70 check (pass_score between 0 and 100),
  is_featured     boolean not null default false,
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title_ar   text not null,
  title_en   text not null,
  position   int not null default 0
);
create index on public.modules (course_id, position);

-- مخطط الدرس (عام لزوار الدورة المنشورة)
create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.modules (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  title_ar      text not null,
  title_en      text not null,
  duration_min  int,
  position      int not null default 0,
  is_preview    boolean not null default false,   -- درس مجاني للمعاينة
  has_quiz      boolean not null default false,
  has_assignment boolean not null default false
);
create index on public.lessons (course_id, position);

-- محتوى الدرس (للمشتركين فقط)
create table public.lesson_content (
  lesson_id        uuid primary key references public.lessons (id) on delete cascade,
  youtube_id       text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  body_ar          text,
  body_en          text,
  assignment_ar    text,   -- نص التمرين العملي
  assignment_en    text
);

create table public.lesson_attachments (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  name       text not null,
  file_path  text not null,   -- داخل حاوية course-files: {course_id}/...
  size_bytes bigint
);

create table public.quiz_questions (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  kind       public.question_kind not null default 'mcq',
  prompt_ar  text not null,
  prompt_en  text not null,
  options    jsonb not null,   -- [{ "ar": "...", "en": "..." }, ...]
  position   int not null default 0
);

-- مفاتيح الإجابات منفصلة: لا يراها المتدرب أبداً
create table public.quiz_answer_keys (
  question_id   uuid primary key references public.quiz_questions (id) on delete cascade,
  correct_index int not null check (correct_index >= 0)
);

create table public.quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  score       int not null,
  passed      boolean not null,
  answers     jsonb not null,
  created_at  timestamptz not null default now()
);
create index on public.quiz_attempts (user_id, lesson_id);

create table public.assignment_submissions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  file_path    text not null,   -- داخل حاوية submissions: {user_id}/...
  file_name    text not null,
  note         text,
  status       public.submission_status not null default 'submitted',
  grade        int check (grade between 0 and 100),
  feedback     text,
  reviewed_by  uuid references public.profiles (id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.assignment_submissions (status, created_at);

create table public.cohorts (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  name_ar    text not null,
  name_en    text not null,
  starts_on  date not null,
  ends_on    date,
  seats      int not null check (seats > 0),
  status     public.cohort_status not null default 'open'
);

create table public.live_sessions (
  id                   uuid primary key default gen_random_uuid(),
  cohort_id            uuid not null references public.cohorts (id) on delete cascade,
  title_ar             text not null,
  title_en             text not null,
  starts_at            timestamptz not null,
  duration_min         int not null default 90,
  meeting_url          text,   -- رابط Zoom/Meet — للمسجّلين فقط
  recording_youtube_id text
);

create table public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  cohort_id     uuid references public.cohorts (id) on delete set null,
  status        public.enrollment_status not null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  unique (user_id, course_id)
);

create table public.lesson_progress (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  completed_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.waitlist (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  course_id   uuid not null references public.courses (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table public.certificates (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  course_id        uuid not null references public.courses (id) on delete cascade,
  full_name        text not null,     -- نسخة ثابتة وقت الإصدار
  course_title_ar  text not null,
  course_title_en  text not null,
  hours            numeric(5, 1),
  issued_at        timestamptz not null default now(),
  unique (user_id, course_id)
);

-- ------------------------------------------------------------
-- دوال الصلاحيات
-- ------------------------------------------------------------
create or replace function public.is_course_staff(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.courses c where c.id = p_course and c.instructor_id = auth.uid())
$$;

create or replace function public.is_enrolled(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.course_id = p_course and e.user_id = auth.uid() and e.status in ('active', 'completed')
  )
$$;

create or replace function public.can_view_lesson(p_lesson uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lessons l
    where l.id = p_lesson
      and (l.is_preview or public.is_enrolled(l.course_id) or public.is_course_staff(l.course_id))
  )
$$;

create or replace function public.course_is_public(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses where id = p_course and is_published)
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.courses               enable row level security;
alter table public.modules               enable row level security;
alter table public.lessons               enable row level security;
alter table public.lesson_content        enable row level security;
alter table public.lesson_attachments    enable row level security;
alter table public.quiz_questions        enable row level security;
alter table public.quiz_answer_keys      enable row level security;
alter table public.quiz_attempts         enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.cohorts               enable row level security;
alter table public.live_sessions         enable row level security;
alter table public.enrollments           enable row level security;
alter table public.lesson_progress       enable row level security;
alter table public.waitlist              enable row level security;
alter table public.certificates          enable row level security;

-- الدورات: المنشورة للجميع، وغير المنشورة للمدير ومدرّبها
create policy "courses: read" on public.courses for select
  using (is_published or public.is_course_staff(id));
create policy "courses: admin insert" on public.courses for insert to authenticated
  with check (public.is_admin());
create policy "courses: staff update" on public.courses for update to authenticated
  using (public.is_course_staff(id)) with check (public.is_course_staff(id));
create policy "courses: admin delete" on public.courses for delete to authenticated
  using (public.is_admin());

-- المخطط (وحدات ودروس ودفعات): عام إذا كانت الدورة منشورة
create policy "modules: read" on public.modules for select
  using (public.course_is_public(course_id) or public.is_course_staff(course_id));
create policy "modules: staff write" on public.modules for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy "lessons: read" on public.lessons for select
  using (public.course_is_public(course_id) or public.is_course_staff(course_id));
create policy "lessons: staff write" on public.lessons for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy "cohorts: read" on public.cohorts for select
  using (public.course_is_public(course_id) or public.is_course_staff(course_id));
create policy "cohorts: staff write" on public.cohorts for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- المحتوى: للمشتركين (أو الدرس المجاني) والطاقم
create policy "lesson_content: read" on public.lesson_content for select
  using (public.can_view_lesson(lesson_id));
create policy "lesson_content: staff write" on public.lesson_content for all to authenticated
  using (public.is_course_staff((select course_id from public.lessons where id = lesson_id)))
  with check (public.is_course_staff((select course_id from public.lessons where id = lesson_id)));

create policy "attachments: read" on public.lesson_attachments for select
  using (public.can_view_lesson(lesson_id));
create policy "attachments: staff write" on public.lesson_attachments for all to authenticated
  using (public.is_course_staff((select course_id from public.lessons where id = lesson_id)))
  with check (public.is_course_staff((select course_id from public.lessons where id = lesson_id)));

create policy "questions: read" on public.quiz_questions for select
  using (public.can_view_lesson(lesson_id));
create policy "questions: staff write" on public.quiz_questions for all to authenticated
  using (public.is_course_staff((select course_id from public.lessons where id = lesson_id)))
  with check (public.is_course_staff((select course_id from public.lessons where id = lesson_id)));

-- مفاتيح الإجابات: للطاقم فقط
create policy "answer_keys: staff" on public.quiz_answer_keys for all to authenticated
  using (public.is_course_staff((select l.course_id from public.quiz_questions q join public.lessons l on l.id = q.lesson_id where q.id = question_id)))
  with check (public.is_course_staff((select l.course_id from public.quiz_questions q join public.lessons l on l.id = q.lesson_id where q.id = question_id)));

-- الجلسات المباشرة (فيها رابط الاجتماع): للمسجّلين في الدفعة والطاقم
create policy "live_sessions: read" on public.live_sessions for select to authenticated
  using (exists (
    select 1 from public.cohorts c
    where c.id = cohort_id
      and (public.is_course_staff(c.course_id)
           or exists (select 1 from public.enrollments e
                      where e.cohort_id = c.id and e.user_id = auth.uid() and e.status in ('active', 'completed')))
  ));
create policy "live_sessions: staff write" on public.live_sessions for all to authenticated
  using (public.is_course_staff((select course_id from public.cohorts where id = cohort_id)))
  with check (public.is_course_staff((select course_id from public.cohorts where id = cohort_id)));

-- الاشتراكات: تُنشأ عبر الدالة enroll() فقط
create policy "enrollments: read" on public.enrollments for select to authenticated
  using (user_id = auth.uid() or public.is_course_staff(course_id));
create policy "enrollments: staff update" on public.enrollments for update to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- التقدّم: المتدرب المشترك يسجّل تقدّمه
create policy "progress: read" on public.lesson_progress for select to authenticated
  using (user_id = auth.uid() or public.is_course_staff(course_id));
create policy "progress: insert own" on public.lesson_progress for insert to authenticated
  with check (user_id = auth.uid() and public.is_enrolled(course_id)
              and course_id = (select l.course_id from public.lessons l where l.id = lesson_id));
create policy "progress: delete own" on public.lesson_progress for delete to authenticated
  using (user_id = auth.uid());

-- محاولات الاختبار: تُنشأ عبر submit_quiz() فقط
create policy "attempts: read" on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid()
         or public.is_course_staff((select course_id from public.lessons where id = lesson_id)));

-- التمارين: المتدرب يرفع، والطاقم يصحّح
create policy "submissions: read" on public.assignment_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_course_staff(course_id));
create policy "submissions: insert own" on public.assignment_submissions for insert to authenticated
  with check (user_id = auth.uid() and status = 'submitted' and public.is_enrolled(course_id)
              and course_id = (select l.course_id from public.lessons l where l.id = lesson_id and l.has_assignment));
create policy "submissions: staff grade" on public.assignment_submissions for update to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- قائمة الانتظار
create policy "waitlist: read" on public.waitlist for select to authenticated
  using (user_id = auth.uid() or public.is_course_staff(course_id));
create policy "waitlist: insert own" on public.waitlist for insert to authenticated
  with check (user_id = auth.uid() and public.course_is_public(course_id));
create policy "waitlist: delete own" on public.waitlist for delete to authenticated
  using (user_id = auth.uid() or public.is_course_staff(course_id));

-- الشهادات: صاحبها والطاقم؛ التحقق العام عبر verify_certificate()
create policy "certificates: read" on public.certificates for select to authenticated
  using (user_id = auth.uid() or public.is_course_staff(course_id));

-- ------------------------------------------------------------
-- الدوال التشغيلية
-- ------------------------------------------------------------

-- الاشتراك: المجانية تُفعَّل فوراً، والمدفوعة بانتظار الدفع؛ والمباشرة تحتاج دفعة بمقاعد متاحة
create or replace function public.enroll(p_course uuid, p_cohort uuid default null)
returns public.enrollment_status
language plpgsql security definer set search_path = public as $$
declare
  v_course  public.courses;
  v_cohort  public.cohorts;
  v_taken   int;
  v_status  public.enrollment_status;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into v_course from public.courses where id = p_course and is_published;
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;

  if v_course.format = 'live' then
    select * into v_cohort from public.cohorts where id = p_cohort and course_id = p_course for update;
    if not found or v_cohort.status <> 'open' then raise exception 'cohort not open' using errcode = 'P0001'; end if;
    select count(*) into v_taken from public.enrollments
      where cohort_id = v_cohort.id and status in ('pending_payment', 'active', 'completed');
    if v_taken >= v_cohort.seats then raise exception 'cohort full' using errcode = 'P0001'; end if;
  end if;

  v_status := case when v_course.price = 0 then 'active' else 'pending_payment' end;

  insert into public.enrollments (user_id, course_id, cohort_id, status)
  values (auth.uid(), p_course, v_cohort.id, v_status)
  on conflict (user_id, course_id) do update
    set status = case when public.enrollments.status = 'cancelled' then excluded.status else public.enrollments.status end,
        cohort_id = coalesce(excluded.cohort_id, public.enrollments.cohort_id)
  returning status into v_status;

  delete from public.waitlist where user_id = auth.uid() and course_id = p_course;
  return v_status;
end;
$$;

-- تصحيح الاختبار على الخادم: الإجابات الصحيحة لا تصل للمتصفح
create or replace function public.submit_quiz(p_lesson uuid, p_answers int[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_course   uuid;
  v_pass     int;
  v_total    int := 0;
  v_correct  int := 0;
  v_results  boolean[] := '{}';
  v_score    int;
  r          record;
begin
  select l.course_id, c.pass_score into v_course, v_pass
    from public.lessons l join public.courses c on c.id = l.course_id
    where l.id = p_lesson and l.has_quiz;
  if not found then raise exception 'quiz not found' using errcode = 'P0002'; end if;
  if not public.is_enrolled(v_course) then raise exception 'not enrolled' using errcode = '42501'; end if;

  for r in
    select q.position, k.correct_index
    from public.quiz_questions q join public.quiz_answer_keys k on k.question_id = q.id
    where q.lesson_id = p_lesson
    order by q.position, q.id
  loop
    v_total := v_total + 1;
    if p_answers[v_total] is not null and p_answers[v_total] = r.correct_index then
      v_correct := v_correct + 1;
      v_results := v_results || true;
    else
      v_results := v_results || false;
    end if;
  end loop;

  if v_total = 0 then raise exception 'quiz has no questions' using errcode = 'P0001'; end if;
  v_score := round(100.0 * v_correct / v_total);

  insert into public.quiz_attempts (user_id, lesson_id, score, passed, answers)
  values (auth.uid(), p_lesson, v_score, v_score >= v_pass, to_jsonb(p_answers));

  return jsonb_build_object('score', v_score, 'passed', v_score >= v_pass, 'results', to_jsonb(v_results), 'pass_score', v_pass);
end;
$$;

-- حالة المتطلبات: الدروس + الاختبارات + التمارين
create or replace function public.course_requirements(p_course uuid, p_user uuid default auth.uid())
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'lessons_total',     (select count(*) from public.lessons where course_id = p_course),
    'lessons_done',      (select count(*) from public.lesson_progress where course_id = p_course and user_id = p_user),
    'quizzes_total',     (select count(*) from public.lessons where course_id = p_course and has_quiz),
    'quizzes_passed',    (select count(distinct a.lesson_id) from public.quiz_attempts a
                            join public.lessons l on l.id = a.lesson_id
                            where l.course_id = p_course and a.user_id = p_user and a.passed),
    'assignments_total', (select count(*) from public.lessons where course_id = p_course and has_assignment),
    'assignments_ok',    (select count(distinct s.lesson_id) from public.assignment_submissions s
                            where s.course_id = p_course and s.user_id = p_user and s.status = 'approved')
  )
  where p_user = auth.uid() or public.is_course_staff(p_course)
$$;

-- إصدار الشهادة بعد التحقق من كل المتطلبات
create or replace function public.claim_certificate(p_course uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  req     jsonb;
  v_code  text;
  v_c     public.courses;
  v_name  text;
begin
  if not public.is_enrolled(p_course) then raise exception 'not enrolled' using errcode = '42501'; end if;

  select code into v_code from public.certificates where user_id = auth.uid() and course_id = p_course;
  if found then return v_code; end if;

  req := public.course_requirements(p_course);
  if (req ->> 'lessons_done')::int     < (req ->> 'lessons_total')::int
  or (req ->> 'quizzes_passed')::int   < (req ->> 'quizzes_total')::int
  or (req ->> 'assignments_ok')::int   < (req ->> 'assignments_total')::int
  or (req ->> 'lessons_total')::int = 0 then
    raise exception 'requirements not met' using errcode = 'P0001';
  end if;

  select * into v_c from public.courses where id = p_course;
  select full_name into v_name from public.profiles where id = auth.uid();

  insert into public.certificates (user_id, course_id, full_name, course_title_ar, course_title_en, hours)
  values (auth.uid(), p_course, v_name, v_c.title_ar, v_c.title_en, v_c.hours)
  returning code into v_code;

  update public.enrollments set status = 'completed', completed_at = now()
    where user_id = auth.uid() and course_id = p_course;

  return v_code;
end;
$$;

-- التحقق العام من الشهادة (للزوار وجهات التوظيف)
create or replace function public.verify_certificate(p_code text)
returns table (full_name text, course_title_ar text, course_title_en text, hours numeric, issued_at timestamptz)
language sql stable security definer set search_path = public as $$
  select full_name, course_title_ar, course_title_en, hours, issued_at
  from public.certificates where code = upper(trim(p_code))
$$;

-- المقاعد المتبقية في كل دفعة (الاشتراكات نفسها غير عامة)
create or replace function public.cohort_availability(p_course uuid)
returns table (cohort_id uuid, seats_left int)
language sql stable security definer set search_path = public as $$
  select c.id,
         greatest(c.seats - (select count(*) from public.enrollments e
                             where e.cohort_id = c.id and e.status in ('pending_payment', 'active', 'completed'))::int, 0)
  from public.cohorts c
  where c.course_id = p_course and public.course_is_public(p_course)
$$;

grant execute on function public.verify_certificate(text) to anon, authenticated;
grant execute on function public.cohort_availability(uuid) to anon, authenticated;
revoke execute on function public.enroll(uuid, uuid)            from anon;
revoke execute on function public.submit_quiz(uuid, int[])      from anon;
revoke execute on function public.claim_certificate(uuid)       from anon;

-- ------------------------------------------------------------
-- التخزين
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('course-files', 'course-files', false),
  ('submissions',  'submissions',  false)
on conflict (id) do nothing;

-- مرفقات الدروس: المسار {course_id}/... — للمشتركين والطاقم
create policy "course-files: read enrolled" on storage.objects for select to authenticated
  using (bucket_id = 'course-files'
         and (public.is_enrolled(((storage.foldername(name))[1])::uuid)
              or public.is_course_staff(((storage.foldername(name))[1])::uuid)));
create policy "course-files: staff write" on storage.objects for all to authenticated
  using (bucket_id = 'course-files' and public.is_course_staff(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'course-files' and public.is_course_staff(((storage.foldername(name))[1])::uuid));

-- التمارين: المسار {user_id}/... — صاحبها يرفع ويقرأ، والطاقم يقرأ
create policy "submissions: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "submissions: read own or staff" on storage.objects for select to authenticated
  using (bucket_id = 'submissions'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.has_role(array['admin', 'instructor', 'team']::public.app_role[])));
