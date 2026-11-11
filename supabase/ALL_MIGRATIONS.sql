-- مقياس — كل ملفات قاعدة البيانات بالترتيب (0001 → 0009)
-- الصقه كاملاً في Supabase > SQL Editor ثم Run، مرة واحدة فقط على مشروع جديد.
-- مُختبَر محلياً: npm run db:test

-- ════════ 0001_profiles_and_roles.sql ════════
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


-- ════════ 0002_courses.sql ════════
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


-- ════════ 0003_service_requests.sql ════════
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
-- الأعمدة مباشرة (لا can_access_request): الدالة لا ترى الصف أثناء insert ... returning
create policy "requests: read" on public.service_requests for select to authenticated
  using (client_id = auth.uid() or assigned_to = auth.uid() or public.is_admin());
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


-- ════════ 0004_admin.sql ════════
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


-- ════════ 0005_community_jobs.sql ════════
-- ============================================================
-- مقياس — المجتمع (منتدى) + فرص التوظيف والتدريب التعاوني
-- ============================================================

-- ------------------------------------------------------------
-- المنتدى: نشر فوري، بلاغات، والمدير يخفي/يقفل
-- ------------------------------------------------------------
create table public.forum_threads (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.profiles (id) on delete cascade,
  author_name      text not null default '',          -- نسخة للعرض العام (الملفات الشخصية غير عامة)
  author_role      public.app_role not null default 'user',
  title            text not null check (char_length(title) between 5 and 160),
  body             text not null check (char_length(body) between 10 and 10000),
  reply_count      int not null default 0,
  is_hidden        boolean not null default false,
  is_locked        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index on public.forum_threads (last_activity_at desc) where not is_hidden;

create table public.forum_replies (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.forum_threads (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  author_name  text not null default '',
  author_role  public.app_role not null default 'user',
  body         text not null check (char_length(body) between 2 and 10000),
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.forum_replies (thread_id, created_at);

create table public.forum_attachments (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.forum_threads (id) on delete cascade,
  reply_id    uuid references public.forum_replies (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  file_path   text not null,     -- داخل حاوية forum-files: {uploader_id}/...
  size_bytes  bigint,
  is_image    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.forum_reports (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.forum_threads (id) on delete cascade,
  reply_id     uuid references public.forum_replies (id) on delete cascade,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (char_length(reason) between 3 and 500),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);
create unique index forum_reports_once on public.forum_reports (reporter_id, thread_id, coalesce(reply_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- اسم الكاتب ودوره يُثبَّتان من الملف الشخصي (لا يُقبلان من المتصفح)
create or replace function public.forum_stamp_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select full_name, role into new.author_name, new.author_role from public.profiles where id = auth.uid();
  new.author_id := auth.uid();
  new.is_hidden := false;
  if tg_table_name = 'forum_threads' then
    new.reply_count := 0;
    new.is_locked := false;
  end if;
  return new;
end;
$$;

create trigger forum_threads_stamp before insert on public.forum_threads for each row execute function public.forum_stamp_author();
create trigger forum_replies_stamp before insert on public.forum_replies for each row execute function public.forum_stamp_author();

-- عدد الردود وآخر نشاط
create or replace function public.forum_reply_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_threads set reply_count = reply_count + 1, last_activity_at = now() where id = new.thread_id;
  elsif tg_op = 'DELETE' then
    update public.forum_threads set reply_count = greatest(reply_count - 1, 0) where id = old.thread_id;
  end if;
  return null;
end;
$$;

create trigger forum_replies_count after insert or delete on public.forum_replies for each row execute function public.forum_reply_counter();

-- يمنع غير المدير من تعديل حقول الإشراف أو الكاتب
create or replace function public.forum_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- تحديثات النظام من trigger آخر (عدّاد الردود) لا تخضع للحماية
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if not public.is_admin() then
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.author_role := old.author_role;
    new.is_hidden := old.is_hidden;
    if tg_table_name = 'forum_threads' then
      new.is_locked := old.is_locked;
      new.reply_count := old.reply_count;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger forum_threads_protect before update on public.forum_threads for each row execute function public.forum_protect_columns();
create trigger forum_replies_protect before update on public.forum_replies for each row execute function public.forum_protect_columns();

alter table public.forum_threads     enable row level security;
alter table public.forum_replies     enable row level security;
alter table public.forum_attachments enable row level security;
alter table public.forum_reports     enable row level security;

-- القراءة عامة (حتى للزوار) لغير المخفي
create policy "threads: read" on public.forum_threads for select
  using (not is_hidden or author_id = auth.uid() or public.is_admin());
create policy "threads: create" on public.forum_threads for insert to authenticated
  with check (author_id = auth.uid());
create policy "threads: edit own or admin" on public.forum_threads for update to authenticated
  using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy "threads: delete own or admin" on public.forum_threads for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "replies: read" on public.forum_replies for select
  using ((not is_hidden or author_id = auth.uid() or public.is_admin())
         and exists (select 1 from public.forum_threads t where t.id = thread_id and (not t.is_hidden or public.is_admin())));
create policy "replies: create" on public.forum_replies for insert to authenticated
  with check (author_id = auth.uid()
              and exists (select 1 from public.forum_threads t where t.id = thread_id and not t.is_hidden and not t.is_locked));
create policy "replies: edit own or admin" on public.forum_replies for update to authenticated
  using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy "replies: delete own or admin" on public.forum_replies for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "attachments: read" on public.forum_attachments for select
  using (exists (select 1 from public.forum_threads t where t.id = thread_id and (not t.is_hidden or public.is_admin())));
create policy "attachments: add own" on public.forum_attachments for insert to authenticated
  with check (uploader_id = auth.uid());
create policy "attachments: delete own or admin" on public.forum_attachments for delete to authenticated
  using (uploader_id = auth.uid() or public.is_admin());

create policy "reports: create" on public.forum_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "reports: admin" on public.forum_reports for select to authenticated
  using (public.is_admin());
create policy "reports: admin resolve" on public.forum_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- مرفقات المنتدى عامة للقراءة (صور الأسئلة)، والرفع في مجلد المستخدم فقط
insert into storage.buckets (id, name, public, file_size_limit)
values ('forum-files', 'forum-files', true, 10485760)   -- 10MB
on conflict (id) do nothing;

create policy "forum-files: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'forum-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "forum-files: delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'forum-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ------------------------------------------------------------
-- فرص التوظيف والتدريب التعاوني (ينشرها فريق مقياس فقط)
-- التقديم عبر رابط أو بريد الجهة — لا نخزّن سيراً ذاتية
-- ------------------------------------------------------------
create type public.job_kind as enum ('job', 'coop');
create type public.work_mode as enum ('onsite', 'remote', 'hybrid');

create table public.job_posts (
  id            uuid primary key default gen_random_uuid(),
  kind          public.job_kind not null,
  title         text not null check (char_length(title) between 3 and 160),
  organization  text not null,
  city          text,
  work_mode     public.work_mode not null default 'onsite',
  description   text not null,
  requirements  text,
  majors        text[] not null default '{}',     -- التخصصات المستهدفة
  apply_url     text check (apply_url is null or apply_url ~* '^(https?://|mailto:)'),
  deadline      date,
  is_published  boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.job_posts (kind, created_at desc) where is_published;

alter table public.job_posts enable row level security;

create policy "jobs: read published" on public.job_posts for select
  using (is_published or public.is_admin());
create policy "jobs: admin write" on public.job_posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ════════ 0006_software.sql ════════
-- ============================================================
-- مقياس — البرامج والأدوات، وبيانات التدريب
-- روابط التحميل الرسمية فقط؛ لا تُرفع ملفات البرامج على المنصة
-- ============================================================

create type public.software_category as enum ('desktop', 'web', 'library', 'survey', 'remote_sensing');
create type public.software_license  as enum ('free', 'trial', 'student', 'paid');

create table public.software (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null,
  category       public.software_category not null,
  license        public.software_license not null,
  os             text[] not null default '{}',          -- windows | mac | linux | web
  description_ar text not null,
  description_en text not null,
  install_ar     text,                                   -- خطوات التثبيت، خطوة في كل سطر
  install_en     text,
  download_url   text not null check (download_url ~* '^https://'),
  course_slugs   text[] not null default '{}',           -- دورات مرتبطة
  position       int not null default 0,
  is_published   boolean not null default true,
  updated_at     timestamptz not null default now()
);

create table public.datasets (
  id             uuid primary key default gen_random_uuid(),
  title_ar       text not null,
  title_en       text not null,
  description_ar text,
  description_en text,
  region         text,                                   -- المدينة/المنطقة
  format         text not null,                          -- GeoJSON, Shapefile, GeoTIFF…
  license        text,                                   -- مثل CC BY 4.0
  file_path      text,                                   -- داخل حاوية datasets (عامة)
  external_url   text check (external_url is null or external_url ~* '^https://'),
  size_bytes     bigint,
  is_published   boolean not null default true,
  created_at     timestamptz not null default now(),
  check (file_path is not null or external_url is not null)
);

alter table public.software enable row level security;
alter table public.datasets enable row level security;

create policy "software: read" on public.software for select using (is_published or public.is_admin());
create policy "software: admin" on public.software for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "datasets: read" on public.datasets for select using (is_published or public.is_admin());
create policy "datasets: admin" on public.datasets for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('datasets', 'datasets', true, 104857600)   -- 100MB
on conflict (id) do nothing;

create policy "datasets-bucket: admin write" on storage.objects for all to authenticated
  using (bucket_id = 'datasets' and public.is_admin())
  with check (bucket_id = 'datasets' and public.is_admin());

-- البرامج الأساسية (يعدّلها المدير لاحقاً من لوحة الإدارة)
insert into public.software (slug, name, category, license, os, description_ar, description_en, install_ar, install_en, download_url, course_slugs, position) values
 ('qgis', 'QGIS', 'desktop', 'free', '{windows,mac,linux}',
  'برنامج GIS مجاني ومفتوح المصدر، يكفي لمعظم أعمال الخرائط والتحليل المكاني.',
  'Free, open-source desktop GIS that covers most mapping and spatial analysis work.',
  E'ادخل صفحة التحميل الرسمية واختر نظام تشغيلك.\nحمّل إصدار LTR (طويل الدعم) فهو الأكثر استقراراً.\nشغّل ملف التثبيت واتبع الخطوات الافتراضية.\nافتح QGIS وغيّر اللغة إن رغبت من Settings ← Options ← General.',
  E'Open the official download page and choose your OS.\nDownload the LTR (long-term release) for stability.\nRun the installer with the default options.\nOpen QGIS; change the language under Settings → Options → General if you like.',
  'https://qgis.org/download/', '{qgis-from-zero,remote-sensing-basics}', 1),
 ('arcgis-pro', 'ArcGIS Pro', 'desktop', 'trial', '{windows}',
  'برنامج Esri الاحترافي للتحليل المكاني وإخراج الخرائط. تتوفر نسخة تجريبية ورخص طلابية عبر الجامعات.',
  'Esri''s professional GIS for spatial analysis and cartography. Free trial; student licenses via universities.',
  E'اسأل جامعتك عن رخصة ArcGIS الطلابية أولاً.\nأو اطلب النسخة التجريبية من صفحة Esri الرسمية.\nسجّل الدخول بحساب ArcGIS ثم حمّل البرنامج.\nيعمل على Windows فقط؛ تحقق من متطلبات الجهاز قبل التثبيت.',
  E'Ask your university about an ArcGIS student license first.\nOr request the free trial from Esri''s official page.\nSign in with an ArcGIS account and download.\nWindows only; check system requirements before installing.',
  'https://www.esri.com/en-us/arcgis/products/arcgis-pro/trial', '{arcgis-pro-spatial-analysis}', 2),
 ('google-earth-pro', 'Google Earth Pro', 'desktop', 'free', '{windows,mac,linux}',
  'استكشاف الصور الفضائية التاريخية، ورسم النقاط والمسارات، وتصدير ملفات KML.',
  'Explore historical imagery, draw placemarks and paths, and export KML files.',
  null, null, 'https://www.google.com/earth/about/versions/', '{}', 3),
 ('grass-gis', 'GRASS GIS', 'desktop', 'free', '{windows,mac,linux}',
  'محرك تحليل مكاني قوي ومفتوح المصدر، ويعمل أيضاً من داخل QGIS.',
  'Powerful open-source spatial analysis engine, also usable inside QGIS.',
  null, null, 'https://grass.osgeo.org/download/', '{}', 4),
 ('snap', 'SNAP (ESA)', 'remote_sensing', 'free', '{windows,mac,linux}',
  'أداة وكالة الفضاء الأوروبية لمعالجة صور Sentinel وتحليلها.',
  'ESA''s toolbox for processing and analyzing Sentinel imagery.',
  null, null, 'https://step.esa.int/main/download/snap-download/', '{remote-sensing-basics}', 5),
 ('google-earth-engine', 'Google Earth Engine', 'web', 'free', '{web}',
  'منصة سحابية لتحليل الصور الفضائية بكميات ضخمة. مجانية للأغراض البحثية وغير التجارية.',
  'Cloud platform for large-scale satellite imagery analysis. Free for research and non-commercial use.',
  null, null, 'https://earthengine.google.com/', '{remote-sensing-basics}', 6),
 ('python', 'Python', 'library', 'free', '{windows,mac,linux}',
  'لغة البرمجة الأشهر في GIS مع مكتبات GeoPandas وShapely وRasterio.',
  'The most popular language for GIS, with GeoPandas, Shapely and Rasterio.',
  E'حمّل Python من الموقع الرسمي (أو استخدم Miniforge لإدارة البيئات).\nفعّل خيار Add Python to PATH أثناء التثبيت على Windows.\nثبّت المكتبات: pip install geopandas rasterio\nجرّب في الطرفية: python -c "import geopandas"',
  E'Download Python from the official site (or use Miniforge for environments).\nTick "Add Python to PATH" during setup on Windows.\nInstall libraries: pip install geopandas rasterio\nTest in a terminal: python -c "import geopandas"',
  'https://www.python.org/downloads/', '{python-for-gis}', 7),
 ('autocad-civil-3d', 'AutoCAD Civil 3D', 'survey', 'student', '{windows}',
  'برنامج Autodesk للتصميم المدني والمساحي. رخصة تعليمية مجانية للطلاب.',
  'Autodesk''s civil and survey design software. Free educational license for students.',
  null, null, 'https://www.autodesk.com/education/edu-software/overview', '{}', 8);


-- ════════ 0007_payments.sql ════════
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


-- ════════ 0008_software_support.sql ════════
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


-- ════════ 0009_contact.sql ════════
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

