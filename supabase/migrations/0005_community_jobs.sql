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
