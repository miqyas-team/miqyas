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
