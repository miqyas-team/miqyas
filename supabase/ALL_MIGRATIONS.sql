-- مقياس — كل ملفات قاعدة البيانات بالترتيب (0001 → 0014)
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


-- ════════ 0010_function_grants.sql ════════
-- مقياس — تشديد صلاحيات تنفيذ الدوال (تنبيهات Security Advisor)
--
-- Postgres يمنح EXECUTE لـ PUBLIC افتراضياً، فكان الزائر غير المسجّل يستطيع استدعاء
-- دوال الإدارة والطلبات (كلها تتحقق من الصلاحية داخلياً، لكن الأفضل ألا تُتاح أصلاً).
-- بعد هذا الملف:
--   • الزائر: دوال التحقق من الشهادة ومقاعد الدفعات + الدوال المساعدة التي تستخدمها سياسات القراءة العامة فقط.
--   • المسجّل: كما كان (المنح الصريح من Supabase لـ authenticated يبقى).
--   • دوال المشغّلات (triggers): لا يستدعيها أحد مباشرة.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- دوال عامة يحتاجها الزائر
grant execute on function public.verify_certificate(text) to anon;
grant execute on function public.cohort_availability(uuid) to anon;

-- دوال تستدعيها سياسات RLS المطبّقة على الزائر (قراءة الدورات والمنتدى والوظائف والبرامج)
grant execute on function public.is_admin() to anon;
grant execute on function public.is_course_staff(uuid) to anon;
grant execute on function public.course_is_public(uuid) to anon;
grant execute on function public.can_view_lesson(uuid) to anon;

-- دوال المشغّلات: تعمل تلقائياً ولا تُستدعى عبر الواجهة
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.protect_profile_columns() from authenticated;
revoke execute on function public.prepare_service_request() from authenticated;
revoke execute on function public.log_request_created() from authenticated;
revoke execute on function public.forum_stamp_author() from authenticated;
revoke execute on function public.forum_reply_counter() from authenticated;
revoke execute on function public.forum_protect_columns() from authenticated;


-- ════════ 0011_optional_vat.sql ════════
-- مقياس — الضريبة اختيارية
-- تُحتسب ضريبة القيمة المضافة (15% ضمن السعر) فقط إذا أُدخل رقم ضريبي في إعدادات المنشأة.
-- بدون رقم ضريبي: vat_amount = 0 وتصدر «فاتورة» عادية.

create or replace function public.submit_payment(p_kind public.payment_kind, p_ref uuid, p_coupon text, p_receipt_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q      jsonb;
  v_id   uuid;
  v_tot  numeric;
  v_vat  boolean;
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
  v_vat := coalesce((select trim(value) <> '' from public.site_settings where key = 'vat_number'), false);

  insert into public.payments (user_id, kind, course_id, request_id, description, list_price, coupon_code, discount, total, vat_amount, receipt_path)
  values (auth.uid(), p_kind,
          case when p_kind = 'course' then p_ref end,
          case when p_kind = 'request' then p_ref end,
          q ->> 'description', (q ->> 'list_price')::numeric,
          case when (q ->> 'percent_off')::int > 0 then upper(trim(p_coupon)) end,
          (q ->> 'discount')::numeric, v_tot,
          case when v_vat then round(v_tot - v_tot / 1.15, 2) else 0 end,
          p_receipt_path)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.submit_payment(public.payment_kind, uuid, text, text) from public, anon;


-- ════════ 0012_software_official_links.sql ════════
-- ============================================================
-- مقياس — ملاحظات الفريق على قسم البرامج
-- 1) رابط الموقع الرسمي يظهر للجميع: زر البرنامج ينقل الزائر مباشرة
--    إلى صفحة التحميل الرسمية (بدل إخفائه خلف طلب خدمة مدفوع).
-- 2) خدمة «تحميل وتثبيت البرامج» (49) تبقى اختيارية لمن يحتاج مساعدة.
-- 3) إخفاء البرامج ذات الرخص الطلابية من القائمة العامة.
-- ============================================================

create policy "software_links: public read" on public.software_links for select
  using (exists (select 1 from public.software s where s.id = software_id and s.is_published));

update public.software set is_published = false, updated_at = now() where license = 'student';

update public.software set
  description_ar = 'برنامج Esri الاحترافي للتحليل المكاني وإخراج الخرائط. برنامج مدفوع، وتتوفر نسخة تجريبية من موقع Esri الرسمي.',
  description_en = 'Esri''s professional GIS for spatial analysis and cartography. Paid software with a free trial on Esri''s official site.',
  install_ar = E'ادخل صفحة النسخة التجريبية على موقع Esri الرسمي.\nأنشئ حساب ArcGIS أو سجّل الدخول، ثم حمّل البرنامج.\nيعمل على Windows فقط؛ تحقق من متطلبات الجهاز قبل التثبيت.',
  install_en = E'Open the free trial page on Esri''s official site.\nCreate or sign in to an ArcGIS account, then download.\nWindows only; check system requirements before installing.',
  updated_at = now()
where slug = 'arcgis-pro';

update public.service_types set
  name_ar = 'مساعدة في تثبيت البرامج',
  name_en = 'Software setup help',
  description_ar = 'خدمة اختيارية: يتواصل معك الدعم الفني في محادثة الطلب ويساعدك في تثبيت البرنامج من مصدره الرسمي وتفعيله.',
  description_en = 'Optional service: tech support helps you in the request chat to install and activate the software from its official source.'
where slug = 'software-install';

-- عدم ذكر أن البرامج أو تحميلها مجاني في الأوصاف
update public.software set
  description_ar = 'برنامج GIS مفتوح المصدر، يكفي لمعظم أعمال الخرائط والتحليل المكاني.',
  description_en = 'Open-source desktop GIS that covers most mapping and spatial analysis work.',
  updated_at = now()
where slug = 'qgis';

update public.software set
  description_ar = 'منصة سحابية من Google لتحليل الصور الفضائية بكميات ضخمة.',
  description_en = 'Google cloud platform for large-scale satellite imagery analysis.',
  updated_at = now()
where slug = 'google-earth-engine';


-- ════════ 0013_library_challenge.sql ════════
-- ============================================================
-- مقياس — المكتبة العلمية والتحدي اليومي
-- 1) المكتبة: مواضيع علمية تمر على موافقة المدير. كل موضوع يُعتمد
--    يُجدول تلقائياً ليوم جديد، فينزل «موضوع اليوم» واحداً كل يوم.
-- 2) التحدي: بنك أسئلة على 12 مستوى (تمر على الموافقة أيضاً).
--    كل يوم 5 أسئلة من مستوى الطالب؛ 4 من 5 = يوم ناجح،
--    و3 أيام ناجحة = ينتقل للمستوى التالي.
--    الإجابات الصحيحة لا تصل للمتصفح قبل الإرسال (التصحيح داخل القاعدة).
-- ============================================================

create type public.content_status as enum ('pending', 'published', 'rejected');

/* ─────────────── المكتبة العلمية ─────────────── */

create table public.articles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category    text not null check (category in ('maps', 'data', 'coordinates', 'remote_sensing', 'analysis', 'surveying', 'tools')),
  title_ar    text not null,
  title_en    text,
  summary_ar  text not null,
  summary_en  text,
  body_ar     text not null,      -- نص بسيط: ## عنوان، - نقطة، **غامق**
  body_en     text,
  read_min    int not null default 4 check (read_min between 1 and 60),
  status      public.content_status not null default 'pending',
  publish_on  date,               -- يوم ظهوره كـ«موضوع اليوم»
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (status <> 'published' or publish_on is not null)
);
create index on public.articles (status, publish_on desc);

alter table public.articles enable row level security;

create policy "articles: public read" on public.articles for select
  using ((status = 'published' and publish_on <= current_date) or public.is_admin());
create policy "articles: admin write" on public.articles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/** اعتماد موضوع: يُجدول لأول يوم فارغ (اليوم أو بعد آخر موضوع مجدول) */
create or replace function public.approve_article(p_id uuid)
returns date language plpgsql security definer set search_path = public as $$
declare
  d date;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select greatest(current_date, coalesce(max(publish_on) + 1, current_date)) into d
    from public.articles where status = 'published' and id <> p_id;
  update public.articles
     set status = 'published', publish_on = d, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_id and status <> 'published';
  if not found then
    select publish_on into d from public.articles where id = p_id;
  end if;
  return d;
end $$;

/* ─────────────── التحدي اليومي ─────────────── */

create table public.challenge_questions (
  id             uuid primary key default gen_random_uuid(),
  level          smallint not null check (level between 1 and 12),
  prompt_ar      text not null,
  prompt_en      text,
  options_ar     text[] not null check (array_length(options_ar, 1) between 2 and 6),
  options_en     text[],
  correct        smallint not null check (correct >= 0),
  explanation_ar text not null,
  explanation_en text,
  status         public.content_status not null default 'pending',
  created_at     timestamptz not null default now(),
  check (correct < array_length(options_ar, 1))
);
create index on public.challenge_questions (level, status);

-- الطالب لا يقرأ الجدول مباشرة (فيه الإجابة الصحيحة) — فقط عبر الدوال أدناه
alter table public.challenge_questions enable row level security;
create policy "challenge_questions: admin" on public.challenge_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table public.challenge_progress (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  level        smallint not null default 1 check (level between 1 and 12),
  level_wins   smallint not null default 0,   -- أيام ناجحة في المستوى الحالي (3 = ترقية)
  streak       int not null default 0,        -- أيام متتالية لعب فيها
  best_streak  int not null default 0,
  last_day     date,
  total_correct int not null default 0,
  points       int not null default 0,
  updated_at   timestamptz not null default now()
);

create table public.challenge_attempts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  level      smallint not null,
  score      smallint not null check (score between 0 and 5),
  points     int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.challenge_progress enable row level security;
alter table public.challenge_attempts enable row level security;
-- قراءة السجل الشخصي فقط؛ الكتابة عبر challenge_submit
create policy "challenge_progress: own" on public.challenge_progress for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "challenge_attempts: own" on public.challenge_attempts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

/** النقاط: 10 لكل إجابة صحيحة × رقم المستوى ÷ 2 (المستويات الأعلى أثمن) + 20 لليوم الناجح */
create or replace function public.challenge_points(p_score int, p_level int)
returns int language sql immutable as $$
  select p_score * 10 * greatest(1, p_level / 2) + case when p_score >= 4 then 20 else 0 end
$$;

