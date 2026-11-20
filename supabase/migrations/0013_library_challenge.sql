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