/** أسئلة اليوم الخمسة لمستوى الطالب — ثابتة طوال اليوم، بلا الإجابات */
create or replace function public.challenge_today()
returns table (id uuid, level smallint, prompt_ar text, prompt_en text, options_ar text[], options_en text[], played boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lvl smallint;
begin
  if me is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select p.level into lvl from public.challenge_progress p where p.user_id = me;
  lvl := coalesce(lvl, 1);
  return query
    select q.id, q.level, q.prompt_ar, q.prompt_en, q.options_ar, q.options_en,
           exists (select 1 from public.challenge_attempts a where a.user_id = me and a.day = current_date)
      from public.challenge_questions q
     where q.status = 'published' and q.level = lvl
     order by md5(q.id::text || me::text || current_date::text)
     limit 5;
end $$;

/**
 * إرسال إجابات اليوم: مرة واحدة يومياً. يصحّح داخل القاعدة، ويحدّث المستوى والسلسلة والنقاط،
 * ويرجع الإجابات الصحيحة مع الشرح.
 */
create or replace function public.challenge_submit(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prog public.challenge_progress;
  lvl smallint;
  score int := 0;
  pts int;
  won boolean;
  promoted boolean := false;
  results jsonb := '[]'::jsonb;
  q record;
  ans int;
begin
  if me is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if exists (select 1 from public.challenge_attempts where user_id = me and day = current_date) then
    raise exception 'already played today' using errcode = 'P0001';
  end if;

  insert into public.challenge_progress (user_id) values (me) on conflict (user_id) do nothing;
  select * into prog from public.challenge_progress where user_id = me for update;
  lvl := prog.level;

  for q in
    select x.id, x.correct, x.explanation_ar, x.explanation_en
      from public.challenge_questions x
     where x.status = 'published' and x.level = lvl
     order by md5(x.id::text || me::text || current_date::text)
     limit 5
  loop
    ans := nullif(p_answers ->> q.id::text, '')::int;
    if ans = q.correct then score := score + 1; end if;
    results := results || jsonb_build_object(
      'id', q.id, 'correct', q.correct, 'chosen', ans,
      'explanation_ar', q.explanation_ar, 'explanation_en', q.explanation_en);
  end loop;

  if jsonb_array_length(results) = 0 then raise exception 'no questions for this level' using errcode = 'P0001'; end if;

  won := score >= 4;
  pts := public.challenge_points(score, lvl);

  insert into public.challenge_attempts (user_id, day, level, score, points) values (me, current_date, lvl, score, pts);

  update public.challenge_progress set
    streak        = case when last_day = current_date - 1 then streak + 1 else 1 end,
    best_streak   = greatest(best_streak, case when last_day = current_date - 1 then streak + 1 else 1 end),
    last_day      = current_date,
    total_correct = total_correct + score,
    points        = points + pts,
    level_wins    = case when won and level_wins + 1 >= 3 and level < 12 then 0 when won then least(level_wins + 1, 3) else level_wins end,
    level         = case when won and level_wins + 1 >= 3 and level < 12 then level + 1 else level end,
    updated_at    = now()
  where user_id = me
  returning (level > lvl) into promoted;

  return jsonb_build_object('score', score, 'points', pts, 'won', won, 'promoted', promoted, 'results', results);
end $$;

/** المتصدرون هذا الأسبوع (الاسم الأول فقط) */
create or replace function public.challenge_leaderboard()
returns table (name text, points bigint, level smallint, is_me boolean)
language sql stable security definer set search_path = public as $$
  select split_part(p.full_name, ' ', 1), sum(a.points), max(g.level), a.user_id = auth.uid()
    from public.challenge_attempts a
    join public.profiles p on p.id = a.user_id
    left join public.challenge_progress g on g.user_id = a.user_id
   where a.day >= date_trunc('week', current_date)::date
   group by a.user_id, p.full_name
   order by sum(a.points) desc
   limit 10
$$;

/** أعداد بانتظار الموافقة — للوحة الإدارة */
create or replace function public.content_pending_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'articles', (select count(*) from public.articles where status = 'pending'),
    'questions', (select count(*) from public.challenge_questions where status = 'pending'));
end $$;

-- الصلاحيات: للمسجّلين فقط (الدوال الافتراضية تُمنح لـ PUBLIC)
revoke execute on function public.approve_article(uuid) from public, anon;
revoke execute on function public.challenge_today() from public, anon;
revoke execute on function public.challenge_submit(jsonb) from public, anon;
revoke execute on function public.challenge_leaderboard() from public, anon;
revoke execute on function public.content_pending_counts() from public, anon;
revoke execute on function public.challenge_points(int, int) from public, anon;
grant execute on function public.approve_article(uuid) to authenticated;
grant execute on function public.challenge_today() to authenticated;
grant execute on function public.challenge_submit(jsonb) to authenticated;
grant execute on function public.challenge_leaderboard() to authenticated;
grant execute on function public.content_pending_counts() to authenticated;


-- ════════ 0014_content_bank.sql ════════
-- ============================================================
-- مقياس — بنك المحتوى الأولي (مولَّد آلياً: npm run content:build — لا تعدّله يدوياً)
-- 30 موضوعاً للمكتبة العلمية + 360 سؤالاً للتحدي على 12 مستوى.
-- كل المحتوى يدخل «بانتظار الموافقة»: يراجعه المدير ويعتمده من لوحة الإدارة.
-- ============================================================

insert into public.articles (slug, category, title_ar, title_en, summary_ar, body_ar, read_min) values
  ('topographic-maps', 'maps', 'الخرائط الطبوغرافية: كيف تقرأ التضاريس على ورقة مسطحة؟', 'Topographic maps', 'تعرّف على خطوط الكنتور وطريقة قراءة الارتفاعات والانحدارات من الخريطة الطبوغرافية.', 'الخريطة الطبوغرافية تعرض شكل سطح الأرض بأبعاده الثلاثة على ورقة أو شاشة مسطحة، إضافة إلى المعالم الطبيعية والبشرية مثل الأودية والطرق والمباني.

## خطوط الكنتور
خط الكنتور (خط التسوية) يصل بين النقاط المتساوية في الارتفاع عن مستوى سطح البحر.
- **الفاصل الكنتوري**: الفرق الثابت في الارتفاع بين كل خطين متجاورين، مثل 10 أمتار.
- **تقارب الخطوط** يعني انحداراً شديداً، وتباعدها يعني أرضاً مستوية أو انحداراً خفيفاً.
- **الخطوط المغلقة** المتداخلة تمثل قمة جبل أو منخفضاً.
- إذا عبرت الخطوط وادياً تأخذ شكل حرف V ورأسه يشير إلى أعلى المجرى.

## ماذا تحتوي غير الكنتور؟
- نقاط مناسيب مكتوب عليها الارتفاع بدقة.
- شبكة إحداثيات للربط بالموقع الحقيقي.
- رموز للطرق والمباني والمسطحات المائية والغطاء النباتي.

## استخداماتها
- تخطيط الطرق وخطوط الأنابيب واختيار المسارات الأقل انحداراً.
- دراسة اتجاهات جريان السيول وتحديد الأحواض المائية.
- العمل الميداني والملاحة في المناطق الجبلية.

## في نظم المعلومات الجغرافية
تُنتج خطوط الكنتور اليوم آلياً من نماذج الارتفاع الرقمية (DEM). في QGIS مثلاً تستخدم أداة Contour من قائمة Raster ثم Extraction، وتحدد الفاصل الكنتوري المطلوب.', 5),
  ('geological-maps', 'maps', 'الخرائط الجيولوجية: ماذا تخبرنا ألوان الصخور؟', 'Geological maps', 'كيف تعرض الخريطة الجيولوجية أنواع الصخور وأعمارها والفوالق، ولماذا يحتاجها المهندسون والمخططون.', 'الخريطة الجيولوجية تبيّن توزيع الوحدات الصخرية على سطح الأرض وما تحته مباشرة، مع أعمارها والتراكيب التي أثرت فيها مثل الفوالق والطيات.

## كيف تُقرأ؟
- **الألوان**: كل لون يمثل وحدة صخرية أو عمراً جيولوجياً، ويُشرح في مفتاح الخريطة.
- **الرموز الحرفية**: اختصار لاسم الوحدة وعمرها يُكتب داخل المساحة الملونة.
- **الخطوط**: الخط المتصل يمثل حداً مؤكداً بين وحدتين، والخط المتقطع حداً تقريبياً.
- **رموز الميل والمضرب**: توضح اتجاه الطبقات وزاوية ميلها.
- **الفوالق**: خطوط سميكة تبين أماكن انكسار الصخور وإزاحتها.

## المقطع الجيولوجي
كثير من الخرائط الجيولوجية يرافقها مقطع عرضي يوضح ترتيب الطبقات تحت السطح على امتداد خط محدد.

## لماذا هي مهمة؟
- البحث عن المياه الجوفية والمعادن.
- تقييم مخاطر الانهيارات والزلازل قبل إنشاء المشاريع.
- اختيار مواقع السدود والأنفاق والمنشآت الكبيرة.

## في المملكة
تصدر هيئة المساحة الجيولوجية السعودية خرائط جيولوجية بمقاييس مختلفة تغطي المملكة، ويمكن الاستفادة منها كطبقات مرجعية في مشاريع GIS بعد التأكد من شروط استخدامها.', 5),
  ('soil-maps', 'maps', 'خرائط التربة: أساس الزراعة والتخطيط', 'Soil maps', 'ما الذي تعرضه خرائط التربة، وكيف تُبنى من العينات الميدانية والصور الفضائية؟', 'خريطة التربة تقسم المنطقة إلى وحدات متشابهة في خصائص التربة مثل القوام والعمق والملوحة والتصريف.

## الخصائص الأشهر في خرائط التربة
- **القوام**: نسبة الرمل والطمي والطين، ويحدد قدرة التربة على حفظ الماء.
- **العمق**: المسافة حتى الصخر الأساسي أو الطبقة الصلبة.
- **الملوحة**: مهمة جداً في البيئات الجافة لأنها تحد من الزراعة.
- **التصريف**: سرعة نفاذ الماء في التربة.
- **درجة الحموضة pH** والمادة العضوية.

## كيف تُنتج؟
1. جمع عينات ميدانية في مواقع مدروسة وتحليلها مخبرياً.
2. الاستعانة بالصور الفضائية ونماذج الارتفاع لتحديد الحدود بين الوحدات.
3. تعميم القيم بين نقاط العينات بأساليب الاستيفاء أو التصنيف.

## الاستخدامات
- اختيار المحاصيل المناسبة وتخطيط الري.
- دراسات التصحر وتدهور الأراضي.
- أعمال الأساسات في الهندسة المدنية.

## نصيحة عملية
عند استخدام خريطة تربة جاهزة انتبه لمقياسها: خريطة بمقياس صغير تعطي صورة عامة عن الإقليم ولا تصلح لاتخاذ قرار على مستوى مزرعة واحدة.', 4),
  ('land-use-maps', 'maps', 'خرائط استخدامات الأراضي والغطاء الأرضي: ما الفرق بينهما؟', 'Land use and land cover maps', 'الغطاء الأرضي هو ما نراه على السطح، واستخدام الأرض هو ما يفعله الإنسان بها. تعرّف على الفرق وطرق الإنتاج.', 'يخلط كثيرون بين مصطلحين متقاربين:
- **الغطاء الأرضي (Land Cover)**: ما يغطي سطح الأرض فعلياً، مثل نبات أو رمل أو ماء أو أسطح مبنية.
- **استخدام الأرض (Land Use)**: الغرض الذي يستعمل الإنسان الأرض لأجله، مثل سكني أو تجاري أو زراعي أو صناعي.

مثال: مساحة عشبية قد يكون استخدامها حديقة عامة أو ملعب جولف أو مرعى، والغطاء واحد.

## كيف تُنتج؟
- **الغطاء الأرضي** يُستخرج غالباً من الصور الفضائية بالتصنيف الموجّه أو غير الموجّه.
- **استخدام الأرض** يحتاج مصادر إضافية مثل المخططات البلدية والزيارات الميدانية.

## دراسة التغير
بمقارنة خرائط لنفس المنطقة في سنوات مختلفة نقيس الزحف العمراني وتراجع الرقعة الزراعية، وهي من أكثر مشاريع التخرج شيوعاً.

## نصائح لمشروعك
- حدد نظام تصنيف واضحاً قبل البدء، مثل 5 إلى 7 فئات فقط.
- قيّم دقة التصنيف بنقاط تحقق ومصفوفة الخطأ.
- استخدم صوراً من نفس الموسم لتقليل أثر اختلاف النبات.', 4),
  ('hydrological-maps', 'maps', 'الخرائط الهيدرولوجية: تتبّع مسار الماء', 'Hydrological maps', 'الأحواض المائية وشبكات الأودية واتجاه الجريان، وكيف نستخرجها آلياً من نموذج الارتفاع.', 'الخرائط الهيدرولوجية تعرض حركة المياه السطحية والجوفية: الأودية، والأحواض المائية، ومناطق التجمع، ومخاطر السيول.

## مفاهيم أساسية
- **الحوض المائي (Watershed)**: المساحة التي تصرّف مياهها إلى نقطة مخرج واحدة.
- **خط تقسيم المياه**: الحد الفاصل بين حوضين متجاورين، ويمر غالباً بقمم المرتفعات.
- **رتبة المجرى**: تصنيف الأودية حسب تفرعها، وأشهرها طريقة ستريلر.

## خطوات الاستخراج الآلي من DEM
1. **ملء المنخفضات (Fill Sinks)** لإزالة الحفر الوهمية في النموذج.
2. **اتجاه الجريان (Flow Direction)** لكل خلية نحو أشد جاراتها انحداراً.
3. **تراكم الجريان (Flow Accumulation)**: عدد الخلايا التي تصب في كل خلية.
4. **استخراج المجاري** بتحديد حد أدنى للتراكم.
5. **تحديد الحوض** انطلاقاً من نقطة مخرج.

## أهميتها في بيئتنا
في المناطق الجافة قد تأتي السيول مفاجئة وقوية، لذلك تُستخدم هذه الخرائط في تخطيط مجاري تصريف السيول وحماية الطرق والأحياء وتحديد مواقع السدود.', 5),
  ('climate-maps', 'maps', 'الخرائط المناخية: من نقاط المحطات إلى سطح متصل', 'Climate maps', 'كيف تتحول قراءات محطات الأرصاد المتفرقة إلى خرائط حرارة وأمطار متصلة؟', 'الخرائط المناخية تمثل متوسطات عناصر المناخ على مدى سنوات طويلة، مثل الحرارة والأمطار والرطوبة والرياح.

## أشهر أنواعها
- **خطوط تساوي الحرارة (Isotherms)** تصل بين النقاط المتساوية في الحرارة.
- **خطوط تساوي المطر (Isohyets)** للأمطار.
- **وردة الرياح** توضح اتجاه الرياح وسرعتها وتكرارها.
- **خرائط الأقاليم المناخية** مثل تصنيف كوبن.

## من النقطة إلى السطح
المحطات قليلة ومتباعدة، لذلك نقدّر القيم بينها بأساليب الاستيفاء:
- **IDW**: كل نقطة تتأثر أكثر بأقرب المحطات.
- **Kriging**: يعتمد على تحليل إحصائي لتغير القيم مع المسافة.

كما يمكن إدخال الارتفاع كمتغير مساعد لأن الحرارة تنخفض عادة مع الارتفاع.

## الفرق بين الطقس والمناخ
الطقس حالة الجو في وقت محدد، والمناخ متوسط حالة الجو لفترة طويلة تمتد غالباً 30 سنة. الخرائط المناخية تعرض المناخ لا الطقس.

## مصادر بيانات
بيانات المحطات المحلية، وقواعد بيانات عالمية مفتوحة لمتوسطات الحرارة والأمطار بدقة مكانية جيدة.', 4),
  ('thematic-maps', 'maps', 'الخرائط الموضوعية: اختر النوع المناسب لبياناتك', 'Thematic maps', 'الكوروبليث والرموز النسبية والنقاط والخرائط الحرارية: متى تستخدم كل نوع؟', 'الخريطة الموضوعية تركز على موضوع واحد مثل السكان أو الدخل أو الحوادث، بعكس الخريطة المرجعية العامة.

## أشهر الأنواع
- **الكوروبليث (Choropleth)**: تلوين المناطق الإدارية حسب قيمة. استخدمها مع **النسب والمعدلات** مثل الكثافة السكانية، لا مع الأعداد المطلقة.
- **الرموز النسبية**: دوائر يكبر حجمها مع القيمة، وهي مناسبة للأعداد المطلقة مثل عدد السكان.
- **خريطة النقاط**: كل نقطة تمثل حدثاً أو عدداً ثابتاً، وتبين التوزيع والتكتل.
- **الخريطة الحرارية (Heatmap)**: تبين كثافة الأحداث كسطح متدرج.
- **خطوط التساوي**: للظواهر المتصلة مثل الحرارة.

## خطأ شائع
تلوين المحافظات حسب **عدد** السكان يجعل المحافظات الكبيرة تبدو مهمة لمجرد مساحتها. الصحيح أن تستخدم الكثافة، أو ترسم دوائر نسبية للأعداد.

## تقسيم الفئات
- **فترات متساوية**: سهلة الفهم.
- **الكوانتايل**: نفس عدد المناطق في كل فئة.
- **الفواصل الطبيعية (Jenks)**: تبحث عن الفجوات في البيانات.

اختيار طريقة التقسيم يغير شكل الخريطة كثيراً، فاذكره دائماً في المفتاح.', 5),
  ('map-elements', 'maps', 'عناصر الخريطة الاحترافية: قائمة التحقق قبل الطباعة', 'Map layout elements', 'العنوان والمفتاح ومقياس الرسم واتجاه الشمال والمصدر: كيف ترتّبها لخريطة واضحة؟', 'الخريطة الجيدة تُفهم دون شرح شفهي. قبل الطباعة أو التسليم راجع هذه العناصر:

## العناصر الأساسية
- **العنوان**: يجيب عن ماذا وأين ومتى، مثل «الكثافة السكانية في محافظات منطقة الرياض 2022».
- **مفتاح الخريطة (Legend)**: يشرح كل رمز ولون، ويحذف الطبقات التي لا تحتاج شرحاً.
- **مقياس الرسم**: يفضل الخطي لأنه يبقى صحيحاً إذا كُبّرت الخريطة أو صُغّرت.
- **اتجاه الشمال**: بسيط وغير مبالغ في حجمه.
- **المصدر والتاريخ**: من أين جاءت البيانات ومتى.
- **نظام الإحداثيات** المستخدم.
- **اسم المعد** أو الجهة.

## عناصر مساعدة
- خريطة موقع صغيرة توضح مكان المنطقة من الدولة.
- شبكة إحداثيات للخرائط المطبوعة الميدانية.

## مبادئ التصميم
- **التسلسل البصري**: الموضوع الرئيسي أوضح من الطبقات المرجعية.
- **التوازن**: وزّع العناصر حول إطار الخريطة دون ازدحام.
- **الألوان**: تدرج لون واحد للقيم المتزايدة، وألوان مختلفة للفئات.
- **الخطوط**: نوع أو نوعان كحد أقصى.

في QGIS تجهّز كل ذلك من Print Layout وتصدره PDF بدقة 300 نقطة للطباعة.', 4),
  ('map-scale', 'maps', 'مقياس الرسم: الكبير والصغير ولماذا يحيّر الطلاب', 'Map scale', 'ماذا يعني 1:50,000؟ ولماذا تُسمى خريطة الحي «كبيرة المقياس»؟', 'مقياس الرسم هو النسبة بين المسافة على الخريطة والمسافة الحقيقية على الأرض.

## أشكاله
- **الكسري أو النسبي**: مثل 1:50,000، أي أن 1 سم على الخريطة يساوي 50,000 سم أي 500 متر على الأرض.
- **الكتابي**: مثل «1 سم يمثل 500 م».
- **الخطي**: مسطرة مقسمة مرسومة على الخريطة.

## الكبير والصغير
- **مقياس كبير** مثل 1:1,000: الكسر قيمته كبيرة، وتظهر فيه منطقة صغيرة بتفاصيل كثيرة، مثل مخطط حي.
- **مقياس صغير** مثل 1:5,000,000: يظهر منطقة واسعة بتفاصيل قليلة، مثل خريطة دولة.

طريقة سهلة للتذكر: كلما كبر الرقم في المقام صغر المقياس.

## مثال حسابي
المسافة بين مدينتين على خريطة 1:250,000 هي 8 سم.
المسافة الحقيقية = 8 × 250,000 = 2,000,000 سم = 20 كم.

## في GIS
البيانات الرقمية تُكبّر بلا حدود، لكن دقتها مرتبطة بالمقياس الذي جُمعت عليه. طبقة رُقمت من خريطة 1:250,000 لن تصبح دقيقة إذا عرضتها على 1:1,000.', 3),
  ('vector-vs-raster', 'data', 'البيانات الخطية والشبكية: Vector أم Raster؟', 'Vector vs raster data', 'النموذجان الأساسيان لتمثيل العالم في نظم المعلومات الجغرافية، ومتى تختار كلاً منهما.', 'كل بيانات GIS تقريباً تُخزن بإحدى طريقتين.

## البيانات الخطية (Vector)
تمثل المعالم بأشكال هندسية محددة بإحداثيات:
- **نقطة**: بئر، مدرسة، محطة.
- **خط**: طريق، وادٍ، أنبوب.
- **مضلع**: حي، قطعة أرض، بحيرة.

ولكل معلم سجل في **جدول البيانات الوصفية** يحمل خصائصه مثل الاسم والمساحة.

**مميزاتها**: حدود دقيقة، حجم صغير غالباً، مناسبة للحسابات مثل الأطوال والمساحات والتحليل الشبكي.

## البيانات الشبكية (Raster)
تقسم المنطقة إلى شبكة خلايا (بكسلات) متساوية، ولكل خلية قيمة:
- صورة فضائية.
- نموذج ارتفاع رقمي.
- خريطة حرارة أو تصنيف غطاء أرضي.

**مميزاتها**: ممتازة للظواهر المتصلة التي تتغير تدريجياً، وسهلة في العمليات الحسابية بين الطبقات.

**حجم الخلية** يحدد الدقة: خلية 10 م أدق من خلية 30 م لكن الملف أكبر.

## كيف تختار؟
- معالم واضحة الحدود؟ Vector.
- ظاهرة متصلة أو صورة؟ Raster.

ويمكن التحويل بينهما بأدوات Rasterize وPolygonize، مع فقد بعض الدقة.', 5),
  ('gis-file-formats', 'data', 'صيغ ملفات GIS: Shapefile وGeoJSON وKML وGeoPackage', 'GIS file formats', 'لماذا يأتي الـShapefile في عدة ملفات؟ وما الصيغة الأنسب لمشروعك؟', '## Shapefile
أقدم الصيغ وأكثرها انتشاراً، لكنه ليس ملفاً واحداً بل مجموعة ملفات بنفس الاسم:
- **.shp**: الأشكال الهندسية.
- **.shx**: فهرس الأشكال.
- **.dbf**: جدول البيانات الوصفية.
- **.prj**: نظام الإحداثيات، ومن دونه لا يعرف البرنامج أين تقع البيانات.

عند إرسال Shapefile اضغط كل ملفاته معاً في ملف ZIP. من قيوده: أسماء الحقول لا تتجاوز 10 أحرف، ونوع هندسي واحد لكل ملف.

## GeoJSON
ملف نصي واحد مبني على JSON، سهل القراءة ومناسب جداً للويب. الإحداثيات فيه وفق المواصفة تكون خط طول ثم خط عرض بنظام WGS84.

## KML وKMZ
صيغة Google Earth، وتحفظ معها التنسيق والألوان. KMZ نسخة مضغوطة من KML.

## GeoPackage
ملف واحد بامتداد .gpkg يحفظ عدة طبقات خطية وشبكية معاً، بلا قيود أسماء الحقول. وهو الصيغة الافتراضية في QGIS ويُنصح به بديلاً للـShapefile.

## الصيغ الشبكية
- **GeoTIFF**: الأكثر شيوعاً للصور ونماذج الارتفاع، ويحمل معلومات الموقع داخله.

## خلاصة
للمشاركة على الويب: GeoJSON. لمشروع متكامل: GeoPackage. للتوافق مع الأنظمة القديمة: Shapefile.', 5),
  ('attribute-tables', 'data', 'جدول البيانات الوصفية: نصف قوة GIS', 'Attribute tables', 'الحقول وأنواعها، والاستعلام، والربط بين الجداول، وحساب الحقول.', 'كل معلم في الطبقة الخطية يقابله صف في جدول، وكل عمود حقل يصف خاصية.

## أنواع الحقول
- **نصي**: الاسم، التصنيف.
- **عدد صحيح**: عدد السكان.
- **عدد عشري**: المساحة، المسافة.
- **تاريخ**: تاريخ الرصد.

اختيار النوع الصحيح مهم: الأرقام المخزنة كنص لا يمكن جمعها أو ترتيبها رقمياً بشكل صحيح.

## عمليات يومية
- **الاستعلام بالخصائص**: مثل اختيار المدارس التي يزيد عدد طلابها على 500.
- **حاسبة الحقول**: لحساب المساحة أو دمج حقلين أو تصنيف القيم.
- **الإحصاءات**: المجموع والمتوسط لحقل معين.

## الربط (Join)
تربط جدولاً خارجياً، مثل ملف Excel للتعداد السكاني، بطبقة الأحياء عبر حقل مشترك كرمز الحي. شروط النجاح:
- الحقل المشترك بنفس النوع في الجدولين.
- القيم متطابقة تماماً دون مسافات زائدة.

## الربط المكاني (Spatial Join)
يربط الخصائص بناءً على الموقع لا على حقل مشترك، مثل معرفة الحي الذي تقع فيه كل مدرسة.

## نصيحة
احفظ نسخة قبل التعديل الجماعي في الجدول، فبعض العمليات لا يمكن التراجع عنها بعد الحفظ.', 4),
  ('open-data-sources', 'data', 'مصادر بيانات GIS مجانية لمشروعك القادم', 'Free GIS data sources', 'صور فضائية ونماذج ارتفاع وبيانات طرق ومبانٍ: من أين تحصل عليها مجاناً؟', 'قبل أن تبدأ أي مشروع اسأل: من أين ستأتي البيانات؟ هذه مصادر عالمية مفتوحة يستخدمها الطلاب والمختصون:

## الصور الفضائية
- **Landsat**: أرشيف طويل يمتد لعقود بدقة 30 متراً، ممتاز لدراسات التغير عبر الزمن.
- **Sentinel-2**: دقة تصل إلى 10 أمتار وتكرار زيارة متقارب.
- يمكن تحميلها من منصات المؤسسات المالكة لها بعد إنشاء حساب مجاني.

## نماذج الارتفاع
- نماذج عالمية بدقة تقارب 30 متراً، مثل SRTM ونموذج Copernicus.

## الطرق والمباني والمعالم
- **OpenStreetMap**: خريطة تشاركية مفتوحة فيها الطرق والمباني ونقاط الاهتمام. انتبه إلى أن اكتمالها يختلف من منطقة لأخرى.

## الحدود الإدارية
- قواعد بيانات عالمية مفتوحة للحدود الإدارية بمستوياتها المختلفة.

## قبل الاستخدام تحقق من
- **الترخيص**: هل يسمح بالاستخدام التجاري؟ هل يشترط ذكر المصدر؟
- **التاريخ**: هل البيانات حديثة بما يكفي؟
- **الدقة والمقياس**: هل تناسب مستوى التحليل الذي تريده؟
- **نظام الإحداثيات**.

ودائماً اذكر المصدر في خريطتك وتقريرك.', 4),
  ('geographic-vs-projected', 'coordinates', 'الإحداثيات الجغرافية والمسقطة: لماذا تظهر المسافات بالدرجات؟', 'Geographic vs projected coordinate systems', 'الخطأ الأشهر عند المبتدئين: حساب مساحة بطبقة إحداثياتها بالدرجات.', '## نظام الإحداثيات الجغرافي (GCS)
يحدد الموقع على سطح الأرض الكروي تقريباً بزاويتين:
- **خط العرض**: من 90 جنوباً إلى 90 شمالاً.
- **خط الطول**: من 180 غرباً إلى 180 شرقاً.

الوحدة **درجات**. أشهر مثال: **WGS84** ورمزه EPSG:4326، وهو ما يستخدمه الـGPS.

المشكلة: الدرجة ليست طولاً ثابتاً. درجة خط الطول تساوي نحو 111 كم عند خط الاستواء وتتقلص حتى الصفر عند القطبين.

## نظام الإحداثيات المسقط (PCS)
يحوّل سطح الأرض المنحني إلى مستوٍ بمعادلات رياضية، والوحدة غالباً **أمتار**. مثال: نطاقات **UTM**.

## الخطأ الأشهر
إذا حسبت المساحة أو المسافة لطبقة إحداثياتها بالدرجات تحصل على أرقام بلا معنى، مثل 0.0003. الحل:
1. أعد إسقاط الطبقة إلى نظام مسقط مناسب للمنطقة، مثل نطاق UTM المناسب.
2. احسب المساحة بالأمتار المربعة.

## تعيين النظام أم تحويله؟
- **تعيين النظام (Assign/Define)**: تخبر البرنامج بالنظام الصحيح لبيانات معروفة، دون تغيير الأرقام.
- **إعادة الإسقاط (Reproject)**: تحول الإحداثيات فعلاً من نظام لآخر.

استخدام الأول بدل الثاني يجعل بياناتك تظهر في مكان خاطئ تماماً.', 5),
  ('utm-zones-saudi', 'coordinates', 'نظام UTM في المملكة: أي نطاق أستخدم؟', 'UTM zones in Saudi Arabia', 'المملكة تمتد على عدة نطاقات UTM. تعرّف على طريقة اختيار النطاق الصحيح لمنطقتك.', 'نظام **UTM** يقسم الكرة الأرضية إلى 60 نطاقاً طولياً، عرض كل نطاق 6 درجات، ولكل نطاق إسقاط مستعرض خاص به يقلل التشوه داخله. الوحدة بالأمتار.

## حساب رقم النطاق
رقم النطاق = (خط الطول + 180) ÷ 6، ثم تأخذ الجزء الصحيح وتضيف 1.

مثال: الرياض عند خط طول تقريبي 46.7 شرقاً:
(46.7 + 180) ÷ 6 = 37.8، الجزء الصحيح 37، والنطاق **38**.

## نطاقات المملكة
تمتد المملكة تقريباً بين خطي طول 34 و56 شرقاً، لذلك تغطيها النطاقات **من 36 إلى 40** شمالاً:
- غرب المملكة وساحل البحر الأحمر: غالباً 37، وأقصى الشمال الغربي 36.
- الوسط: 38.
- الشرق: 39، وأقصى الجنوب الشرقي 40.

احسب النطاق لموقعك بالمعادلة السابقة بدل الاعتماد على التقريب.

## الحرف N أو S
المملكة شمال خط الاستواء، فتختار النطاق الشمالي مثل **UTM 38N**.

## مشكلة المشاريع العابرة للنطاقات
إذا امتد مشروعك على نطاقين لا تجمعه في نطاق واحد بعيد عنه، لأن التشوه يزداد خارج النطاق. اختر إسقاطاً يغطي المنطقة كلها، أو قسّم العمل.

## ملاحظة عن المرجع الجيوديسي
النظام الوطني الحديث في المملكة هو الإطار المرجعي الجيوديسي السعودي، وما زالت بيانات قديمة كثيرة مبنية على مرجع Ain el Abd 1970. تحقق دائماً من المرجع قبل دمج بيانات من مصادر مختلفة.', 4),
  ('datums-explained', 'coordinates', 'المرجع الجيوديسي (Datum): لماذا تنزاح طبقاتك عشرات الأمتار؟', 'Datums explained', 'نفس الإحداثيات بمرجعين مختلفين تشير إلى مكانين مختلفين. افهم السبب والحل.', 'الأرض ليست كرة مثالية، بل أقرب لشكل بيضاوي مفلطح عند القطبين. لذلك نحتاج نموذجاً رياضياً يمثلها.

## المجسم والمرجع
- **المجسم البيضاوي (Ellipsoid)**: شكل رياضي محدد بنصف القطر الاستوائي ومقدار التفلطح.
- **المرجع الجيوديسي (Datum)**: يحدد كيف يُثبّت هذا المجسم بالنسبة للأرض الحقيقية.

## أنواع المراجع
- **مراجع محلية**: مصممة لتناسب منطقة محددة بدقة عالية، مثل Ain el Abd 1970 الذي استُخدم في المملكة لسنوات طويلة.
- **مراجع عالمية**: تناسب الأرض كلها، مثل **WGS84** الذي يعتمد عليه الـGPS.

## المشكلة العملية
إذا كانت طبقة على مرجع محلي قديم وأخرى على WGS84، ثم عرضتهما دون تحويل صحيح، ستلاحظ إزاحة قد تصل إلى عشرات أو مئات الأمتار.

## الحل
1. اعرف المرجع الأصلي لكل طبقة من ملف .prj أو من بيانات المصدر.
2. استخدم إعادة الإسقاط مع اختيار **معاملات التحويل** المناسبة بين المرجعين.
3. تحقق بصرياً بمقارنة الطبقة بصورة فضائية حديثة.

## خلاصة
عندما تستلم بيانات من جهة أخرى اسأل دائماً سؤالين: ما نظام الإحداثيات؟ وما المرجع الجيوديسي؟', 4),
  ('map-projections', 'coordinates', 'الإسقاطات: لا توجد خريطة مسطحة بلا تشويه', 'Map projections', 'المساحة أم الشكل أم المسافة؟ كل إسقاط يحافظ على شيء ويضحي بآخر.', 'تحويل سطح منحنٍ إلى مستوٍ يشبه محاولة فرد قشرة برتقالة على طاولة: لا بد من تمزق أو تمدد.

## ماذا نحافظ عليه؟
- **إسقاطات متساوية المساحة**: تحافظ على المساحات النسبية، وهي مناسبة لخرائط التوزيع والكثافة.
- **إسقاطات متطابقة (Conformal)**: تحافظ على الزوايا والأشكال المحلية، مثل ميركاتور وUTM، وهي مناسبة للملاحة والخرائط الهندسية.
- **إسقاطات متساوية البعد**: تحافظ على المسافة من نقطة محددة.
- **إسقاطات توفيقية**: لا تحافظ تماماً على شيء لكنها تقلل التشوه العام، وتستخدم في خرائط العالم.

## ميركاتور وغرينلاند
في إسقاط ميركاتور تبدو غرينلاند قريبة من حجم أفريقيا، بينما مساحة أفريقيا أكبر منها بنحو 14 مرة. السبب أن ميركاتور يضخم المساحات كلما ابتعدنا عن خط الاستواء.

## أسطح الإسقاط
- **أسطواني**: مثل ميركاتور.
- **مخروطي**: مناسب لمناطق العروض الوسطى الممتدة شرقاً وغرباً.
- **مستوٍ (سمتي)**: مناسب للمناطق القطبية.

## القاعدة العملية
اختر الإسقاط حسب الهدف: لحساب المساحات استخدم متساوي المساحة أو UTM المحلي، وللعرض العام على الويب يُستخدم Web Mercator لكنه لا يصلح للقياس.', 4),
  ('remote-sensing-basics', 'remote_sensing', 'الاستشعار عن بعد: كيف ترى الأقمار ما لا تراه العين؟', 'Remote sensing basics', 'الطيف الكهرومغناطيسي، والبصمة الطيفية، والفرق بين المستشعر النشط والسلبي.', 'الاستشعار عن بعد هو جمع معلومات عن سطح الأرض دون لمسه، باستخدام مستشعرات على الأقمار الصناعية أو الطائرات أو الطائرات المسيّرة.

## الطيف الكهرومغناطيسي
العين ترى جزءاً صغيراً من الطيف هو الضوء المرئي: الأزرق والأخضر والأحمر. المستشعرات ترى أيضاً:
- **تحت الحمراء القريبة (NIR)**: النبات السليم يعكسها بقوة.
- **تحت الحمراء قصيرة الموجة (SWIR)**: حساسة للرطوبة والمعادن.
- **الحرارية**: تقيس حرارة السطح.

## البصمة الطيفية
كل مادة تعكس الأطوال الموجية بطريقة مميزة:
- **الماء** يمتص معظم الأشعة تحت الحمراء فيظهر داكناً.
- **النبات** يعكس الأخضر قليلاً ويعكس تحت الحمراء القريبة بقوة.
- **التربة الجافة** يزداد انعكاسها تدريجياً مع طول الموجة.

## المستشعر السلبي والنشط
- **سلبي**: يعتمد على ضوء الشمس المنعكس، مثل Landsat وSentinel-2، ولا يرى عبر السحب ولا في الليل.
- **نشط**: يرسل إشارته ويستقبل ارتدادها، مثل الرادار والليدار، ويعمل ليلاً ونهاراً والرادار يخترق السحب.

## تركيب الألوان
- **ألوان طبيعية**: أحمر وأخضر وأزرق، تظهر كما تراها العين.
- **ألوان كاذبة**: NIR في قناة الأحمر، فيظهر النبات أحمر زاهياً ويسهل تمييزه.', 5),
  ('ndvi-index', 'remote_sensing', 'مؤشر NDVI: قياس صحة النبات برقم واحد', 'NDVI vegetation index', 'معادلة NDVI، ومعنى قيمها، وكيف تحسبه في QGIS خطوة بخطوة.', 'مؤشر الغطاء النباتي المعياري **NDVI** من أشهر المؤشرات الطيفية، ويعتمد على أن النبات السليم يعكس الأشعة تحت الحمراء القريبة بقوة ويمتص الأحمر للبناء الضوئي.

## المعادلة
NDVI = (NIR − Red) ÷ (NIR + Red)

## معنى القيم
تتراوح القيم بين −1 و+1:
- **قيم سالبة**: ماء أو سحب غالباً.
- **قريبة من الصفر**: تربة عارية أو صخور أو مبانٍ.
- **من 0.2 إلى 0.5 تقريباً**: نبات متفرق أو ضعيف.
- **أعلى من 0.5 تقريباً**: نبات كثيف وسليم.

هذه الحدود تقريبية وتختلف حسب المستشعر والموسم والمنطقة.

## الحساب في QGIS
1. حمّل نطاقي الأحمر وتحت الحمراء القريبة لنفس الصورة.
2. افتح Raster Calculator.
3. اكتب المعادلة مع الانتباه لأسماء النطاقات، فمثلاً في Sentinel-2 الأحمر هو B4 وتحت الحمراء القريبة B8.
4. احفظ الناتج وصنّفه بتدرج لوني من البني إلى الأخضر.

## استخدامات
- متابعة المحاصيل والمراعي.
- رصد التصحر وتغير الغطاء النباتي.
- تقدير أثر الجفاف أو الأمطار.

## مؤشرات أخرى
- **NDWI** للمسطحات المائية والرطوبة.
- **NDBI** للمناطق المبنية.', 4),
  ('image-resolution', 'remote_sensing', 'أنواع الدقة في الصور الفضائية الأربعة', 'Four types of image resolution', 'مكانية وطيفية وزمنية وإشعاعية: لا تحكم على الصورة بحجم البكسل فقط.', 'عندما نقول إن صورة «عالية الدقة» قد نقصد أحد أربعة أنواع مختلفة:

## 1. الدقة المكانية
حجم البكسل على الأرض. بكسل 10 م يعني أن كل خلية تغطي 10 × 10 م.
- عالية جداً: أقل من متر، وتظهر فيها السيارات.
- متوسطة: 10 إلى 30 م، ومناسبة لدراسة الغطاء الأرضي على مستوى المدينة أو الإقليم.

## 2. الدقة الطيفية
عدد النطاقات وضيقها. صورة بنطاقات كثيرة وضيقة تميز المواد بدقة أكبر. الصور فائقة الطيفية تحتوي على مئات النطاقات.

## 3. الدقة الزمنية
كم مرة يزور القمر نفس المكان. Sentinel-2 مثلاً يعود بفاصل أيام قليلة عند دمج قمريه، وهذا مهم لمتابعة المحاصيل والكوارث.

## 4. الدقة الإشعاعية
عدد مستويات السطوع التي يسجلها كل بكسل:
- 8 بت = 256 مستوى.
- 12 بت = 4096 مستوى، فتظهر فروق دقيقة في السطوع.

## المفاضلة
لا يوجد قمر يجمع أعلى دقة في كل شيء. الصور الأدق مكانياً غالباً تغطي مساحة أصغر وبتكلفة أعلى. اختر حسب سؤالك:
- مراقبة حقول شاسعة كل أسبوع؟ دقة زمنية أهم.
- رصد مبانٍ مخالفة؟ دقة مكانية أعلى.', 4),
  ('digital-elevation-models', 'remote_sensing', 'نماذج الارتفاع الرقمية: DEM وDSM وDTM', 'Digital elevation models', 'ما الفرق بين النماذج الثلاثة؟ وما المشتقات التي تستخرجها منها؟', 'نموذج الارتفاع الرقمي طبقة شبكية قيمة كل خلية فيها تمثل الارتفاع.

## الأنواع الثلاثة
- **DSM (نموذج السطح)**: يشمل كل ما فوق الأرض من مبانٍ وأشجار.
- **DTM (نموذج التضاريس)**: سطح الأرض العاري بعد إزالة المباني والنبات.
- **DEM**: مصطلح عام يُستخدم أحياناً بمعنى DTM.

الفرق بين DSM وDTM يعطي **ارتفاع المباني والأشجار**، وهو مفيد في تخطيط المدن.

## مصادرها
- الأقمار الصناعية بالرادار أو بالتصوير المجسم، بدقة عالمية حول 30 م.
- الليدار، وهو الأدق.
- التصوير بالطائرات المسيّرة.
- خطوط الكنتور ونقاط المناسيب.

## مشتقات مهمة
- **الانحدار (Slope)**: بالدرجات أو النسبة المئوية.
- **اتجاه الانحدار (Aspect)**: الجهة التي يواجهها السفح.
- **التظليل (Hillshade)**: يعطي إحساساً بالتضاريس عند وضعه تحت الطبقات.
- **خطوط الكنتور**.
- **مجال الرؤية (Viewshed)**: ما يمكن رؤيته من نقطة معينة، مثل اختيار موقع برج اتصالات.
- **الاشتقاقات الهيدرولوجية** كاتجاه الجريان.

## تنبيه
لحساب الانحدار بشكل صحيح يجب أن تكون وحدات الارتفاع والمسافة الأفقية متوافقة، أي أن يكون النموذج في نظام إحداثيات مسقط بالأمتار.', 4),
  ('buffer-analysis', 'analysis', 'المنطقة العازلة (Buffer): أبسط تحليل وأكثره استخداماً', 'Buffer analysis', 'كم مدرسة تقع في حدود 500 م من الطريق السريع؟ هكذا تجيب بالمنطقة العازلة.', 'المنطقة العازلة هي مساحة بمسافة محددة حول معلم: نقطة أو خط أو مضلع.

## أمثلة
- نطاق 500 م حول المدارس لمنع أنشطة معينة.
- حرم 50 م على جانبي الوادي.
- نطاق خدمة 1 كم حول المراكز الصحية.

## خيارات مهمة
- **مسافة ثابتة** أو **متغيرة** حسب حقل في الجدول، مثل نطاق أوسع للطرق الرئيسية.
- **حلقات متعددة**: 500 م و1 كم و2 كم معاً.
- **دمج المناطق المتداخلة (Dissolve)** في مضلع واحد أو تركها منفصلة.

## خطأ شائع
إنشاء منطقة عازلة لطبقة إحداثياتها بالدرجات وكتابة 500 كمسافة، فيظن البرنامج أنها 500 درجة. أعد الإسقاط إلى نظام بالأمتار أولاً.

## بعد المنطقة العازلة
غالباً تتبعها خطوة أخرى:
- **اختيار بالموقع**: ما المباني الواقعة داخل النطاق؟
- **قص (Clip)**: استخراج جزء الطبقة داخل النطاق.
- **حساب**: عدد السكان داخل نطاق الخدمة.

## مثال تطبيقي
لتقدير السكان المخدومين بمستشفى: أنشئ نطاقاً حوله، ثم تقاطعه مع طبقة الأحياء ذات بيانات السكان، ثم اجمع السكان مع مراعاة نسبة مساحة كل حي داخل النطاق.', 3),
  ('overlay-analysis', 'analysis', 'تحليل التطابق (Overlay): التقاطع والاتحاد والقص', 'Overlay analysis', 'كيف تجمع طبقتين لتجيب عن سؤال جديد، والفرق بين Intersect وUnion وClip.', 'تحليل التطابق يضع طبقتين فوق بعضهما ويُخرج طبقة جديدة تجمع هندستها وخصائصها.

## العمليات الأساسية
- **Intersect (التقاطع)**: يحتفظ بالأجزاء المشتركة فقط، مع خصائص الطبقتين معاً. مثال: الأراضي الزراعية الواقعة داخل منطقة خطر السيول.
- **Union (الاتحاد)**: يحتفظ بكل الأجزاء من الطبقتين، ويقسمها عند الحدود المشتركة.
- **Clip (القص)**: يقص الطبقة الأولى بحدود الثانية، دون إضافة خصائص الثانية. مثال: استخراج طرق محافظة واحدة.
- **Erase أو Difference (الطرح)**: يحذف من الطبقة الأولى ما يقع داخل الثانية. مثال: الأراضي الصالحة للبناء بعد استبعاد المحميات.

## انتبه
- يجب أن تكون الطبقتان على نفس نظام الإحداثيات.
- الأخطاء الهندسية الصغيرة مثل المضلعات المتقاطعة ذاتياً قد توقف العملية، فاستخدم أداة إصلاح الهندسة (Fix Geometries) قبلها.
- الحقول المحسوبة مثل المساحة لا تُحدّث تلقائياً بعد القص، فأعد حسابها.

## Overlay في البيانات الشبكية
في الرستر يتم التطابق بالحساب بين الخلايا، كجمع طبقات معايير بأوزان مختلفة، وهو أساس تحليل الملاءمة.', 4),
  ('spatial-interpolation', 'analysis', 'الاستيفاء المكاني: تقدير القيم بين النقاط', 'Spatial interpolation', 'IDW وKriging وSpline: كيف تصنع سطحاً متصلاً من قياسات متفرقة؟', 'لدينا قياسات في نقاط محددة، مثل آبار أو محطات رصد، ونريد تقدير القيمة في كل مكان آخر. هذا هو الاستيفاء.

أساسه **قانون توبلر الأول في الجغرافيا**: كل شيء مرتبط بكل شيء، لكن الأشياء القريبة أكثر ارتباطاً من البعيدة.

## أشهر الطرق
- **IDW (معكوس المسافة الموزونة)**: القيمة المقدّرة متوسط موزون للنقاط القريبة، ووزن كل نقطة يقل كلما بعدت. بسيطة وسريعة، لكنها لا تتجاوز أعلى أو أقل قيمة مقاسة، وقد تصنع دوائر حول النقاط.
- **Kriging**: طريقة إحصائية تدرس كيف يتغير التشابه مع المسافة عبر **السيميفاريوجرام**، وتعطي تقديراً لدرجة عدم اليقين في كل موقع.
- **Spline**: تمرر سطحاً أملس عبر النقاط، ومناسبة للظواهر الناعمة.
- **TIN**: مثلثات تصل بين النقاط، وتستخدم كثيراً للارتفاعات.

## نصائح
- عدد النقاط وتوزيعها أهم من الطريقة: النقاط المتكتلة في جهة واحدة تعطي نتائج ضعيفة في الجهات الأخرى.
- اترك بعض النقاط جانباً للتحقق، وقارن القيمة المقدّرة بالمقاسة.
- لا تستوفِ خارج حدود منطقة النقاط بثقة كبيرة.

## أمثلة
منسوب المياه الجوفية، تركيز الملوثات، درجات الحرارة، ملوحة التربة.', 5),
  ('network-analysis', 'analysis', 'تحليل الشبكات: أقصر طريق ومناطق الخدمة', 'Network analysis', 'لماذا لا تكفي المنطقة العازلة الدائرية لقياس الوصول؟ وما الذي يحتاجه تحليل الشبكات؟', 'المنطقة العازلة تقيس المسافة «على خط مستقيم»، لكن الناس يتحركون عبر الطرق. تحليل الشبكات يقيس المسافة أو الزمن الفعلي على شبكة الطرق.

## مكونات الشبكة
- **الحواف (Edges)**: أجزاء الطرق.
- **العقد (Nodes)**: التقاطعات.
- **التكلفة**: الطول أو زمن القيادة.
- **القيود**: الاتجاه الواحد، ومنع الالتفاف.

## أشهر التحليلات
- **أقصر أو أسرع مسار** بين نقطتين.
- **مناطق الخدمة**: المساحة التي يمكن الوصول إليها خلال 10 دقائق من مستشفى مثلاً.
- **أقرب منشأة**: أقرب مركز دفاع مدني لكل حادث.
- **مصفوفة التكلفة**: الزمن بين كل الأحياء وكل المدارس.
- **تخطيط المسارات** لعدة مركبات، كتوزيع الطلبات.

## شروط جودة الشبكة
- الطرق متصلة فعلاً عند التقاطعات، فالخطوط المتقاربة غير المتصلة تقطع الشبكة.
- الجسور والأنفاق لا تُعامل كتقاطعات.
- وجود حقل للسرعة أو التصنيف لحساب الزمن.

## أدوات
في QGIS توجد أدوات Network Analysis ضمن صندوق المعالجة، وفي ArcGIS Pro امتداد Network Analyst. ويمكن البدء ببيانات طرق OpenStreetMap.', 4),
  ('site-suitability', 'analysis', 'تحليل الملاءمة المكانية: أين أفضل موقع؟', 'Site suitability analysis', 'خطوات اختيار أفضل موقع لمدرسة أو مزرعة شمسية بدمج عدة معايير بأوزان.', 'تحليل الملاءمة يجيب عن سؤال: ما أفضل مكان لنشاط معين؟ وهو من أشهر موضوعات مشاريع التخرج.

## الخطوات
1. **حدد الهدف**: مثل موقع محطة طاقة شمسية.
2. **اختر المعايير**: الإشعاع الشمسي، الانحدار، القرب من شبكة الكهرباء، البعد عن المناطق السكنية، استخدام الأرض.
3. **طبقات الاستبعاد**: مناطق ممنوعة تماماً مثل المحميات وحرم الأودية، وتُحذف من البداية.
4. **حوّل كل معيار إلى طبقة شبكية** بنفس حجم الخلية والحدود.
5. **أعد التصنيف إلى مقياس موحد**، مثلاً من 1 إلى 5، حيث 5 الأنسب. مثال: انحدار أقل من 3% يأخذ 5.
6. **حدد الأوزان**: ليست كل المعايير بنفس الأهمية. من الطرق الشائعة **AHP** التي تقارن المعايير زوجاً بزوج.
7. **التطابق الموزون**: اجمع الطبقات مضروبة في أوزانها بحاسبة الرستر.
8. **فسّر النتيجة** وزر أفضل المواقع أو تحقق منها بصور حديثة.

## نصائح
- وثّق سبب كل وزن ومصدره، فلجنة المناقشة ستسأل عنه.
- جرّب تغيير الأوزان قليلاً: إذا تغيرت النتيجة كثيراً فالتحليل حساس ويحتاج تبريراً أقوى.
- استشر مختصاً في المجال لتحديد المعايير والحدود.', 5),
  ('gnss-basics', 'surveying', 'أنظمة الملاحة بالأقمار (GNSS): أكثر من مجرد GPS', 'GNSS basics', 'كيف يحدد جهازك موقعه؟ ولماذا يخطئ الجوال أمتاراً بينما يصل الجهاز المساحي إلى سنتيمترات؟', '**GNSS** مصطلح شامل لأنظمة الملاحة بالأقمار: الأمريكي GPS، والروسي GLONASS، والأوروبي Galileo، والصيني BeiDou. الأجهزة الحديثة تستقبل أكثر من نظام معاً فتتحسن الدقة.

## كيف يعمل؟
كل قمر يبث إشارة فيها وقت الإرسال وموقعه. يحسب المستقبل المسافة لكل قمر من زمن وصول الإشارة. يلزم **4 أقمار على الأقل**: ثلاثة لتحديد الموقع ثلاثي الأبعاد، والرابع لتصحيح خطأ ساعة المستقبل.

## مصادر الخطأ
- تأخر الإشارة في طبقات الغلاف الجوي.
- انعكاس الإشارة عن المباني (Multipath).
- توزيع الأقمار في السماء، ويقاس بمعامل **DOP**: كلما قل كان أفضل.
- جودة هوائي المستقبل.

## مستويات الدقة
- **الجوال**: عدة أمتار تقريباً.
- **أجهزة GIS المحمولة**: من متر إلى أقل من ذلك.
- **RTK**: سنتيمترات، بالاعتماد على محطة مرجعية قريبة تبث تصحيحات فورية.
- **المعالجة اللاحقة (PPK)**: دقة عالية بعد معالجة البيانات في المكتب.

## نصائح ميدانية
- ابتعد عن المباني العالية والأشجار الكثيفة قدر الإمكان.
- انتظر استقرار الحل قبل تسجيل النقطة.
- سجّل نظام الإحداثيات الذي يعمل عليه الجهاز قبل الخروج.', 5),
  ('total-station', 'surveying', 'المحطة الشاملة (Total Station): أداة المساح الأساسية', 'Total station', 'قياس الزوايا والمسافات بدقة عالية، ومتى نستخدمها بدلاً من GNSS.', 'المحطة الشاملة جهاز مساحي يجمع بين قياس **الزوايا الأفقية والرأسية** و**المسافات** إلكترونياً، ويحسب منها إحداثيات النقاط.

## مبدأ العمل
1. يُنصب الجهاز فوق نقطة معلومة الإحداثيات ويُضبط أفقياً.
2. يُوجَّه إلى نقطة مرجعية ثانية معلومة لتحديد الاتجاه.
3. يُرصد العاكس (المنشور) المحمول على عصا فوق النقطة المطلوبة.
4. يحسب الجهاز الإحداثيات والارتفاع من الزاوية والمسافة.

## الاستخدامات
- الرفع المساحي التفصيلي للمواقع.
- **التوقيع (Stake out)**: نقل نقاط التصميم من المخطط إلى الأرض، مثل أركان المبنى ومحاور الطرق.
- مراقبة هبوط المنشآت وتشوهها.
- الأعمال داخل المباني والأنفاق حيث لا تصل إشارة الأقمار.

## مقارنة مع GNSS
- **المحطة الشاملة**: تحتاج خط رؤية بين الجهاز والعاكس، ودقيقة جداً في المسافات القصيرة، وتعمل حيث تضعف إشارة الأقمار.
- **GNSS**: لا تحتاج خط رؤية بين النقاط، وسريعة في المساحات المفتوحة الواسعة.

في الواقع يستخدم المساحون الاثنين معاً: GNSS لإنشاء نقاط التحكم، والمحطة الشاملة للتفاصيل.

## من الميدان إلى GIS
تُصدّر النقاط غالباً كملف نصي فيه رقم النقطة والإحداثيات والارتفاع والوصف، ثم تُستورد في GIS أو برامج التصميم.', 4),
  ('drone-photogrammetry', 'surveying', 'التصوير بالطائرات المسيّرة: من الصور إلى الخرائط', 'Drone photogrammetry', 'التداخل ونقاط التحكم الأرضية والمنتجات: الصورة المصححة ونموذج السطح والسحابة النقطية.', 'علم **الفوتوغرامتري** يستخرج القياسات من الصور. مع الطائرات المسيّرة صار بالإمكان إنتاج خرائط دقيقة لمواقع صغيرة ومتوسطة بسرعة.

## تخطيط الطيران
- **التداخل**: كل صورة تتداخل مع جارتها، عادة نحو 70 إلى 80% أمامياً و60 إلى 70% جانبياً، حتى يتمكن البرنامج من مطابقة الصور.
- **الارتفاع**: كلما انخفضت الطائرة زادت الدقة المكانية وزاد عدد الصور.
- **GSD**: المسافة الأرضية التي يمثلها البكسل الواحد، مثل 2 سم.

## نقاط التحكم الأرضية (GCP)
علامات واضحة توضع على الأرض وتُرصد إحداثياتها بدقة بجهاز GNSS. تربط النموذج بالموقع الحقيقي وترفع دقته المطلقة كثيراً. وتُترك بعض النقاط **للتحقق** فقط.

## المنتجات
- **الصورة المصححة (Orthomosaic)**: صورة واحدة مصححة هندسياً يمكن القياس عليها.
- **نموذج السطح (DSM)**.
- **السحابة النقطية**: ملايين النقاط ثلاثية الأبعاد.
- **نموذج ثلاثي الأبعاد** للمباني والمواقع.

## الاستخدامات
متابعة تقدم المشاريع، حساب أحجام الحفر والردم، الرفع المساحي للأراضي، توثيق المواقع الأثرية.

## تنبيه نظامي
تشغيل الطائرات المسيّرة يخضع لأنظمة وتصاريح من الجهات المختصة، فتأكد من المتطلبات قبل أي طيران.', 5),
  ('qgis-vs-arcgis', 'tools', 'QGIS أم ArcGIS Pro: بأيهما أبدأ؟', 'QGIS vs ArcGIS Pro', 'مقارنة عملية بين البرنامجين من حيث التكلفة والقدرات وسوق العمل.', 'السؤال الأكثر تكراراً من المبتدئين. الإجابة المختصرة: المفاهيم واحدة، والبرنامج أداة.

## QGIS
- **مجاني ومفتوح المصدر**، ويعمل على Windows وmacOS وLinux.
- مكتبة إضافات ضخمة يطورها مجتمع عالمي.
- يقرأ تقريباً كل صيغ البيانات.
- مناسب جداً للتعلم والمشاريع الفردية والجهات ذات الميزانية المحدودة.

## ArcGIS Pro
- برنامج تجاري من شركة Esri، ويعمل على Windows.
- منظومة متكاملة مع ArcGIS Online وتطبيقات جمع البيانات الميدانية ولوحات المؤشرات.
- منتشر في الجهات الحكومية والشركات الكبيرة.
- يحتاج ترخيصاً، وتتوفر نسخ تجريبية ورخص تعليمية عبر الجامعات أحياناً.

## ماذا يطلب سوق العمل؟
كثير من الوظائف تذكر ArcGIS بالاسم، لكن أصحاب العمل يقدّرون من يفهم المفاهيم ويستطيع التنقل بين الأدوات.

## نصيحتنا
1. ابدأ بـ **QGIS** لتتعلم المفاهيم دون تكلفة.
2. تعلم أساسيات **ArcGIS Pro** قبل التقديم على الوظائف.
3. أضف مهارة ثالثة تميزك: Python أو قواعد البيانات المكانية أو الاستشعار عن بعد.

المهم أن تستطيع شرح لماذا اخترت كل خطوة في تحليلك، لا أين يقع الزر.', 4)
on conflict (slug) do nothing;

insert into public.challenge_questions (level, prompt_ar, options_ar, correct, explanation_ar) values
  (1, 'ماذا يعني الاختصار GIS؟', array['نظام الصور الفضائية', 'نظم المعلومات الجغرافية', 'شبكة الاستشعار الجغرافية', 'نظام تحديد المواقع العالمي']::text[], 1, 'GIS اختصار Geographic Information Systems، أي نظم المعلومات الجغرافية.'),
  (1, 'أي مما يلي يميّز نظم المعلومات الجغرافية عن الخريطة الورقية؟', array['وجود عنوان', 'ربط الموقع ببيانات وصفية قابلة للتحليل', 'الألوان', 'مقياس الرسم']::text[], 1, 'قوة GIS في ربط كل معلم بجدول بيانات يمكن الاستعلام عنه وتحليله.'),
  (1, 'أي جهاز يُستخدم عادة لتحديد الموقع في الميدان؟', array['الماسح الضوئي', 'الطابعة', 'مستقبل GNSS', 'البوصلة فقط']::text[], 2, 'مستقبلات GNSS مثل GPS تحسب الموقع من إشارات الأقمار الصناعية.'),
  (1, 'خط الاستواء يمثل خط العرض:', array['45', '90', '0', '180']::text[], 2, 'خط الاستواء هو خط العرض صفر، ويقسم الأرض إلى نصفين شمالي وجنوبي.'),
  (1, 'خط الطول صفر يُسمى:', array['خط غرينتش', 'مدار السرطان', 'خط الاستواء', 'خط التاريخ الدولي']::text[], 0, 'خط غرينتش هو خط الطول الرئيسي صفر.'),
  (1, 'أي من التالي يُعد مثالاً على بيانات مكانية؟', array['رقم هاتف', 'سعر منتج', 'موقع المدارس على الخريطة', 'قائمة أسماء موظفين']::text[], 2, 'البيانات المكانية مرتبطة بموقع على سطح الأرض.'),
  (1, 'الطبقة (Layer) في GIS هي:', array['اسم الملف فقط', 'مجموعة معالم من نوع واحد تُعرض معاً', 'مقياس الرسم', 'لون الخلفية']::text[], 1, 'نرتب البيانات في طبقات، مثل طبقة طرق وطبقة مدارس، ونعرضها فوق بعضها.'),
  (1, 'أي برنامج من التالي مجاني ومفتوح المصدر لنظم المعلومات الجغرافية؟', array['Photoshop', 'AutoCAD', 'QGIS', 'ArcGIS Pro']::text[], 2, 'QGIS مجاني ومفتوح المصدر ويعمل على أنظمة تشغيل متعددة.'),
  (1, 'اتجاه الشمال في الخريطة يساعد القارئ على:', array['معرفة المسافات', 'معرفة الألوان', 'حساب المساحة', 'تحديد الاتجاهات']::text[], 3, 'سهم الشمال يوضح اتجاه الخريطة بالنسبة للجهات الأصلية.'),
  (1, 'مفتاح الخريطة (Legend) يشرح:', array['اسم المعد', 'حجم الورق', 'معاني الرموز والألوان', 'تاريخ الطباعة']::text[], 2, 'المفتاح يفسر ما يعنيه كل رمز أو لون في الخريطة.'),
  (1, 'أي من التالي ليس من الجهات الأصلية؟', array['الشرق', 'الشمال', 'الشمال الشرقي', 'الجنوب']::text[], 2, 'الجهات الأصلية أربع: الشمال والجنوب والشرق والغرب، والشمال الشرقي جهة فرعية.'),
  (1, 'الصورة الفضائية تُلتقط بواسطة:', array['البوصلة', 'الميزان', 'الأقمار الصناعية', 'المحطة الشاملة']::text[], 2, 'الأقمار الصناعية تحمل مستشعرات تلتقط صوراً لسطح الأرض.'),
  (1, 'أي مما يلي يُعد معلماً نقطياً على خريطة مدينة؟', array['إشارة مرور', 'نهر', 'حدود حي', 'طريق سريع']::text[], 0, 'إشارة المرور تمثل عادة بنقطة، بينما النهر والطريق خطوط والحي مضلع.'),
  (1, 'أي مما يلي يُمثَّل عادة بخط؟', array['طريق', 'بئر', 'مدرسة', 'بحيرة']::text[], 0, 'الطرق تُمثل بخطوط في معظم الخرائط.'),
  (1, 'أي مما يلي يُمثَّل عادة بمضلع؟', array['خط أنابيب', 'قطعة أرض', 'محطة وقود صغيرة على خريطة دولة', 'عمود إنارة']::text[], 1, 'قطعة الأرض لها مساحة وحدود مغلقة فتمثل بمضلع.'),
  (1, 'كلمة «جيومكاني» تعني:', array['مرتبط بالألوان', 'مرتبط بالزمن فقط', 'مرتبط بالأصوات', 'مرتبط بالموقع الجغرافي']::text[], 3, 'الجيومكاني يصف كل ما له علاقة بالموقع على سطح الأرض.'),
  (1, 'أي مما يلي من استخدامات GIS في البلديات؟', array['إدارة رخص البناء على المخططات', 'تصميم الشعارات', 'تحرير الفيديو', 'كتابة الرسائل']::text[], 0, 'البلديات تستخدم GIS لإدارة الأراضي والمخططات والرخص.'),
  (1, 'الخريطة التي تُعرض على الإنترنت ويمكن تكبيرها وتحريكها تُسمى:', array['مخطط يدوي', 'صورة ثابتة', 'خريطة تفاعلية على الويب', 'خريطة ورقية']::text[], 2, 'خرائط الويب التفاعلية تسمح بالتكبير والتحريك والاستعلام.'),
  (1, 'أي من الأسئلة التالية يجيب عنه GIS مباشرة؟', array['ما لونك المفضل؟', 'كم عمرك؟', 'ما أقرب مستشفى لهذا الحي؟', 'ما اسم شركتك؟']::text[], 2, 'أسئلة «أين» و«ما الأقرب» من صميم التحليل المكاني.'),
  (1, 'البيانات الوصفية لطبقة المدارس قد تحتوي على:', array['سهم الشمال', 'اسم المدرسة وعدد الطلاب', 'صورة القمر الصناعي فقط', 'خطوط الكنتور']::text[], 1, 'البيانات الوصفية تصف خصائص كل معلم مثل الاسم والعدد.'),
  (1, 'أي مما يلي من مكونات نظام المعلومات الجغرافية؟', array['الخرائط الورقية فقط', 'البرامج فقط', 'البيانات والأجهزة والبرامج والأفراد والأساليب', 'البيانات فقط']::text[], 2, 'يُعرّف GIS عادة بخمسة مكونات: البيانات، الأجهزة، البرامج، الأفراد، والأساليب.'),
  (1, 'عند تكبير الخريطة (Zoom in) فإننا:', array['نحذف الطبقات', 'نغير البيانات', 'نرى منطقة أصغر بتفاصيل أكثر', 'نرى منطقة أكبر بتفاصيل أقل']::text[], 2, 'التكبير يقربنا من منطقة أصغر فتظهر التفاصيل.'),
  (1, 'أي من التالي ليس مصدراً شائعاً لبيانات GIS؟', array['التعدادات الإحصائية', 'الرفع المساحي', 'الصور الفضائية', 'ألحان موسيقية']::text[], 3, 'مصادر البيانات المكانية تشمل المساحة والصور والإحصاءات وغيرها.'),
  (1, 'الإحداثيات تُستخدم من أجل:', array['تحديد موقع النقطة بدقة', 'كتابة العنوان', 'طباعة الخريطة', 'تلوين الخريطة']::text[], 0, 'الإحداثيات أرقام تحدد مكان النقطة على سطح الأرض.'),
  (1, 'أي العبارات صحيحة عن الخريطة؟', array['تمثيل مصغر ومبسط لسطح الأرض أو جزء منه', 'لا تحتاج مقياس رسم', 'صورة طبق الأصل لكل التفاصيل', 'لا تحتوي رموزاً']::text[], 0, 'الخريطة تبسيط وتصغير للواقع وفق مقياس ورموز.'),
  (1, 'تطبيقات الخرائط في الجوال تعتمد على:', array['الطباعة الورقية', 'البوصلة فقط', 'GIS وتحديد الموقع', 'القياس اليدوي فقط']::text[], 2, 'تطبيقات الملاحة تجمع بين بيانات مكانية وتحديد الموقع بالأقمار.'),
  (1, 'أي مجال لا يستفيد عادة من GIS؟', array['النقل', 'الصحة العامة', 'الزراعة', 'تأليف القصائد']::text[], 3, 'GIS يخدم مجالات كثيرة مرتبطة بالموقع، والتأليف الأدبي ليس منها عادة.'),
  (1, 'خطوط العرض:', array['تقيس الارتفاع', 'تمتد شرقاً وغرباً وموازية لخط الاستواء', 'تمتد من القطب إلى القطب', 'تتقاطع عند القطبين']::text[], 1, 'خطوط العرض دوائر موازية لخط الاستواء.'),
  (1, 'خطوط الطول:', array['موازية لخط الاستواء', 'تقيس الحرارة', 'متساوية الطول مع خط الاستواء', 'تمتد من القطب الشمالي إلى القطب الجنوبي']::text[], 3, 'خطوط الطول أنصاف دوائر تلتقي عند القطبين.'),
  (1, 'أي من التالي يُعد خريطة؟', array['رسم بياني دائري للمبيعات', 'جدول أسعار', 'قائمة أسماء', 'مخطط حي سكني بمقياس رسم']::text[], 3, 'المخطط بمقياس رسم يمثل موقعاً حقيقياً فهو خريطة.'),
  (2, 'مقياس الرسم 1:50,000 يعني أن 1 سم على الخريطة يساوي على الأرض:', array['50 م', '5 كم', '500 م', '50 كم']::text[], 2, '50,000 سم = 500 م.'),
  (2, 'أي المقياسين أكبر؟', array['1:1,000', 'لا يمكن المقارنة', 'متساويان', '1:100,000']::text[], 0, 'الكسر 1/1000 أكبر من 1/100000، فهو مقياس أكبر بتفاصيل أكثر.'),
  (2, 'خريطة دولة كاملة على ورقة A4 تكون عادة بمقياس:', array['لا مقياس لها', 'صغير', 'كبير', '1:1']::text[], 1, 'المناطق الواسعة تُعرض بمقياس صغير.'),
  (2, 'المسافة على خريطة 1:100,000 هي 3 سم، فالمسافة الحقيقية:', array['30 كم', '300 م', '3 كم', '0.3 كم']::text[], 2, '3 × 100,000 = 300,000 سم = 3 كم.'),
  (2, 'أي نوع من مقياس الرسم يبقى صحيحاً إذا كُبّرت الخريطة بالنسخ؟', array['الكسري', 'الخطي', 'الكتابي', 'لا شيء']::text[], 1, 'المقياس الخطي يتغير حجمه مع الخريطة فيبقى صحيحاً.'),
  (2, 'خطوط الكنتور المتقاربة تدل على:', array['أرض مستوية', 'منطقة مبنية', 'انحدار شديد', 'مسطح مائي']::text[], 2, 'تقارب خطوط الكنتور يعني تغيراً كبيراً في الارتفاع خلال مسافة قصيرة.'),
  (2, 'الفاصل الكنتوري هو:', array['طول الخط', 'لون الخط', 'المسافة الأفقية بين خطين', 'الفرق الثابت في الارتفاع بين خطين متجاورين']::text[], 3, 'الفاصل الكنتوري فرق الارتفاع بين كل خط والذي يليه.'),
  (2, 'خطوط الكنتور المغلقة المتداخلة والقيم تزيد نحو المركز تمثل:', array['طريقاً', 'بحيرة', 'وادياً', 'قمة أو تلاً']::text[], 3, 'إذا زادت القيم نحو المركز فهي قمة.'),
  (2, 'عند عبور خطوط الكنتور وادياً، يشير رأس حرف V إلى:', array['أسفل المجرى', 'البحر', 'أعلى المجرى', 'الشمال دائماً']::text[], 2, 'رأس الـV يشير إلى المنبع أي أعلى المجرى.'),
  (2, 'الخريطة الطبوغرافية تهتم أساساً بـ:', array['الكثافة السكانية فقط', 'المناخ فقط', 'الحدود الإدارية فقط', 'التضاريس والمعالم الطبيعية والبشرية']::text[], 3, 'الطبوغرافية تعرض شكل سطح الأرض والمعالم عليه.'),
  (2, 'الخريطة الموضوعية هي خريطة:', array['بلا مفتاح', 'تركز على موضوع واحد مثل السكان', 'بلا ألوان', 'تعرض كل شيء بالتفصيل']::text[], 1, 'الخريطة الموضوعية تركز على ظاهرة محددة.'),
  (2, 'خريطة الكوروبليث مناسبة لعرض:', array['الأعداد المطلقة', 'الطرق', 'النسب والمعدلات مثل الكثافة', 'مواقع النقاط فقط']::text[], 2, 'تلوين المناطق بالأعداد المطلقة مضلل لتأثير المساحة، فالأنسب النسب.'),
  (2, 'لعرض عدد السكان في المدن نستخدم غالباً:', array['خطوط الكنتور', 'تدرج لوني للمساحة', 'الصورة الفضائية', 'الرموز النسبية (دوائر بأحجام مختلفة)']::text[], 3, 'الدوائر النسبية مناسبة للأعداد المطلقة.'),
  (2, 'أي عنصر يجب أن يجيب عن «ماذا وأين ومتى»؟', array['الإطار', 'المفتاح', 'سهم الشمال', 'العنوان']::text[], 3, 'العنوان الجيد يوضح الموضوع والمكان والزمن.'),
  (2, 'ذكر مصدر البيانات في الخريطة مهم لأنه:', array['يوضح موثوقية البيانات وحقوقها', 'يغير الإسقاط', 'يزين الخريطة', 'يكبر المقياس']::text[], 0, 'المصدر يبين من أين جاءت البيانات ويحفظ حقوق أصحابها.'),
  (2, 'خريطة الموقع الصغيرة (Inset/Locator) توضح:', array['الطرق الداخلية', 'مكان منطقة الدراسة من منطقة أوسع', 'الألوان', 'عدد السكان']::text[], 1, 'تساعد القارئ على معرفة موقع المنطقة ضمن الدولة أو الإقليم.'),
  (2, 'لعرض قيم متزايدة (منخفض إلى مرتفع) يُفضل:', array['الأبيض والأسود فقط بالتناوب', 'ألوان مختلفة عشوائية', 'تدرج للون واحد من الفاتح إلى الداكن', 'لون واحد للجميع']::text[], 2, 'التدرج المتسلسل يوحي بالترتيب.'),
  (2, 'لعرض فئات بلا ترتيب مثل أنواع استخدام الأرض يُفضل:', array['خطوط الكنتور', 'تدرج لون واحد', 'ألوان مختلفة واضحة لكل فئة', 'اللون الرمادي فقط']::text[], 2, 'البيانات الاسمية تحتاج ألواناً متمايزة لا توحي بترتيب.'),
  (2, 'طريقة تقسيم الفئات التي تضع نفس عدد المناطق في كل فئة هي:', array['الكوانتايل', 'الانحراف المعياري', 'الفواصل الطبيعية', 'الفترات المتساوية']::text[], 0, 'الكوانتايل يوزع المناطق بالتساوي على الفئات.'),
  (2, 'طريقة Jenks في تقسيم الفئات تعتمد على:', array['البحث عن الفجوات الطبيعية في البيانات', 'اختيار عشوائي', 'تقسيم المدى بالتساوي', 'عدد متساو في كل فئة']::text[], 0, 'الفواصل الطبيعية تقلل التباين داخل الفئة وتزيده بين الفئات.'),
  (2, 'الخريطة الحرارية (Heatmap) تبين:', array['الحدود الإدارية', 'كثافة الأحداث أو النقاط كسطح متدرج', 'اتجاه الشمال', 'درجات الحرارة فقط']::text[], 1, 'رغم اسمها فهي لكثافة النقاط عموماً.'),
  (2, 'خطوط تساوي المطر تُسمى:', array['Isohyets', 'Isotherms', 'Contours', 'Isobars']::text[], 0, 'Isohyets خطوط تساوي المطر، وIsotherms للحرارة، وIsobars للضغط.'),
  (2, 'خطوط تساوي الضغط الجوي تُسمى:', array['Isotherms', 'Isolines للارتفاع', 'Isohyets', 'Isobars']::text[], 3, 'Isobars تصل بين النقاط المتساوية في الضغط.'),
  (2, 'مقياس رسم كتابي: «1 سم يمثل 2 كم» يساوي كسرياً:', array['1:2,000', '1:2,000,000', '1:20,000', '1:200,000']::text[], 3, '2 كم = 200,000 سم.'),
  (2, 'أي مقياس مناسب لمخطط قطعة أرض سكنية؟', array['1:1,000,000', '1:250,000', '1:5,000,000', '1:500']::text[], 3, 'المخططات التفصيلية تحتاج مقياساً كبيراً جداً.'),
  (2, 'الشبكة المرسومة على الخريطة (Graticule) تمثل:', array['الأودية', 'حدود الأحياء', 'خطوط الطول والعرض', 'الطرق']::text[], 2, 'الـGraticule شبكة خطوط الطول والعرض.'),
  (2, 'التظليل التضاريسي (Hillshade) يُستخدم لـ:', array['إعطاء إحساس بالتضاريس', 'تحديد الحدود', 'حساب السكان', 'قياس المطر']::text[], 0, 'يحاكي سقوط الضوء على التضاريس ليظهر الشكل ثلاثي الأبعاد.'),
  (2, 'أي خطأ تصميمي شائع في الخرائط؟', array['استخدام ألوان كثيرة جداً ومتداخلة', 'عنوان واضح', 'ذكر المصدر', 'إضافة مقياس']::text[], 0, 'كثرة الألوان والعناصر تشتت القارئ.'),
  (2, 'الخريطة الجيولوجية تعرض أساساً:', array['السكان', 'المناخ', 'أنواع الصخور وأعمارها والتراكيب', 'الطرق']::text[], 2, 'الألوان فيها تمثل وحدات صخرية وأعماراً جيولوجية.'),
  (2, 'الفرق بين الطقس والمناخ أن المناخ:', array['متوسط حالة الجو لفترة طويلة', 'حالة الجو اليوم', 'لا يمكن رسمه', 'سرعة الرياح فقط']::text[], 0, 'المناخ متوسط طويل المدى غالباً 30 سنة.'),
  (3, 'البيانات الخطية (Vector) تمثل المعالم بـ:', array['نقاط وخطوط ومضلعات', 'خلايا شبكية', 'جداول فقط', 'صور فقط']::text[], 0, 'Vector يستخدم الأشكال الهندسية الثلاثة.'),
  (3, 'البيانات الشبكية (Raster) تتكون من:', array['نص', 'خطوط متصلة', 'شبكة خلايا لكل منها قيمة', 'نقاط فقط']::text[], 2, 'الرستر شبكة بكسلات متساوية.'),
  (3, 'أي نوع بيانات أنسب لتمثيل الارتفاع المتغير تدريجياً؟', array['خطوط فقط', 'Raster', 'جدول نصي', 'Vector نقاط']::text[], 1, 'الظواهر المتصلة تمثل جيداً بالرستر.'),
  (3, 'أي نوع بيانات أنسب لحدود قطع الأراضي؟', array['صورة', 'Raster', 'نقاط', 'Vector مضلعات']::text[], 3, 'الحدود الدقيقة تمثل بالمضلعات.'),
  (3, 'حجم الخلية في الرستر يحدد:', array['لون الطبقة', 'نظام الإحداثيات', 'اسم الملف', 'الدقة المكانية']::text[], 3, 'خلية أصغر تعني تفاصيل أكثر.'),
  (3, 'Shapefile يتطلب على الأقل الملفات:', array['shp وshx وdbf', 'pdf', 'jpg وpng', 'shp فقط']::text[], 0, 'هذه الثلاثة إلزامية، ويُضاف prj لنظام الإحداثيات.'),
  (3, 'أي ملف في Shapefile يحمل نظام الإحداثيات؟', array['.shx', '.prj', '.dbf', '.shp']::text[], 1, 'ملف prj يصف نظام الإحداثيات.'),
  (3, 'أي ملف في Shapefile يحمل جدول البيانات الوصفية؟', array['.prj', '.shx', '.dbf', '.cpg']::text[], 2, 'dbf هو جدول الخصائص.'),
  (3, 'أقصى طول لاسم الحقل في Shapefile:', array['50 حرفاً', 'بلا حد', '255 حرفاً', '10 أحرف']::text[], 3, 'من قيود Shapefile القديمة أن أسماء الحقول لا تتجاوز 10 أحرف.'),
  (3, 'GeoJSON هو:', array['ملف صورة', 'قاعدة بيانات علائقية', 'ملف CAD', 'ملف نصي مبني على JSON']::text[], 3, 'GeoJSON نصي وسهل الاستخدام على الويب.'),
  (3, 'الصيغة التي تحفظ عدة طبقات خطية وشبكية في ملف واحد:', array['CSV', 'GeoPackage', 'KML', 'Shapefile']::text[], 1, 'GeoPackage ملف واحد يحمل عدة طبقات.'),
  (3, 'KML هي صيغة مرتبطة أساساً بـ:', array['Photoshop', 'Google Earth', 'Excel', 'AutoCAD']::text[], 1, 'KML صيغة Google Earth.'),
  (3, 'KMZ هو:', array['قاعدة بيانات', 'نسخة مضغوطة من KML', 'صيغة صوت', 'صيغة رستر']::text[], 1, 'KMZ ملف KML مضغوط.'),
  (3, 'GeoTIFF هو:', array['ملف نصي', 'صورة رستر تحمل معلومات الموقع', 'طبقة خطية', 'جدول']::text[], 1, 'GeoTIFF صيغة رستر شائعة مع معلومات جغرافية مدمجة.'),
  (3, 'ملف CSV يحتوي إحداثيات نقاط، كيف نعرضه كطبقة؟', array['بفتحه في محرر صور', 'لا يمكن', 'بتحويله إلى PDF', 'باستيراده كنص محدد وتحديد عمودي X وY']::text[], 3, 'نستورد الجدول ونحدد أعمدة الإحداثيات ونظامها.'),
  (3, 'عند استيراد CSV بالإحداثيات الجغرافية، العمود X يمثل عادة:', array['الارتفاع', 'خط الطول', 'الاسم', 'خط العرض']::text[], 1, 'X خط الطول (Longitude) وY خط العرض (Latitude).'),
  (3, 'الطبقة الخطية من نوع «نقطة» يمكن أن تحتوي:', array['مضلعات', 'خطوطاً ونقاطاً معاً', 'نقاطاً فقط', 'خلايا']::text[], 2, 'في معظم الصيغ كل طبقة نوع هندسي واحد.'),
  (3, 'Polygon هو:', array['نقطة', 'خلية', 'خط مفتوح', 'شكل مغلق له مساحة']::text[], 3, 'المضلع شكل مغلق يحيط بمساحة.'),
  (3, 'أي عملية تحول الرستر إلى مضلعات؟', array['Clip', 'Polygonize', 'Rasterize', 'Buffer']::text[], 1, 'Polygonize يحول المناطق المتشابهة في الرستر إلى مضلعات.'),
  (3, 'أي عملية تحول الطبقة الخطية إلى رستر؟', array['Polygonize', 'Rasterize', 'Merge', 'Dissolve']::text[], 1, 'Rasterize يحرق المعالم في شبكة خلايا.'),
  (3, 'رستر حجم خليته 30 م مقارنة برستر 10 م:', array['أدق', 'نفس الدقة', 'بلا موقع', 'أقل دقة']::text[], 3, 'الخلية الأكبر تعني تفاصيل أقل.'),
  (3, 'عدد الخلايا في رستر 100 × 100 خلية:', array['1,000', '100', '10,000', '200']::text[], 2, '100 صف × 100 عمود = 10,000 خلية.'),
  (3, 'قيمة NoData في الرستر تعني:', array['خلية بلا بيانات صالحة', 'أعلى قيمة', 'قيمة صفر دائماً', 'لون أسود']::text[], 0, 'NoData تعني أن الخلية ليس لها قيمة معتبرة.'),
  (3, 'الطبقة الخطية من نوع Line تناسب:', array['صورة جوية', 'الأودية والطرق', 'الآبار', 'الأحياء']::text[], 1, 'المعالم الطولية تمثل بالخطوط.'),
  (3, 'الرستر ذو النطاقات المتعددة مثل الصورة الفضائية يسمى:', array['Multi-band', 'Vector', 'Shapefile', 'Single-band']::text[], 0, 'الصور الفضائية تحتوي عدة نطاقات طيفية.'),
  (3, 'الطوبولوجيا في البيانات الخطية تهتم بـ:', array['اسم الطبقة', 'العلاقات المكانية مثل التجاور والاتصال', 'حجم الملف', 'الألوان']::text[], 1, 'الطوبولوجيا تضمن مثلاً عدم وجود فجوات أو تداخلات بين المضلعات المتجاورة.'),
  (3, 'البيانات الوصفية عن البيانات نفسها (من أنتجها، ومتى، وبأي دقة) تسمى:', array['Legend', 'Raster', 'Metadata', 'Attributes']::text[], 2, 'Metadata بيانات تصف البيانات.'),
  (3, 'أي صيغة تُعد الافتراضية لحفظ الطبقات الجديدة في QGIS الحديث؟', array['Shapefile', 'DXF', 'GeoPackage', 'KML']::text[], 2, 'QGIS يستخدم GeoPackage افتراضياً.'),
  (3, 'ملف DXF يرتبط عادة بـ:', array['برامج التصميم الهندسي CAD', 'خرائط الويب', 'الصور الفضائية', 'الجداول']::text[], 0, 'DXF صيغة تبادل لملفات CAD.'),
  (3, 'أي العبارات صحيحة؟', array['الـVector لا يحتوي إحداثيات', 'الرستر يمكن أن يمثل قيماً مستمرة أو فئات', 'الـVector لا يحمل بيانات وصفية', 'الرستر لا يمكن أن يمثل فئات']::text[], 1, 'الرستر يمثل قيماً متصلة كالارتفاع أو فئات كالغطاء الأرضي.'),
  (4, 'نظام WGS84 رمزه في EPSG هو:', array['EPSG:32638', 'EPSG:3857', 'EPSG:4326', 'EPSG:2318']::text[], 2, 'EPSG:4326 هو الإحداثيات الجغرافية على WGS84.'),
  (4, 'وحدة الإحداثيات في نظام جغرافي مثل WGS84:', array['درجة', 'كيلومتر', 'قدم', 'متر']::text[], 0, 'الأنظمة الجغرافية تستخدم الدرجات.'),
  (4, 'وحدة الإحداثيات في نظام UTM:', array['ميل', 'درجة', 'متر', 'راديان']::text[], 2, 'UTM نظام مسقط بالأمتار.'),
  (4, 'عدد نطاقات UTM حول الأرض:', array['24', '60', '90', '36']::text[], 1, '60 نطاقاً عرض كل منها 6 درجات.'),
  (4, 'عرض نطاق UTM الواحد:', array['10 درجات', '3 درجات', '15 درجة', '6 درجات']::text[], 3, '360 ÷ 60 = 6 درجات.'),
  (4, 'مدينة عند خط طول 46.7 شرقاً تقع في نطاق UTM رقم:', array['37', '38', '39', '36']::text[], 1, '(46.7 + 180) ÷ 6 = 37.8 ← الجزء الصحيح 37 + 1 = 38.'),
  (4, 'مدينة عند خط طول 39.2 شرقاً تقع في نطاق UTM رقم:', array['36', '39', '38', '37']::text[], 3, '(39.2 + 180) ÷ 6 = 36.5 ← 36 + 1 = 37.'),
  (4, 'مدينة عند خط طول 50.1 شرقاً تقع في نطاق UTM رقم:', array['38', '40', '41', '39']::text[], 3, '(50.1 + 180) ÷ 6 = 38.35 ← 38 + 1 = 39.'),
  (4, 'المملكة تقع شمال خط الاستواء، فنختار نطاق UTM:', array['S', 'W', 'لا فرق', 'N']::text[], 3, 'النصف الشمالي يرمز له N مثل 38N.'),
  (4, 'حساب مساحة طبقة إحداثياتها بالدرجات يعطي:', array['نفس النتيجة في UTM', 'قيمة بوحدة الدرجات المربعة بلا معنى عملي', 'نتيجة صحيحة بالأمتار المربعة', 'خطأ دائماً']::text[], 1, 'يجب إعادة الإسقاط إلى نظام بالأمتار قبل حساب المساحات.'),
  (4, 'الفرق بين تعيين النظام (Define) وإعادة الإسقاط (Reproject):', array['التعيين يخبر البرنامج بالنظام دون تغيير الأرقام، وإعادة الإسقاط تحول الأرقام', 'إعادة الإسقاط تحذف البيانات', 'التعيين يحول الأرقام', 'لا فرق']::text[], 0, 'استخدام التعيين بدل التحويل يضع البيانات في مكان خاطئ.'),
  (4, 'المرجع الجيوديسي (Datum) يحدد:', array['مقياس الرسم', 'عدد الطبقات', 'نموذج الأرض وطريقة تثبيته بالنسبة للأرض', 'لون الخريطة']::text[], 2, 'الـDatum يربط المجسم البيضاوي بالأرض الحقيقية.'),
  (4, 'شكل الأرض أقرب إلى:', array['كرة مثالية', 'مكعب', 'أسطوانة', 'مجسم بيضاوي مفلطح عند القطبين']::text[], 3, 'الأرض مفلطحة قليلاً عند القطبين.'),
  (4, 'Ain el Abd 1970 مثال على:', array['برنامج', 'صيغة ملف', 'مرجع جيوديسي محلي', 'قمر صناعي']::text[], 2, 'مرجع محلي استُخدم في المملكة والمنطقة.'),
  (4, 'عرض طبقتين بمرجعين مختلفين دون تحويل صحيح يسبب:', array['إزاحة قد تصل لعشرات أو مئات الأمتار', 'حذف الطبقة', 'لا شيء', 'تغيير الألوان']::text[], 0, 'اختلاف المرجع يعني اختلاف الموقع لنفس الأرقام.'),
  (4, 'إسقاط Web Mercator (EPSG:3857) يُستخدم أساساً في:', array['حساب المساحات الدقيقة', 'المساحة الهندسية', 'خرائط الويب مثل خرائط الإنترنت الشائعة', 'الخرائط الجيولوجية']::text[], 2, 'شائع للعرض على الويب لكنه يشوه المساحات بعيداً عن خط الاستواء.'),
  (4, 'الإسقاط المتطابق (Conformal) يحافظ على:', array['لا شيء', 'الزوايا والأشكال المحلية', 'المساحات', 'كل شيء']::text[], 1, 'مثل ميركاتور وUTM.'),
  (4, 'لخريطة توزيع كثافة سكانية على مستوى قارة نفضل إسقاطاً:', array['ميركاتور', 'متطابقاً', 'بلا إسقاط', 'متساوي المساحة']::text[], 3, 'المقارنة بين المساحات تحتاج حفظها.'),
  (4, 'لماذا تبدو غرينلاند ضخمة في إسقاط ميركاتور؟', array['بسبب الألوان', 'لأنها فعلاً أكبر من أفريقيا', 'لأن ميركاتور يضخم المساحات بعيداً عن خط الاستواء', 'خطأ في البيانات']::text[], 2, 'أفريقيا أكبر من غرينلاند بنحو 14 مرة.'),
  (4, 'الإسقاط المخروطي مناسب عادة لـ:', array['المناطق القطبية', 'خط الاستواء فقط', 'مناطق العروض الوسطى الممتدة شرقاً وغرباً', 'الخرائط الجيولوجية فقط']::text[], 2, 'المخروط يلامس الأرض عند عروض وسطى.'),
  (4, 'الإسقاط السمتي (المستوي) مناسب عادة لـ:', array['لا شيء', 'الدول الممتدة شرقاً وغرباً', 'خط الاستواء', 'المناطق القطبية']::text[], 3, 'المستوي يلامس الأرض عند نقطة كالقطب.'),
  (4, 'أين يجد البرنامج نظام الإحداثيات لملف Shapefile؟', array['ملف .dbf', 'ملف .shx', 'ملف .prj', 'اسم الملف']::text[], 2, 'prj يحمل تعريف النظام.'),
  (4, 'الـ«On-the-fly reprojection» في QGIS يعني:', array['تحويل الملفات الأصلية نهائياً', 'حذف نظام الإحداثيات', 'طباعة الخريطة', 'عرض الطبقات بأنظمة مختلفة معاً بتحويل مؤقت للعرض']::text[], 3, 'العرض يُحوّل مؤقتاً دون تغيير الملفات، لكن التحليل يفضل نظاماً موحداً.'),
  (4, 'درجة خط العرض الواحدة تساوي تقريباً:', array['11 كم', '1 كم', '111 كم', '1,111 كم']::text[], 2, 'حوالي 111 كم تقريباً.'),
  (4, 'طول درجة خط الطول:', array['ثابت في كل مكان', 'يقل كلما اتجهنا نحو القطبين', 'يزيد نحو القطبين', 'صفر عند خط الاستواء']::text[], 1, 'خطوط الطول تتقارب حتى تلتقي عند القطبين.'),
  (4, 'الإحداثيات 24.71, 46.67 تشير غالباً إلى (عرض، طول):', array['أبها', 'جدة', 'الرياض', 'الدمام']::text[], 2, 'تقريباً موقع الرياض.'),
  (4, 'في GeoJSON وفق المواصفة ترتيب الإحداثيات:', array['عرض ثم طول', 'ارتفاع أولاً', 'حسب البرنامج', 'طول ثم عرض']::text[], 3, 'GeoJSON يكتب [longitude, latitude].'),
  (4, 'الإحداثيات بالصيغة 24°42''36" تسمى:', array['UTM', 'MGRS', 'درجات ودقائق وثوانٍ', 'درجات عشرية']::text[], 2, 'DMS: درجات ودقائق وثوانٍ.'),
  (4, 'تحويل 24°30'' إلى درجات عشرية يساوي:', array['24.30', '24.75', '24.5', '24.03']::text[], 2, '30 دقيقة = 0.5 درجة.'),
  (4, 'EPSG هو:', array['قاعدة رموز تعريف لأنظمة الإحداثيات', 'صيغة ملف', 'قمر صناعي', 'برنامج GIS']::text[], 0, 'رموز EPSG تعرّف أنظمة الإحداثيات بأرقام موحدة.'),
  (5, 'في QGIS، أين تجد أدوات التحليل الجاهزة مثل Buffer وClip؟', array['شريط الحالة', 'إعدادات الطباعة', 'صندوق أدوات المعالجة (Processing Toolbox)', 'قائمة Help']::text[], 2, 'Processing Toolbox يجمع مئات الأدوات.'),
  (5, 'لوحة الطبقات (Layers Panel) في QGIS تُستخدم لـ:', array['كتابة الأكواد فقط', 'تحميل البرنامج', 'تغيير اللغة', 'ترتيب الطبقات وإظهارها وإخفاؤها']::text[], 3, 'ترتيب الطبقات يحدد أيها يظهر فوق الأخرى.'),
  (5, 'الطبقة الأعلى في لوحة الطبقات تُعرض:', array['تحت كل الطبقات', 'بشفافية دائماً', 'فوق الطبقات الأخرى', 'لا تظهر']::text[], 2, 'الترتيب من الأعلى للأسفل.'),
  (5, 'لفتح جدول البيانات الوصفية لطبقة في QGIS:', array['Plugins', 'Open Attribute Table', 'Georeferencer', 'Print Layout']::text[], 1, 'بالنقر بزر الفأرة الأيمن على الطبقة ثم Open Attribute Table.'),
  (5, 'أداة تُستخدم لحساب قيم حقل جديد في الجدول:', array['Field Calculator', 'Zoom', 'Identify', 'Pan']::text[], 0, 'حاسبة الحقول تنشئ أو تحدث الحقول بالمعادلات.'),
  (5, 'الدالة $area في حاسبة الحقول بـQGIS تعطي:', array['مساحة المعلم', 'طول الخط', 'الإحداثي X', 'عدد المعالم']::text[], 0, '$area تحسب مساحة المضلع، و$length طول الخط.'),
  (5, 'لاختيار المدارس التي يزيد عدد طلابها على 500 نستخدم:', array['Georeference', 'Merge', 'Select by Expression', 'Buffer']::text[], 2, 'الاستعلام بالخصائص عبر تعبير مثل "students" > 500.'),
  (5, 'لمعرفة الحي الذي تقع فيه كل مدرسة نستخدم:', array['Hillshade', 'Join بالحقول', 'Join مكاني (Join attributes by location)', 'حاسبة الحقول']::text[], 2, 'الربط المكاني يعتمد على الموقع.'),
  (5, 'لربط جدول Excel بطبقة الأحياء يجب وجود:', array['نفس اسم الملف', 'صورة فضائية', 'نفس اللون', 'حقل مشترك بقيم متطابقة']::text[], 3, 'الربط بالحقول يحتاج مفتاحاً مشتركاً.'),
  (5, 'الربط يفشل غالباً إذا كان الحقل المشترك:', array['بنفس الاسم', 'نصياً في جدول ورقمياً في الآخر', 'رقمياً في الجدولين', 'نصياً في الجدولين بقيم متطابقة']::text[], 1, 'اختلاف نوع الحقل أو وجود مسافات زائدة يمنع التطابق.'),
  (5, 'Georeferencer في QGIS يُستخدم لـ:', array['تحميل الإضافات', 'حساب المساحة', 'إعطاء خريطة ممسوحة ضوئياً موقعاً حقيقياً', 'طباعة الخريطة']::text[], 2, 'نحدد نقاط تحكم تربط الصورة بإحداثيات معروفة.'),
  (5, 'Print Layout في QGIS يُستخدم لـ:', array['تصميم الخريطة النهائية للطباعة أو التصدير', 'الاستيفاء', 'التصنيف', 'التحليل الشبكي']::text[], 0, 'فيه نضيف العنوان والمفتاح والمقياس ونصدر PDF.'),
  (5, 'لدمج عدة طبقات من نفس النوع في طبقة واحدة نستخدم:', array['Buffer', 'Difference', 'Merge Vector Layers', 'Clip']::text[], 2, 'Merge يجمع المعالم من عدة طبقات.'),
  (5, 'Dissolve يقوم بـ:', array['تحويل رستر', 'دمج المعالم المتجاورة ذات القيمة المشتركة في معلم واحد', 'حذف الطبقة', 'تقسيم المضلعات']::text[], 1, 'مثل دمج الأحياء حسب المحافظة.'),
  (5, 'أداة Identify Features تعرض:', array['قائمة الإضافات', 'نظام الإحداثيات فقط', 'كل الطبقات', 'خصائص المعلم الذي تنقر عليه']::text[], 3, 'تظهر بيانات المعلم المختار.'),
  (5, 'الإضافات (Plugins) في QGIS:', array['تحذف البيانات', 'تزيد قدرات البرنامج بأدوات إضافية', 'مدفوعة دائماً', 'غير موجودة']::text[], 1, 'مستودع الإضافات يحتوي أدوات كثيرة.'),
  (5, 'QuickMapServices إضافة تُستخدم غالباً لـ:', array['تحليل الشبكات', 'إضافة خرائط أساس من الإنترنت', 'حساب NDVI', 'الطباعة']::text[], 1, 'توفر خلفيات خرائط جاهزة.'),
  (5, 'لحفظ مشروع QGIS بكل طبقاته وإعداداته نحفظ ملف:', array['.csv', '.shp', '.qgz', '.tif']::text[], 2, 'ملف المشروع qgz يحفظ الإعدادات والروابط للطبقات لا البيانات نفسها.'),
  (5, 'إذا نقلت ملف المشروع دون مجلد البيانات فإن:', array['كل شيء يعمل', 'البيانات تُنسخ تلقائياً', 'تُحذف الطبقات الأصلية', 'الطبقات قد تظهر مفقودة']::text[], 3, 'المشروع يحفظ مسارات البيانات لا البيانات نفسها.'),
  (5, 'لتغيير لون الطبقة حسب قيمة حقل نستخدم ترميز:', array['No Symbols', 'Categorized أو Graduated', 'Single Symbol', 'Hillshade']::text[], 1, 'Categorized للفئات وGraduated للقيم المتدرجة.'),
  (5, 'Graduated symbology مناسب لـ:', array['أنواع الطرق', 'قيم رقمية متدرجة مثل الكثافة', 'الألوان العشوائية', 'أسماء الأحياء']::text[], 1, 'يقسم القيم إلى فئات متدرجة.'),
  (5, 'لإظهار أسماء المعالم على الخريطة نستخدم:', array['Merge', 'Labels', 'Clip', 'Buffer']::text[], 1, 'التسميات تعرض قيمة حقل كنص.'),
  (5, 'عند رسم مضلع جديد يجب أولاً:', array['تغيير الإسقاط', 'حذف الطبقة', 'تفعيل وضع التحرير (Toggle Editing)', 'إغلاق البرنامج']::text[], 2, 'التحرير يجب تفعيله ثم الحفظ بعد الانتهاء.'),
  (5, 'الالتقاط (Snapping) أثناء الرسم يفيد في:', array['حذف المعالم', 'تسريع الطباعة', 'ربط الرؤوس بدقة بالمعالم المجاورة', 'تلوين الطبقة']::text[], 2, 'يمنع الفجوات والتداخلات بين المعالم.'),
  (5, 'أداة Fix Geometries تُستخدم عندما:', array['تفشل عمليات التحليل بسبب أخطاء هندسية', 'نريد تغيير الألوان', 'نطبع الخريطة', 'نضيف إضافة']::text[], 0, 'تصلح المضلعات غير الصالحة.'),
  (5, 'تصدير الطبقة بنظام إحداثيات مختلف يتم عبر:', array['تغيير اسم الملف', 'Identify', 'Print Layout', 'Export ← Save Features As مع اختيار CRS']::text[], 3, 'نحفظ نسخة جديدة بالنظام المطلوب.'),
  (5, 'Virtual Layer في QGIS تتيح:', array['الرسم اليدوي', 'كتابة استعلامات SQL على الطبقات', 'تحميل الصور الفضائية', 'طباعة الخرائط']::text[], 1, 'تسمح باستعلامات SQL دون قاعدة بيانات خارجية.'),
  (5, 'أداة Statistics by Categories تعطي:', array['نظام إحداثيات', 'إحصاءات حقل مجمعة حسب فئة', 'خريطة جديدة', 'صورة']::text[], 1, 'مثل مجموع السكان لكل محافظة.'),
  (5, 'لعد النقاط داخل كل مضلع نستخدم:', array['Hillshade', 'Count Points in Polygon', 'Dissolve', 'Buffer']::text[], 1, 'تضيف حقلاً بعدد النقاط داخل كل مضلع.'),
  (5, 'لإنشاء نقاط مركزية للمضلعات نستخدم:', array['Merge', 'Clip', 'Centroids', 'Buffer']::text[], 2, 'Centroids تنشئ نقطة في مركز كل مضلع.'),
  (6, 'GNSS اختصار يشمل:', array['الطائرات المسيّرة', 'الخرائط الورقية', 'كل أنظمة الملاحة بالأقمار مثل GPS وGLONASS وGalileo وBeiDou', 'GPS فقط']::text[], 2, 'GNSS المصطلح العام لأنظمة الملاحة بالأقمار.'),
  (6, 'الحد الأدنى من الأقمار لتحديد موقع ثلاثي الأبعاد:', array['3', '6', '2', '4']::text[], 3, 'ثلاثة للموقع ورابع لتصحيح ساعة المستقبل.'),
  (6, 'معامل DOP يقيس:', array['جودة توزيع الأقمار هندسياً في السماء', 'عدد المستخدمين', 'قوة البطارية', 'لون الإشارة']::text[], 0, 'كلما قل DOP كان التوزيع أفضل والدقة أعلى.'),
  (6, 'Multipath هو خطأ ناتج عن:', array['ضعف البطارية', 'الألوان', 'خطأ في الخريطة', 'انعكاس الإشارة عن المباني والأسطح']::text[], 3, 'الإشارة المنعكسة تصل متأخرة فتسبب خطأ.'),
  (6, 'تقنية RTK تعطي دقة تقارب:', array['مليمترات دائماً', 'سنتيمترات', 'عدة أمتار', 'كيلومترات']::text[], 1, 'بتصحيحات فورية من محطة مرجعية.'),
  (6, 'RTK يعتمد على:', array['خريطة ورقية', 'محطة مرجعية تبث تصحيحات فورية', 'صورة فضائية', 'بوصلة']::text[], 1, 'المحطة المرجعية معلومة الإحداثيات وتحسب الأخطاء.'),
  (6, 'PPK يختلف عن RTK في أن التصحيح:', array['بالبوصلة', 'فوري في الميدان', 'يتم بعد الرصد بالمعالجة اللاحقة', 'لا يوجد']::text[], 2, 'Post-Processed Kinematic.'),
  (6, 'دقة GPS في الجوال عادة:', array['عدة أمتار تقريباً', 'مليمترات', 'كيلومترات', 'سنتيمترات']::text[], 0, 'تتأثر بجودة الهوائي والبيئة المحيطة.'),
  (6, 'المحطة الشاملة تقيس:', array['الحرارة', 'الرطوبة', 'الإشعاع', 'الزوايا والمسافات']::text[], 3, 'تجمع قياس الزوايا الأفقية والرأسية والمسافات.'),
  (6, 'المحطة الشاملة تحتاج:', array['إنترنت', 'إشارة أقمار', 'صورة فضائية', 'خط رؤية بين الجهاز والعاكس']::text[], 3, 'الرصد بصري إلى المنشور العاكس.'),
  (6, 'التوقيع (Stake out) يعني:', array['حساب المساحة', 'رسم الخريطة', 'نقل نقاط التصميم من المخطط إلى الأرض', 'طباعة التقرير']::text[], 2, 'مثل تحديد أركان المبنى على الطبيعة.'),
  (6, 'نقاط التحكم الأرضية (GCP) تُستخدم لـ:', array['ربط الصور والنماذج بالإحداثيات الحقيقية بدقة', 'تحديد السحب', 'تلوين الصور', 'قياس الحرارة']::text[], 0, 'ترفع الدقة المطلقة للمنتجات.'),
  (6, 'في تصوير الطائرات المسيّرة، التداخل الأمامي الشائع:', array['10%', '75% تقريباً', '100%', '30%']::text[], 1, 'تداخل عالٍ يسمح بمطابقة الصور.'),
  (6, 'GSD في التصوير الجوي يعني:', array['سرعة الطائرة', 'وزن الكاميرا', 'المسافة الأرضية التي يمثلها البكسل', 'عدد الصور']::text[], 2, 'Ground Sample Distance.'),
  (6, 'إذا انخفض ارتفاع طيران الطائرة المسيّرة فإن الـGSD:', array['يختفي', 'يزيد', 'يقل وتزيد الدقة', 'لا يتغير']::text[], 2, 'الاقتراب يجعل البكسل يغطي مساحة أصغر.'),
  (6, 'الصورة المصححة هندسياً من صور المسيّرة تسمى:', array['Hillshade', 'Contour', 'Buffer', 'Orthomosaic']::text[], 3, 'صورة واحدة يمكن القياس عليها.'),
  (6, 'الميزان (Level) في المساحة يُستخدم لقياس:', array['الزوايا الأفقية فقط', 'فروق الارتفاع', 'الإحداثيات الجغرافية', 'المسافات الطويلة']::text[], 1, 'الميزانية تقيس فروق المناسيب.'),
  (6, 'الرفع المساحي يعني:', array['طباعة الخرائط', 'قياس المعالم الموجودة على الطبيعة وتمثيلها', 'رفع الأجهزة', 'شراء الأراضي']::text[], 1, 'جمع بيانات الموقع الحالي.'),
  (6, 'المنسوب يعني:', array['المساحة', 'المسافة الأفقية', 'الارتفاع بالنسبة لمستوى مرجعي', 'الاتجاه']::text[], 2, 'مثل الارتفاع عن متوسط سطح البحر.'),
  (6, 'الارتفاع الذي يعطيه GNSS مباشرة يكون عادة نسبة إلى:', array['سطح الأرض', 'مستوى سطح البحر دائماً', 'أعلى مبنى', 'المجسم البيضاوي']::text[], 3, 'ولتحويله لارتفاع عن سطح البحر نحتاج نموذج الجيويد.'),
  (6, 'الجيويد هو:', array['برنامج', 'سطح يقارب متوسط مستوى سطح البحر ممتداً تحت اليابسة', 'قمر صناعي', 'صيغة ملف']::text[], 1, 'يستخدم كمرجع للارتفاعات.'),
  (6, 'قبل الخروج للرصد بجهاز GNSS يجب التأكد من:', array['نظام الإحداثيات المضبوط في الجهاز', 'حالة الطقس فقط', 'لون الجهاز', 'اسم الموقع فقط']::text[], 0, 'اختلاف النظام يسبب أخطاء عند الدمج لاحقاً.'),
  (6, 'أفضل مكان لرصد نقطة GNSS:', array['مكان مفتوح بعيد عن المباني العالية', 'بين أشجار كثيفة', 'داخل نفق', 'تحت جسر']::text[], 0, 'الرؤية المفتوحة للسماء تحسن الدقة.'),
  (6, 'المضلع المساحي (Traverse) هو:', array['صورة جوية', 'خريطة موضوعية', 'سلسلة نقاط مرصودة متصلة بالزوايا والمسافات', 'قاعدة بيانات']::text[], 2, 'أسلوب لإنشاء نقاط تحكم متتابعة.'),
  (6, 'خطأ الإغلاق في المضلع المغلق يعني:', array['خطأ في الطباعة', 'إغلاق البرنامج', 'لون خاطئ', 'الفرق بين نقطة البداية المحسوبة والمعلومة بعد الدوران']::text[], 3, 'يقيس دقة الرصد ويوزع على الأضلاع.'),
  (6, 'الليدار (LiDAR) يعتمد على:', array['ضوء الشمس فقط', 'نبضات ليزر وقياس زمن ارتدادها', 'الحرارة', 'الصوت']::text[], 1, 'مستشعر نشط يعطي سحابة نقطية دقيقة.'),
  (6, 'السحابة النقطية هي:', array['ملايين النقاط ثلاثية الأبعاد', 'صورة ملونة', 'خريطة ورقية', 'جدول أسماء']::text[], 0, 'ناتج الليدار أو الفوتوغرامتري.'),
  (6, 'تشغيل الطائرات المسيّرة للتصوير يتطلب:', array['الالتزام بالأنظمة والتصاريح المعتمدة', 'لا شيء', 'إذن الجيران فقط', 'شراء برنامج فقط']::text[], 0, 'الطيران يخضع لأنظمة الجهات المختصة.'),
  (6, 'نقطة الثوابت المساحية (Benchmark) هي:', array['حدود حي', 'نقطة معلومة الارتفاع أو الإحداثيات بدقة', 'إشارة مرور', 'مبنى مرتفع']::text[], 1, 'مرجع تبدأ منه أعمال الرصد.'),
  (6, 'الفرق الأساسي بين GNSS والمحطة الشاملة:', array['المحطة تعمل بالأقمار', 'GNSS يقيس الزوايا فقط', 'لا فرق', 'GNSS لا يحتاج خط رؤية بين النقاط، والمحطة تحتاج خط رؤية للعاكس']::text[], 3, 'ولذلك يُستخدمان معاً غالباً.'),
  (7, 'المنطقة العازلة (Buffer) هي:', array['دمج الطبقات', 'تحويل الرستر', 'مساحة بمسافة محددة حول معلم', 'حذف المعالم']::text[], 2, 'تُنشأ حول نقاط أو خطوط أو مضلعات.'),
  (7, 'إنشاء Buffer بمسافة 500 لطبقة بنظام WGS84 دون إعادة إسقاط يعني:', array['500 متر', '500 كيلومتر', '500 درجة تقريباً، وهي نتيجة خاطئة', 'خطأ في البرنامج دائماً']::text[], 2, 'الوحدة تتبع نظام الإحداثيات، فأعد الإسقاط لنظام بالأمتار.'),
  (7, 'Intersect يحتفظ بـ:', array['الأجزاء المشتركة بين الطبقتين مع خصائصهما', 'لا شيء', 'الطبقة الأولى فقط كما هي', 'كل الأجزاء']::text[], 0, 'التقاطع يعطي الجزء المشترك فقط.'),
  (7, 'Union يحتفظ بـ:', array['الطبقة الثانية فقط', 'الأجزاء المشتركة فقط', 'كل أجزاء الطبقتين مقسمة عند الحدود المشتركة', 'النقاط فقط']::text[], 2, 'الاتحاد يحفظ الكل.'),
  (7, 'Clip يقوم بـ:', array['إنشاء مناطق عازلة', 'قص الطبقة بحدود طبقة أخرى دون إضافة خصائص الثانية', 'حذف الطبقة الثانية', 'دمج الخصائص']::text[], 1, 'مثل استخراج طرق محافظة واحدة.'),
  (7, 'لإيجاد الأراضي الصالحة للبناء بعد استبعاد المحميات نستخدم:', array['Difference / Erase', 'Centroids', 'Merge', 'Union']::text[], 0, 'الطرح يحذف ما يقع داخل الطبقة الثانية.'),
  (7, 'Select by Location يختار المعالم بناءً على:', array['علاقتها المكانية بطبقة أخرى', 'اسم الملف', 'قيمة حقل', 'لونها']::text[], 0, 'مثل اختيار المباني التي تتقاطع مع منطقة الخطر.'),
  (7, 'أي علاقة مكانية تعني أن المعلم داخل الآخر بالكامل؟', array['Disjoint', 'Within', 'Crosses', 'Touches']::text[], 1, 'Within: داخل بالكامل.'),
  (7, 'العلاقة Disjoint تعني:', array['متلامسان', 'متطابقان', 'متقاطعان', 'لا يشتركان في أي نقطة']::text[], 3, 'منفصلان تماماً.'),
  (7, 'تحليل نقطة في مضلع (Point in Polygon) يجيب عن:', array['أي مضلع يحتوي كل نقطة', 'الارتفاع', 'طول الطريق', 'اتجاه الجريان']::text[], 0, 'من أساسيات الربط المكاني.'),
  (7, 'أقرب جار (Nearest Neighbor Join) يربط كل معلم بـ:', array['أبعد معلم', 'معلم عشوائي', 'كل المعالم', 'أقرب معلم في طبقة أخرى']::text[], 3, 'مثل أقرب مستشفى لكل حي.'),
  (7, 'لماذا لا تكفي المنطقة العازلة الدائرية لقياس الوصول للخدمات؟', array['لأنها ملونة', 'لأنها بطيئة', 'لا سبب', 'لأن الناس يتحركون عبر الطرق لا في خطوط مستقيمة']::text[], 3, 'تحليل الشبكات يقيس المسافة الفعلية على الطرق.'),
  (7, 'منطقة الخدمة في تحليل الشبكات تعني:', array['المساحة التي يمكن الوصول إليها خلال زمن أو مسافة محددة على الشبكة', 'حدود البلدية', 'دائرة حول النقطة', 'المساحة الإجمالية']::text[], 0, 'مثل 10 دقائق قيادة من مستشفى.'),
  (7, 'شرط أساسي لصحة شبكة الطرق في التحليل:', array['أن تكون رستر', 'أن تكون الخطوط متصلة فعلاً عند التقاطعات', 'أن تكون ملونة', 'أن تكون بصيغة KML']::text[], 1, 'الخطوط غير المتصلة تقطع الشبكة.'),
  (7, 'تحليل الملاءمة المكانية يُستخدم لـ:', array['اختيار أفضل موقع وفق معايير متعددة', 'طباعة الخريطة', 'تصحيح الصور', 'حساب طول الطريق فقط']::text[], 0, 'مثل اختيار موقع مدرسة جديدة.'),
  (7, 'AHP في تحليل الملاءمة يُستخدم لـ:', array['تصحيح الإحداثيات', 'تحميل البيانات', 'تحديد أوزان المعايير بالمقارنة الزوجية', 'رسم الخريطة']::text[], 2, 'Analytic Hierarchy Process.'),
  (7, 'قبل جمع طبقات المعايير في تحليل الملاءمة يجب:', array['حذفها', 'تحويلها إلى PDF', 'تغيير ألوانها', 'إعادة تصنيفها إلى مقياس موحد']::text[], 3, 'حتى تكون قابلة للجمع والمقارنة.'),
  (7, 'طبقات الاستبعاد في تحليل الملاءمة هي:', array['الصور', 'مناطق ممنوعة تماماً تُحذف من البداية', 'الطرق', 'أفضل المناطق']::text[], 1, 'مثل المحميات وحرم الأودية.'),
  (7, 'Spatial Join يختلف عن Join العادي في أنه:', array['يعتمد على اللون', 'لا يضيف خصائص', 'يعتمد على الموقع لا على حقل مشترك', 'يحذف البيانات']::text[], 2, 'الربط المكاني يستخدم العلاقة الهندسية.'),
  (7, 'Voronoi (Thiessen polygons) تقسم المنطقة بحيث:', array['كل الأجزاء متساوية', 'كل جزء أقرب لنقطته من أي نقطة أخرى', 'حسب الحدود الإدارية', 'عشوائياً']::text[], 1, 'تُستخدم لمناطق النفوذ التقريبية.'),
  (7, 'لحساب طول الطرق داخل كل حي نستخدم:', array['Sum Line Lengths', 'Hillshade', 'Georeferencer', 'Buffer']::text[], 0, 'تحسب مجموع أطوال الخطوط داخل كل مضلع.'),
  (7, 'Heatmap / Kernel Density يحسب:', array['الارتفاع', 'طول الخطوط', 'كثافة النقاط على سطح متصل', 'مساحة المضلعات']::text[], 2, 'مثل كثافة الحوادث المرورية.'),
  (7, 'حجم نصف القطر (Bandwidth) في Kernel Density:', array['لا يؤثر', 'يحذف النقاط', 'يغير الإسقاط', 'يحدد مدى نعومة السطح الناتج']::text[], 3, 'نصف قطر أكبر يعطي سطحاً أنعم وأعم.'),
  (7, 'إذا كانت طبقتا التحليل بنظامين مختلفين فالأفضل:', array['حذف إحداهما', 'إعادة إسقاطهما لنظام موحد مناسب قبل التحليل', 'تجاهل ذلك', 'تغيير ألوانهما']::text[], 1, 'يمنع أخطاء الموقع والقياس.'),
  (7, 'بعد عملية Clip تبقى قيمة حقل المساحة المحسوبة سابقاً:', array['قديمة، ويجب إعادة حسابها', 'محذوفة', 'محدثة تلقائياً', 'صفراً']::text[], 0, 'الحقول المحسوبة لا تتحدث تلقائياً.'),
  (7, 'لتقدير السكان داخل نطاق خدمة يقطع الأحياء جزئياً نستخدم:', array['التوزيع حسب نسبة المساحة داخل النطاق', 'عدد الأحياء', 'لا يمكن', 'مجموع سكان كل الأحياء المتقاطعة كاملة']::text[], 0, 'يفترض توزيعاً متساوياً للسكان داخل الحي.'),
  (7, 'Convex Hull هو:', array['خط كنتور', 'أصغر مضلع محدب يحيط بمجموعة نقاط', 'منطقة عازلة', 'نموذج ارتفاع']::text[], 1, 'يشبه شريطاً مطاطياً حول النقاط.'),
  (7, 'Simplify تُستخدم لـ:', array['تغيير الإسقاط', 'تقليل عدد الرؤوس في الخطوط والمضلعات', 'زيادة الدقة', 'إضافة حقول']::text[], 1, 'مفيدة لتخفيف البيانات لعرض الويب.'),
  (7, 'Split Lines at Intersections مفيدة في:', array['طباعة الخريطة', 'تجهيز شبكة الطرق للتحليل', 'تلوين الطرق', 'حذف الطرق']::text[], 1, 'تقسيم الخطوط عند التقاطعات لإنشاء عقد.'),
  (7, 'Points along Lines تقوم بـ:', array['إنشاء مضلعات', 'حذف الخطوط', 'قياس المساحة', 'إنشاء نقاط على مسافات ثابتة على طول الخط']::text[], 3, 'مثل نقاط كل 100 م على طريق.'),
  (8, 'الاستشعار عن بعد هو:', array['تحليل جداول فقط', 'جمع معلومات عن الأرض دون تلامس مباشر', 'قياس بالشريط', 'مقابلات ميدانية']::text[], 1, 'عبر مستشعرات على أقمار أو طائرات.'),
  (8, 'المستشعر السلبي يعتمد على:', array['المغناطيس', 'الصوت', 'إرسال إشارته الخاصة', 'طاقة الشمس المنعكسة أو المنبعثة من السطح']::text[], 3, 'مثل Landsat وSentinel-2.'),
  (8, 'المستشعر النشط مثل الرادار يتميز بـ:', array['عدم وجود صور', 'الحاجة لضوء الشمس', 'الدقة الطيفية العالية فقط', 'العمل ليلاً واختراق السحب']::text[], 3, 'يرسل موجاته ويستقبل الارتداد.'),
  (8, 'النبات السليم يعكس بقوة الأشعة:', array['الحمراء', 'تحت الحمراء القريبة', 'الزرقاء', 'فوق البنفسجية']::text[], 1, 'بنية الأوراق تعكس NIR بقوة.'),
  (8, 'الماء الصافي يظهر في نطاق تحت الأحمر القريب:', array['أخضر', 'ساطعاً جداً', 'داكناً لأنه يمتص الإشعاع', 'أحمر']::text[], 2, 'الماء يمتص معظم الأشعة تحت الحمراء.'),
  (8, 'معادلة NDVI:', array['(Red − NIR) / (Red + NIR)', '(Green − NIR) / (Green + NIR)', 'NIR × Red', '(NIR − Red) / (NIR + Red)']::text[], 3, 'الفرق المعياري بين NIR والأحمر.'),
  (8, 'مدى قيم NDVI:', array['−100 إلى 100', '−1 إلى +1', '0 إلى 100', '0 إلى 255']::text[], 1, 'مؤشر معياري بين −1 و+1.'),
  (8, 'قيم NDVI السالبة غالباً تمثل:', array['نباتاً كثيفاً', 'محاصيل', 'غابات', 'ماء أو سحباً']::text[], 3, 'الماء يعكس الأحمر أكثر من NIR.'),
  (8, 'في Sentinel-2 نطاق الأحمر ونطاق تحت الحمراء القريبة هما:', array['B2 وB3', 'B1 وB9', 'B11 وB12', 'B4 وB8']::text[], 3, 'B4 أحمر وB8 تحت الحمراء القريبة.'),
  (8, 'الدقة المكانية لأفضل نطاقات Sentinel-2:', array['30 م', '10 م', '1 م', '250 م']::text[], 1, 'النطاقات المرئية وNIR بدقة 10 م.'),
  (8, 'الدقة المكانية لمعظم نطاقات Landsat 8 و9 المتعددة الطيف:', array['100 م', '10 م', '1 كم', '30 م']::text[], 3, '30 م، مع نطاق بانكروماتي 15 م.'),
  (8, 'الدقة الزمنية تعني:', array['عدد النطاقات', 'حجم البكسل', 'تكرار زيارة القمر لنفس المكان', 'عدد مستويات السطوع']::text[], 2, 'مهمة لمتابعة التغيرات السريعة.'),
  (8, 'الدقة الإشعاعية 8 بت تعني:', array['8 أمتار', '8 أيام', '256 مستوى سطوع', '8 نطاقات']::text[], 2, '2^8 = 256.'),
  (8, 'الدقة الطيفية تتعلق بـ:', array['مساحة الصورة', 'عدد النطاقات وضيقها', 'تكرار الزيارة', 'حجم البكسل']::text[], 1, 'نطاقات أكثر وأضيق تميز المواد أكثر.'),
  (8, 'في تركيب الألوان الكاذبة الشائع (NIR, Red, Green) يظهر النبات باللون:', array['الأزرق', 'الأسود', 'الأحمر', 'الأخضر']::text[], 2, 'لأن NIR يوضع في قناة الأحمر.'),
  (8, 'التصنيف الموجّه (Supervised) يتطلب:', array['خرائط ورقية', 'لا شيء', 'عينات تدريب يحددها المحلل', 'طائرة مسيّرة']::text[], 2, 'المحلل يحدد أمثلة لكل فئة.'),
  (8, 'التصنيف غير الموجّه يقوم على:', array['تجميع البكسلات آلياً في مجموعات متشابهة طيفياً ثم تسميتها', 'الرسم اليدوي', 'الإحصاءات السكانية', 'عينات تدريب']::text[], 0, 'مثل خوارزمية K-means.'),
  (8, 'مصفوفة الخطأ (Confusion Matrix) تُستخدم لـ:', array['حساب NDVI', 'تصحيح الإسقاط', 'دمج الصور', 'تقييم دقة التصنيف']::text[], 3, 'تقارن التصنيف بنقاط مرجعية.'),
  (8, 'معامل كابا (Kappa) في تقييم التصنيف:', array['يقيس الارتفاع', 'سرعة المعالجة', 'يقيس الاتفاق مع استبعاد أثر الصدفة', 'عدد النطاقات']::text[], 2, 'مؤشر شائع مع الدقة الكلية.'),
  (8, 'التصحيح الجوي (Atmospheric Correction) يهدف إلى:', array['إزالة أثر الغلاف الجوي للحصول على انعكاس السطح', 'تلوين الصورة', 'حذف السحب كلياً', 'تكبير الصورة']::text[], 0, 'مهم عند المقارنة بين صور زمنية مختلفة.'),
  (8, 'دمج الصور (Pan-sharpening) يعني:', array['حذف النطاقات', 'دمج نطاق بانكروماتي عالي الدقة مع نطاقات ملونة أقل دقة', 'قص الصورة', 'تحويل لرستر']::text[], 1, 'لتحسين الوضوح المكاني للصورة الملونة.'),
  (8, 'NDWI يُستخدم أساساً لـ:', array['الحرارة', 'المسطحات المائية والرطوبة', 'الطرق', 'المباني']::text[], 1, 'مؤشر الماء المعياري.'),
  (8, 'النطاق الحراري في الصور يُستخدم لتقدير:', array['عدد السكان', 'الرياح', 'نوع التربة فقط', 'حرارة سطح الأرض']::text[], 3, 'مثل دراسة الجزر الحرارية في المدن.'),
  (8, 'الصور فائقة الطيفية (Hyperspectral) تحتوي:', array['صوراً حرارية فقط', 'نطاقاً واحداً', 'عشرات إلى مئات النطاقات الضيقة', '3 نطاقات فقط']::text[], 2, 'تتيح تمييزاً دقيقاً للمواد.'),
  (8, 'رادار الفتحة التركيبية (SAR) يتميز بـ:', array['اختراق السحب والعمل ليلاً', 'عدم وجود دقة', 'الحاجة للشمس', 'التصوير الملون الطبيعي']::text[], 0, 'مستشعر نشط بالموجات الدقيقة.'),
  (8, 'كشف التغير (Change Detection) يعني:', array['تغيير اسم الملف', 'تغيير الإسقاط', 'تغيير الألوان', 'مقارنة صور لنفس المنطقة في تواريخ مختلفة']::text[], 3, 'مثل رصد الزحف العمراني.'),
  (8, 'عند كشف التغير يُفضل استخدام صور:', array['عليها سحب', 'من نفس الموسم ومصححة بنفس الطريقة', 'بدقات مختلفة دون معالجة', 'من أي موسم']::text[], 1, 'لتقليل الفروق غير الحقيقية.'),
  (8, 'السحب في الصور البصرية:', array['تحجب السطح وتحتاج إلى قناع أو اختيار صور خالية منها', 'تحسن الصورة', 'تزيد NDVI دائماً', 'لا تؤثر']::text[], 0, 'نستخدم أقنعة السحب أو صوراً بتواريخ أخرى.'),
  (8, 'البصمة الطيفية هي:', array['حجم الملف', 'شعار القمر الصناعي', 'نمط انعكاس المادة عبر الأطوال الموجية', 'اسم الصورة']::text[], 2, 'تساعد على تمييز المواد.'),
  (8, 'NDBI مؤشر يُستخدم لإبراز:', array['النبات', 'السحب', 'المناطق المبنية', 'المياه']::text[], 2, 'مؤشر المناطق العمرانية.'),
  (9, 'DSM يمثل:', array['شبكة الطرق', 'السطح بما عليه من مبانٍ وأشجار', 'خطوط الكنتور', 'سطح الأرض العاري']::text[], 1, 'Digital Surface Model.'),
  (9, 'DTM يمثل:', array['سطح الأرض العاري بعد إزالة المباني والنبات', 'المباني فقط', 'المياه فقط', 'السحب']::text[], 0, 'Digital Terrain Model.'),
  (9, 'الفرق بين DSM وDTM يعطي:', array['الانحدار', 'ارتفاع المباني والأشجار', 'الأمطار', 'السكان']::text[], 1, 'يسمى أحياناً نموذج الارتفاع المعياري.'),
  (9, 'Slope من نموذج الارتفاع يعطي:', array['اتجاه السفح', 'تراكم الجريان', 'الإضاءة', 'درجة الانحدار']::text[], 3, 'بالدرجات أو النسبة المئوية.'),
  (9, 'Aspect يعطي:', array['درجة الانحدار', 'الاتجاه الذي يواجهه السفح', 'الارتفاع', 'الحوض المائي']::text[], 1, 'مثل سفح شمالي أو جنوبي.'),
  (9, 'انحدار 100% يساوي:', array['100 درجة', '45 درجة', '90 درجة', '10 درجات']::text[], 1, 'ارتفاع يساوي المسافة الأفقية، أي ظل الزاوية = 1.'),
  (9, 'لحساب الانحدار بشكل صحيح يجب أن يكون النموذج:', array['بنظام مسقط تتوافق فيه وحدات الارتفاع والمسافة', 'بلا نظام', 'بصيغة KML', 'بنظام جغرافي بالدرجات']::text[], 0, 'اختلاف الوحدات يعطي انحدارات خاطئة.'),
  (9, 'Viewshed يحدد:', array['المناطق المرئية من نقطة أو نقاط', 'التربة', 'الأحواض المائية', 'الانحدار']::text[], 0, 'مثل اختيار موقع برج اتصالات.'),
  (9, 'الخطوة الأولى عادة في التحليل الهيدرولوجي من DEM:', array['تحديد الحوض', 'تراكم الجريان', 'رسم الخريطة', 'ملء المنخفضات (Fill Sinks)']::text[], 3, 'لإزالة الحفر الوهمية التي توقف الجريان.'),
  (9, 'Flow Direction يحدد لكل خلية:', array['اتجاه جريان الماء نحو أشد جاراتها انحداراً', 'الارتفاع', 'نوع التربة', 'كمية المطر']::text[], 0, 'أساس بقية الاشتقاقات الهيدرولوجية.'),
  (9, 'Flow Accumulation يحسب:', array['الاتجاه', 'الانحدار', 'عدد الخلايا التي تصب في كل خلية', 'الارتفاع']::text[], 2, 'القيم العالية تمثل المجاري.'),
  (9, 'المجاري تُستخرج من تراكم الجريان بـ:', array['تلوين الخلايا', 'قص النموذج', 'تحديد حد أدنى (Threshold) للتراكم', 'حساب NDVI']::text[], 2, 'الخلايا التي تتجاوز الحد تعتبر مجرى.'),
  (9, 'الحوض المائي (Watershed) هو:', array['بئر', 'سد', 'بحيرة', 'المساحة التي تصرّف مياهها إلى نقطة مخرج واحدة']::text[], 3, 'يحدد انطلاقاً من نقطة المخرج.'),
  (9, 'خط تقسيم المياه يمر غالباً بـ:', array['الطرق', 'المدن', 'بطون الأودية', 'القمم والمرتفعات']::text[], 3, 'يفصل بين الأحواض المتجاورة.'),
  (9, 'رتبة ستريلر للمجاري: التقاء مجريين من الرتبة 1 ينتج:', array['رتبة 1', 'يبقى بلا رتبة', 'رتبة 3', 'رتبة 2']::text[], 3, 'التقاء رتبتين متساويتين يرفع الرتبة بواحد.'),
  (9, 'التقاء مجرى رتبة 2 بمجرى رتبة 1 حسب ستريلر ينتج:', array['رتبة 4', 'رتبة 3', 'رتبة 1', 'رتبة 2']::text[], 3, 'عند اختلاف الرتبتين تبقى الرتبة الأعلى.'),
  (9, 'خطوط الكنتور تُستخرج آلياً من:', array['نموذج الارتفاع الرقمي', 'الصورة الملونة فقط', 'خريطة الطرق', 'جدول السكان']::text[], 0, 'أداة Contour من الرستر.'),
  (9, 'TIN هو:', array['قمر صناعي', 'صيغة صورة', 'مؤشر نباتي', 'شبكة مثلثات غير منتظمة لتمثيل السطح']::text[], 3, 'Triangulated Irregular Network.'),
  (9, 'المقطع الطولي (Profile) يبين:', array['المساحة', 'الألوان', 'عدد السكان', 'تغير الارتفاع على امتداد خط']::text[], 3, 'مفيد لتصميم الطرق والقنوات.'),
  (9, 'حساب الحجم بين سطحين (Cut/Fill) يُستخدم في:', array['تقدير كميات الحفر والردم', 'التصنيف', 'الاستيفاء', 'تحليل الشبكات']::text[], 0, 'مثل أعمال تسوية الموقع.'),
  (9, 'Hillshade يعتمد على:', array['السكان', 'الحرارة', 'الأمطار', 'زاوية واتجاه مصدر إضاءة افتراضي']::text[], 3, 'يحاكي الظلال لإبراز التضاريس.'),
  (9, 'مؤشر الرطوبة الطبوغرافي (TWI) يعتمد على:', array['NDVI فقط', 'الحرارة', 'السكان', 'تراكم الجريان والانحدار']::text[], 3, 'يحدد المناطق المرشحة لتجمع الرطوبة.'),
  (9, 'الدقة المكانية لنماذج الارتفاع العالمية المفتوحة الشائعة تقارب:', array['30 م', '1 م دائماً', '1 سم', '10 كم']::text[], 0, 'مثل SRTM وCopernicus بدقة نحو 30 م.'),
  (9, 'خلايا NoData في نموذج الارتفاع قد تسبب:', array['مشاكل في الاشتقاقات الهيدرولوجية والانحدار', 'لا شيء', 'تحسين النتائج', 'زيادة الدقة']::text[], 0, 'يجب ملؤها أو معالجتها.'),
  (9, 'المخروط الفيضي والأودية الجافة في البيئات الصحراوية تتطلب دراسة:', array['الزلازل فقط', 'مخاطر السيول المفاجئة', 'المد البحري فقط', 'الثلوج']::text[], 1, 'السيول المفاجئة خطر مهم في البيئات الجافة.'),
  (9, 'ارتفاع خلية 620 م وجارتها على بعد 30 م ارتفاعها 605 م، فالانحدار تقريباً:', array['0.5%', '50%', '5%', '15%']::text[], 1, 'الفرق 15 م ÷ 30 م = 0.5 = 50%.'),
  (9, 'لتحديد حوض مائي لسد مقترح نحتاج:', array['صورة ملونة فقط', 'نقطة المخرج عند موقع السد ونموذج الاتجاهات', 'خريطة الطرق', 'عدد السكان']::text[], 1, 'الحوض يحدد من المخرج صعوداً.'),
  (9, 'Sink في نموذج الارتفاع هو:', array['حدود', 'طريق', 'قمة', 'خلية أو مجموعة خلايا محاطة بارتفاعات أعلى بلا مخرج']::text[], 3, 'قد يكون حقيقياً أو خطأ في النموذج.'),
  (9, 'لإنشاء نموذج ارتفاع من نقاط مناسيب نستخدم:', array['Buffer', 'Clip', 'Dissolve', 'الاستيفاء أو TIN']::text[], 3, 'نحوّل النقاط إلى سطح متصل.'),
  (9, 'Curvature (الانحناء) يصف:', array['المساحة', 'اللون', 'تحدب السطح أو تقعره', 'الحرارة']::text[], 2, 'يؤثر على تركز الجريان وتشتته.'),
  (10, 'PostGIS هو:', array['صيغة صورة', 'برنامج رسم', 'امتداد يضيف قدرات مكانية لقاعدة بيانات PostgreSQL', 'قمر صناعي']::text[], 2, 'يضيف أنواع هندسية ودوال مكانية.'),
  (10, 'في SQL، الأمر الذي يسترجع البيانات هو:', array['INSERT', 'DELETE', 'SELECT', 'UPDATE']::text[], 2, 'SELECT للاستعلام.'),
  (10, 'لتصفية الصفوف حسب شرط نستخدم:', array['GROUP BY', 'LIMIT', 'WHERE', 'ORDER BY']::text[], 2, 'مثل WHERE population > 10000.'),
  (10, 'لترتيب النتائج نستخدم:', array['JOIN', 'WHERE', 'HAVING', 'ORDER BY']::text[], 3, 'ترتيب تصاعدي أو تنازلي.'),
  (10, 'لتجميع الصفوف وحساب مجموع لكل فئة نستخدم:', array['ORDER BY', 'GROUP BY مع SUM', 'LIMIT', 'DISTINCT فقط']::text[], 1, 'مثل مجموع السكان لكل منطقة.'),
  (10, 'دالة PostGIS التي تحسب المسافة بين هندستين:', array['ST_Buffer', 'ST_Distance', 'ST_Union', 'ST_Area']::text[], 1, 'ST_Distance تعطي المسافة بوحدة نظام الإحداثيات.'),
  (10, 'ST_Buffer تُنشئ:', array['مساحة', 'منطقة عازلة', 'نقطة مركزية', 'تقاطعاً']::text[], 1, 'مثل ST_Buffer(geom, 500).'),
  (10, 'ST_Intersects تعيد:', array['المساحة', 'صحيح أو خطأ حسب تقاطع الهندستين', 'مسافة', 'هندسة جديدة دائماً']::text[], 1, 'دالة شرطية تستخدم في WHERE وJOIN.'),
  (10, 'ST_Intersection تعيد:', array['المسافة', 'الهندسة الناتجة عن الجزء المشترك', 'قيمة منطقية', 'عدد النقاط']::text[], 1, 'تختلف عن ST_Intersects التي تعيد قيمة منطقية.'),
  (10, 'ST_Area لمضلع بنظام EPSG:4326 تعطي المساحة بـ:', array['أمتار مربعة', 'هكتارات', 'درجات مربعة', 'كيلومترات']::text[], 2, 'استخدم نوع geography أو أعد الإسقاط للحصول على أمتار.'),
  (10, 'نوع geography في PostGIS يتميز بـ:', array['عدم دعم النقاط', 'الصور فقط', 'حساب المسافات والمساحات بالأمتار على سطح الأرض الكروي', 'الرسم الملون']::text[], 2, 'مناسب للبيانات بخطوط الطول والعرض.'),
  (10, 'ST_Transform تُستخدم لـ:', array['إعادة الإسقاط إلى نظام آخر', 'حذف الهندسة', 'تبسيط الخطوط', 'حساب المساحة']::text[], 0, 'مثل ST_Transform(geom, 32638).'),
  (10, 'SRID يعني:', array['عدد الصفوف', 'رقم تعريف نظام الإحداثيات للهندسة', 'اسم الجدول', 'نوع الحقل']::text[], 1, 'Spatial Reference ID مثل 4326.'),
  (10, 'الفهرس المكاني (GiST) في PostGIS يُستخدم لـ:', array['حذف البيانات', 'تلوين الطبقات', 'تسريع الاستعلامات المكانية', 'تصغير الصور']::text[], 2, 'يحتاجه كل جدول مكاني كبير.'),
  (10, 'ST_DWithin(a, b, 500) تعني:', array['إنشاء منطقة عازلة', 'هل المسافة بين a وb ضمن 500 وحدة', 'حساب المساحة', 'حذف المعالم']::text[], 1, 'أسرع من حساب المسافة ومقارنتها لأنها تستفيد من الفهرس.'),
  (10, 'JOIN في SQL يُستخدم لـ:', array['حذف جدول', 'ترتيب', 'إنشاء فهرس', 'ربط جدولين']::text[], 3, 'ويمكن أن يكون الشرط مكانياً مثل ST_Contains.'),
  (10, 'ST_Contains(a, b) صحيحة عندما:', array['a داخل b', 'a وb متلامسان فقط', 'b داخل a بالكامل', 'a وb منفصلان']::text[], 2, 'المضلع a يحتوي b.'),
  (10, 'ST_Union كدالة تجميعية تقوم بـ:', array['دمج الهندسات في هندسة واحدة', 'ترتيب الصفوف', 'حساب العدد', 'حذف التكرار']::text[], 0, 'تشبه Dissolve.'),
  (10, 'ST_Centroid تعيد:', array['النقطة المركزية للهندسة', 'المساحة', 'المنطقة العازلة', 'المحيط']::text[], 0, 'قد تقع خارج المضلع إذا كان مقعراً.'),
  (10, 'ST_PointOnSurface تضمن أن النقطة:', array['عند الرأس الأول', 'تقع داخل المضلع', 'في المركز الهندسي دائماً', 'خارج المضلع']::text[], 1, 'مفيدة لوضع التسميات.'),
  (10, 'ST_IsValid تتحقق من:', array['حجم الملف', 'نوع الحقل', 'صحة الهندسة مثل عدم تقاطع المضلع مع نفسه', 'اسم الجدول']::text[], 2, 'الهندسات غير الصالحة تفشل في كثير من العمليات.'),
  (10, 'ST_MakeValid تقوم بـ:', array['حذفها', 'إصلاح الهندسات غير الصالحة', 'تحويلها لرستر', 'تبسيطها']::text[], 1, 'تعادل Fix Geometries.'),
  (10, 'أفضل ممارسة لتخزين بيانات المشروع لفريق عمل متعدد المستخدمين:', array['ملفات PDF', 'صور', 'قاعدة بيانات مكانية مركزية مثل PostGIS', 'ملفات Shapefile على أجهزة متفرقة']::text[], 2, 'تسمح بالتحرير المتزامن والصلاحيات والنسخ الاحتياطي.'),
  (10, 'GeoServer يُستخدم لـ:', array['نشر البيانات المكانية كخدمات ويب مثل WMS وWFS', 'التصنيف', 'قياس GNSS', 'تحرير الصور']::text[], 0, 'خادم خرائط مفتوح المصدر.'),
  (10, 'خدمة WMS تعيد:', array['البيانات الخطية نفسها', 'جدولاً فقط', 'ملف صوت', 'صورة للخريطة']::text[], 3, 'Web Map Service ترسل صوراً مرسومة.'),
  (10, 'خدمة WFS تعيد:', array['لا شيء', 'المعالم الخطية مع خصائصها', 'مقاطع فيديو', 'صوراً فقط']::text[], 1, 'Web Feature Service ترسل البيانات نفسها.'),
  (10, 'المعايير المفتوحة لخدمات الخرائط مثل WMS وWFS تصدرها منظمة:', array['W3C فقط', 'OGC', 'ISO فقط', 'IEEE']::text[], 1, 'Open Geospatial Consortium.'),
  (10, 'Tile Service (خرائط البلاطات) تعتمد على:', array['الطباعة', 'PDF', 'إرسال كل البيانات دفعة واحدة', 'تقسيم الخريطة إلى صور صغيرة مسبقة التجهيز لكل مستوى تكبير']::text[], 3, 'تجعل خرائط الويب سريعة.'),
  (10, 'Vector Tiles تختلف عن البلاطات الصورية في أنها:', array['تحمل بيانات خطية تُرسم في المتصفح ويمكن تغيير شكلها', 'صور ثابتة', 'ملفات صوت', 'لا تُستخدم']::text[], 0, 'تتيح تنسيقاً ديناميكياً وحجماً أصغر.'),
  (10, 'استعلام: SELECT COUNT(*) FROM schools s JOIN districts d ON ST_Contains(d.geom, s.geom) WHERE d.name = ''X'' يعطي:', array['أسماء الأحياء', 'عدد المدارس داخل الحي X', 'المسافة بين المدارس', 'مساحة الحي']::text[], 1, 'ربط مكاني ثم عد.'),
  (11, 'مكتبة Python الأشهر للتعامل مع البيانات الخطية كجداول:', array['Matplotlib فقط', 'NumPy فقط', 'GeoPandas', 'Flask']::text[], 2, 'GeoPandas توسع Pandas بعمود هندسي.'),
  (11, 'مكتبة Python للعمليات الهندسية على الأشكال مثل التقاطع والمنطقة العازلة:', array['Shapely', 'Django', 'Pillow', 'Requests']::text[], 0, 'GeoPandas تعتمد عليها داخلياً.'),
  (11, 'مكتبة Python الشائعة لقراءة وكتابة الرستر:', array['Rasterio', 'Pygame', 'Tkinter', 'BeautifulSoup']::text[], 0, 'مبنية فوق GDAL.'),
  (11, 'GDAL هي:', array['قمر صناعي', 'مكتبة أساسية لقراءة وتحويل صيغ البيانات المكانية', 'برنامج رسم', 'قاعدة بيانات']::text[], 1, 'تعتمد عليها برامج كثيرة منها QGIS.'),
  (11, 'لقراءة ملف Shapefile في GeoPandas:', array['gpd.read_file(''file.shp'')', 'gpd.open(''file.shp'')', 'gpd.load(''file.shp'')', 'pd.read_csv(''file.shp'')']::text[], 0, 'read_file تقرأ معظم الصيغ الخطية.'),
  (11, 'لإعادة إسقاط GeoDataFrame:', array['gdf.transform()', 'gdf.project()', 'gdf.set_crs(32638) دائماً', 'gdf.to_crs(epsg=32638)']::text[], 3, 'to_crs يحول الإحداثيات، وset_crs يعيّن النظام فقط.'),
  (11, 'gdf.set_crs يُستخدم عندما:', array['نريد الطباعة', 'البيانات بلا نظام معرّف ونعرف نظامها الصحيح', 'نريد الحذف', 'نريد تحويل الإحداثيات']::text[], 1, 'يعادل Define Projection.'),
  (11, 'لحساب مساحة المضلعات في GeoPandas بالأمتار المربعة:', array['إعادة الإسقاط لنظام بالأمتار ثم gdf.area', 'gdf.length', 'gdf.area مباشرة على WGS84', 'لا يمكن']::text[], 0, 'المساحة تتبع وحدة النظام.'),
  (11, 'gdf.buffer(100) تُنشئ:', array['منطقة عازلة بمسافة 100 بوحدة النظام', 'حذفاً', '100 نقطة', 'تقاطعاً']::text[], 0, 'انتبه للوحدات.'),
  (11, 'الربط المكاني في GeoPandas:', array['gdf.join_space', 'gpd.sjoin', 'pd.merge فقط', 'gpd.link']::text[], 1, 'sjoin يربط حسب العلاقة المكانية.'),
  (11, 'في QGIS يمكن تشغيل أكواد Python عبر:', array['Print Layout', 'Georeferencer', 'Legend', 'Python Console']::text[], 3, 'وتسمى واجهة البرمجة PyQGIS.'),
  (11, 'PyQGIS يتيح:', array['أتمتة مهام QGIS وكتابة أدوات وإضافات', 'تحرير الفيديو', 'إرسال البريد فقط', 'تصميم الشعارات']::text[], 0, 'مفيد للمهام المتكررة.'),
  (11, 'arcpy هي:', array['صيغة ملف', 'إضافة QGIS', 'قاعدة بيانات', 'مكتبة Python لأتمتة ArcGIS']::text[], 3, 'تأتي مع ArcGIS.'),
  (11, 'Model Builder في ArcGIS وGraphical Modeler في QGIS يُستخدمان لـ:', array['بناء سلسلة عمليات مرئياً وتكرارها', 'طباعة التقارير', 'الرسم اليدوي', 'تحميل البيانات فقط']::text[], 0, 'أتمتة دون كتابة كود.'),
  (11, 'أفضل سبب لأتمتة سير العمل:', array['زيادة الأخطاء', 'تعقيد العمل', 'إبطاء التحليل', 'تكرار نفس الخطوات بدقة على بيانات كثيرة وتوثيقها']::text[], 3, 'الأتمتة تقلل الأخطاء البشرية.'),
  (11, 'مكتبة Leaflet تُستخدم لـ:', array['تحليل الرستر', 'قواعد البيانات', 'بناء خرائط ويب تفاعلية بجافاسكربت', 'قراءة GNSS']::text[], 2, 'مكتبة خفيفة وشائعة.'),
  (11, 'في Leaflet، لعرض ملف GeoJSON على الخريطة:', array['L.raster(data)', 'map.loadKML(data)', 'L.shp(data)', 'L.geoJSON(data).addTo(map)']::text[], 3, 'L.geoJSON ترسم المعالم.'),
  (11, 'الإحداثيات في Leaflet عند إنشاء marker تُكتب:', array['[lng, lat]', 'بلا ترتيب', '[lat, lng]', '[x, y] بالأمتار']::text[], 2, 'Leaflet تستخدم عرض ثم طول، بعكس GeoJSON.'),
  (11, 'حلقة for في Python لمعالجة كل الملفات في مجلد تفيد في:', array['الرسم', 'تغيير اللغة', 'الطباعة', 'المعالجة الدفعية (Batch Processing)']::text[], 3, 'تشغيل نفس العملية على ملفات كثيرة.'),
  (11, 'Jupyter Notebook مفيد لأنه:', array['قاعدة بيانات', 'برنامج رسم', 'يجمع الكود والنتائج والشرح في مستند واحد', 'يحذف البيانات']::text[], 2, 'ممتاز للتحليل التجريبي وتوثيقه.'),
  (11, 'Google Earth Engine منصة تُستخدم أساساً لـ:', array['تحرير الخرائط الورقية', 'تحليل كميات ضخمة من الصور الفضائية سحابياً', 'تصميم المباني', 'قياس GNSS']::text[], 1, 'توفر أرشيفات صور وقدرة معالجة سحابية.'),
  (11, 'API هو:', array['صيغة صورة', 'واجهة تسمح لبرنامج بطلب بيانات أو خدمات من برنامج آخر', 'نوع قمر', 'خريطة ورقية']::text[], 1, 'مثل طلب الصور الفضائية برمجياً.'),
  (11, 'JSON هو:', array['قاعدة بيانات', 'لغة برمجة', 'صيغة نصية لتبادل البيانات', 'برنامج GIS']::text[], 2, 'GeoJSON مبني عليها.'),
  (11, 'تخزين مفتاح API سري داخل كود صفحة ويب عامة:', array['مطلوب دائماً', 'ممارسة آمنة', 'خطر لأنه يصبح مكشوفاً لأي زائر', 'لا يهم']::text[], 2, 'المفاتيح السرية مكانها الخادم لا المتصفح.'),
  (11, 'Git يُستخدم لـ:', array['رسم الخرائط', 'إدارة نسخ الكود وتتبع التغييرات', 'قياس الزوايا', 'تحليل الصور']::text[], 1, 'يحفظ تاريخ التعديلات ويسهل التعاون.'),
  (11, 'لرسم خريطة سريعة من GeoDataFrame:', array['gdf.plot()', 'gdf.draw()', 'gdf.map()', 'gdf.show_map()']::text[], 0, 'تعتمد على Matplotlib.'),
  (11, 'gdf[gdf[''population''] > 10000] تقوم بـ:', array['حذف العمود', 'تصفية الصفوف التي سكانها أكثر من 10000', 'حساب المساحة', 'ترتيب الصفوف']::text[], 1, 'تصفية منطقية مثل Pandas.'),
  (11, 'gdf.dissolve(by=''region'') تعادل:', array['Dissolve حسب حقل المنطقة', 'Merge', 'Buffer', 'Clip']::text[], 0, 'تدمج المعالم ذات القيمة المشتركة.'),
  (11, 'لحفظ GeoDataFrame بصيغة GeoPackage:', array['gdf.to_csv(''out.gpkg'')', 'gdf.export_gpkg()', 'gdf.to_file(''out.gpkg'', driver=''GPKG'')', 'gdf.save(''out.gpkg'')']::text[], 2, 'to_file مع تحديد المشغل.'),
  (11, 'في Rasterio، قراءة النطاق الأول من الصورة:', array['src.get(1)', 'src.read(1)', 'src.read(0)', 'src.band[1]']::text[], 1, 'ترقيم النطاقات في Rasterio يبدأ من 1.'),
  (12, 'قانون توبلر الأول في الجغرافيا ينص على أن:', array['كل شيء مرتبط بكل شيء، لكن الأشياء القريبة أكثر ارتباطاً', 'كل الأشياء مستقلة', 'البعيد أهم من القريب', 'المساحة ثابتة']::text[], 0, 'أساس الاستيفاء والإحصاء المكاني.'),
  (12, 'الارتباط الذاتي المكاني (Spatial Autocorrelation) يعني:', array['حجم الملف', 'دقة الصورة', 'خطأ في الإحداثيات', 'تشابه القيم المتجاورة أو اختلافها بشكل غير عشوائي']::text[], 3, 'يقاس بمؤشرات مثل Moran''s I.'),
  (12, 'قيمة Moran''s I موجبة ومعنوية تدل على:', array['توزيع عشوائي', 'تكتل القيم المتشابهة', 'تشتت منتظم', 'خطأ في البيانات']::text[], 1, 'القيم المرتفعة بجوار المرتفعة والمنخفضة بجوار المنخفضة.'),
  (12, 'تحليل البقع الساخنة (Getis-Ord Gi*) يحدد:', array['الحدود', 'الطرق', 'درجات الحرارة فقط', 'مناطق تكتل القيم المرتفعة أو المنخفضة إحصائياً']::text[], 3, 'مثل تكتلات الحوادث المرورية.'),
  (12, 'Kriging يتميز عن IDW بأنه:', array['يعمل بلا بيانات', 'لا يحتاج نقاطاً', 'أبسط دائماً', 'يعطي تقديراً لعدم اليقين ويعتمد على نموذج إحصائي للتباين المكاني']::text[], 3, 'يعتمد على السيميفاريوجرام.'),
  (12, 'السيميفاريوجرام يصف:', array['عدد الطبقات', 'الألوان', 'كيف يتغير الاختلاف بين القيم مع المسافة', 'الارتفاع']::text[], 2, 'أساس Kriging.'),
  (12, 'في السيميفاريوجرام، المدى (Range) هو:', array['أعلى قيمة', 'عدد النقاط', 'الخطأ القياسي', 'المسافة التي بعدها لا يوجد ارتباط مكاني يذكر']::text[], 3, 'بعده تصبح القيم مستقلة تقريباً.'),
  (12, 'IDW لا يمكنه:', array['تقدير قيم أعلى من أعلى قيمة مقاسة أو أقل من أقلها', 'استخدام المسافة', 'الاستيفاء', 'العمل مع النقاط']::text[], 0, 'لأنه متوسط موزون.'),
  (12, 'التحقق المتقاطع (Cross-validation) في الاستيفاء يعني:', array['رسم الخريطة مرتين', 'حذف نقطة وتقديرها من الباقي ومقارنة الخطأ، وتكرار ذلك', 'تغيير الإسقاط', 'دمج الطبقات']::text[], 1, 'يقيس دقة طريقة الاستيفاء.'),
  (12, 'مشكلة الوحدة المساحية القابلة للتعديل (MAUP) تعني:', array['تشوه الإسقاط', 'خطأ في GNSS', 'مشكلة في الطباعة', 'تغير نتائج التحليل بتغير حدود أو حجم الوحدات المساحية']::text[], 3, 'نتائج على مستوى الأحياء قد تختلف عن المحافظات.'),
  (12, 'المغالطة البيئية (Ecological Fallacy) هي:', array['استنتاج خصائص الأفراد من بيانات مجمعة للمنطقة', 'خطأ في المقياس', 'خطأ في الألوان', 'خطأ في الإحداثيات']::text[], 0, 'متوسط الحي لا يصف كل ساكن فيه.'),
  (12, 'الانحدار الجغرافي الموزون (GWR) يتيح:', array['علاقة ثابتة في كل مكان', 'التصنيف', 'أن تختلف العلاقة بين المتغيرات من مكان لآخر', 'الاستيفاء فقط']::text[], 2, 'يعطي معاملات محلية لكل موقع.'),
  (12, 'تحليل نمط النقاط بمؤشر أقرب جار (Average Nearest Neighbor) يحدد ما إذا كان التوزيع:', array['رستر', 'متكتلاً أو عشوائياً أو منتظماً', 'ملوناً', 'مسقطاً']::text[], 1, 'يقارن المسافات الفعلية بالمتوقعة عشوائياً.'),
  (12, 'دقة الموقع (Positional Accuracy) تقاس غالباً بـ:', array['عدد الطبقات', 'RMSE بين الإحداثيات المقاسة والمرجعية', 'حجم الملف', 'عدد الألوان']::text[], 1, 'جذر متوسط مربع الخطأ.'),
  (12, 'اكتمال البيانات (Completeness) كمعيار جودة يعني:', array['حجم الشاشة', 'هل كل المعالم المطلوبة موجودة', 'سرعة البرنامج', 'دقة الألوان']::text[], 1, 'من عناصر جودة البيانات المكانية.'),
  (12, 'التناسق المنطقي (Logical Consistency) يشمل:', array['جمال الخريطة', 'الالتزام بالقواعد الطوبولوجية وأنواع الحقول', 'اسم الملف', 'عدد المستخدمين']::text[], 1, 'مثل عدم تداخل قطع الأراضي.'),
  (12, 'تحليل المسار الأقل تكلفة (Least Cost Path) يعتمد على:', array['الألوان', 'سطح تكلفة يعكس صعوبة الحركة', 'خط مستقيم دائماً', 'المساحة فقط']::text[], 1, 'مثل تخطيط مسار أنبوب حسب الانحدار والتربة.'),
  (12, 'الأتمتة الخلوية وسلاسل ماركوف تُستخدم غالباً في:', array['تصحيح GNSS', 'تحويل الصيغ', 'محاكاة التوسع العمراني المستقبلي', 'الطباعة']::text[], 2, 'تتنبأ بتغير استخدام الأرض.'),
  (12, 'التحليل متعدد المعايير الضبابي (Fuzzy) يختلف بأنه:', array['لا يستخدم معايير', 'يعمل بلا بيانات', 'يستخدم درجات انتماء متدرجة بدل حدود حادة', 'يستخدم نعم أو لا فقط']::text[], 2, 'مناسب للحدود غير الواضحة.'),
  (12, 'تحليل الحساسية في نموذج الملاءمة يعني:', array['حذف المعايير', 'تلوين النتيجة', 'طباعة النتيجة', 'اختبار مدى تغير النتيجة بتغير الأوزان أو المدخلات']::text[], 3, 'يقيس متانة النتائج.'),
  (12, 'Digital Twin (التوأم الرقمي) للمدينة هو:', array['خريطة ورقية', 'صورة واحدة', 'نموذج رقمي ديناميكي يحاكي المدينة ويحدّث ببيانات حية', 'قاعدة بيانات نصية فقط']::text[], 2, 'يجمع GIS ونمذجة المباني وإنترنت الأشياء.'),
  (12, 'BIM يرتبط بـ GIS في:', array['دمج نماذج المباني التفصيلية مع السياق الجغرافي', 'الطقس', 'الملاحة البحرية', 'تحليل الصور فقط']::text[], 0, 'تكامل مهم في المدن الذكية.'),
  (12, 'التعلم الآلي في الاستشعار عن بعد يُستخدم مثلاً في:', array['طباعة الخرائط', 'تغيير الإسقاط', 'استخراج المباني والطرق آلياً من الصور', 'قياس الزوايا']::text[], 2, 'مثل الشبكات العصبية للتجزئة الدلالية.'),
  (12, 'Random Forest في التصنيف:', array['شجرة واحدة', 'إسقاط', 'طريقة استيفاء', 'مجموعة أشجار قرار تصوّت على الفئة']::text[], 3, 'شائع لتصنيف الغطاء الأرضي.'),
  (12, 'عند تقسيم بيانات التدريب والاختبار في التصنيف المكاني يُنصح بـ:', array['استخدام نفس النقاط', 'اختيار نقاط متجاورة جداً', 'مراعاة التباعد المكاني لتجنب تضخيم الدقة بسبب الارتباط الذاتي', 'عدم الاختبار']::text[], 2, 'النقاط المتجاورة متشابهة فتعطي دقة مضللة.'),
  (12, 'Space-Time Cube يُستخدم لتحليل:', array['الارتفاع فقط', 'الألوان', 'الطباعة', 'أنماط الظواهر عبر المكان والزمن معاً']::text[], 3, 'مثل تطور البقع الساخنة عبر السنوات.'),
  (12, 'توثيق سير العمل في مشروع GIS مهم لـ:', array['تكبير الملفات', 'إخفاء الأخطاء', 'لا شيء', 'إمكانية تكرار النتائج ومراجعتها']::text[], 3, 'القابلية للتكرار من أساسيات العمل العلمي.'),
  (12, 'Network Kernel Density يختلف عن Kernel Density العادي بأنه:', array['لا يحتاج شبكة', 'يحسب الكثافة على امتداد شبكة الطرق لا في الفضاء المفتوح', 'أسرع دائماً', 'لا يستخدم النقاط']::text[], 1, 'أنسب لحوادث الطرق.'),
  (12, 'مؤشر LISA يعطي:', array['مؤشرات ارتباط ذاتي محلية لكل وحدة', 'قيمة واحدة للمنطقة كلها', 'الارتفاع', 'الانحدار']::text[], 0, 'Local Indicators of Spatial Association.'),
  (12, 'في تحليل التكلفة والمسافة، سطح التكلفة يُبنى عادة من:', array['طبقات مثل الانحدار واستخدام الأرض بعد إعادة تصنيفها', 'اسم الطبقة', 'الصورة الملونة فقط', 'عدد السكان فقط']::text[], 0, 'كل خلية تمثل صعوبة عبورها.');

