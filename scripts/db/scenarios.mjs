/**
 * اختبارات سيناريو لقاعدة البيانات: نسجّل مستخدمين حقيقيين ونتصرف بأدوارهم
 * (RLS مفعّلة) ونتأكد من القواعد. الاستخدام: npm run db:test
 */
import { freshDb } from './run-migrations.mjs'

const db = await freshDb()
let passed = 0
const failures = []

function ok(cond, msg) {
  if (cond) passed++
  else failures.push(msg)
}
async function throws(fn, pattern, msg) {
  try {
    await fn()
    failures.push(`${msg} — expected an error, got none`)
  } catch (e) {
    if (pattern && !new RegExp(pattern, 'i').test(e.message)) failures.push(`${msg} — wrong error: ${e.message}`)
    else passed++
  }
}
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await q(sql, params))[0]

/** يتصرف كمستخدم (أو زائر إن كان uid فارغاً) */
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
}
async function su() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
}
async function signUp(email, meta) {
  await su()
  return (await one(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify(meta)])).id
}
async function setRole(uid, role) {
  await su()
  await q(`update public.profiles set role = $1 where id = $2`, [role, uid])
}

/* ═══════════ 1. الحسابات والأدوار ═══════════ */
const student = await signUp('student@test.sa', { full_name: 'طالب اختبار', phone: '0551234567', specialization: 'GIS', preferred_lang: 'ar' })
const student2 = await signUp('student2@test.sa', { full_name: 'طالب ثان', phone: '0557654321' })
const admin = await signUp('admin@test.sa', { full_name: 'مدير', phone: '0500000001' })
const teamUser = await signUp('team@test.sa', { full_name: 'عضو فريق', phone: '0500000002' })
const instructor = await signUp('instructor@test.sa', { full_name: 'مدرّب', phone: '0500000003' })
const googleUser = await signUp('google@test.sa', { name: 'Google User', avatar_url: 'https://x/y.png' })

await su()
const p = await one(`select * from public.profiles where id = $1`, [student])
ok(p && p.full_name === 'طالب اختبار' && p.phone === '0551234567' && p.role === 'user', 'signup trigger creates profile with phone and default role')
const g = await one(`select * from public.profiles where id = $1`, [googleUser])
ok(g && g.full_name === 'Google User' && g.phone === null, 'Google signup (no phone) creates profile from "name"')

await throws(() => signUp('bad@test.sa', { full_name: 'x', phone: '12345' }), 'check|constraint|violat', 'invalid phone is rejected at signup')
await throws(() => signUp('dup@test.sa', { full_name: 'x', phone: '0551234567' }), 'duplicate|unique', 'duplicate phone is rejected at signup')

// أول مدير من محرر SQL (auth.uid() فارغ)
await setRole(admin, 'admin')
await setRole(teamUser, 'team')
await setRole(instructor, 'instructor')
ok((await one(`select role from public.profiles where id = $1`, [admin])).role === 'admin', 'first admin can be set from SQL editor')

await as(student)
await throws(() => q(`update public.profiles set role = 'admin' where id = $1`, [student]), 'only admins|42501', 'user cannot promote themselves')
await q(`update public.profiles set full_name = 'طالب معدّل', email = 'hack@x.sa' where id = $1`, [student])
const p2 = await one(`select full_name, email from public.profiles where id = $1`, [student])
ok(p2.full_name === 'طالب معدّل' && p2.email === 'student@test.sa', 'user edits own name; email change is ignored')
ok((await q(`select id from public.profiles`)).length === 1, 'user sees only own profile')
await as(admin)
ok((await q(`select id from public.profiles`)).length === 6, 'admin sees all profiles')
await q(`update public.profiles set role = 'instructor' where id = $1`, [student2])
ok((await one(`select role from public.profiles where id = $1`, [student2])).role === 'instructor', 'admin can change roles')
await q(`update public.profiles set role = 'user' where id = $1`, [student2])

/* ═══════════ 2. الدورات ═══════════ */
await as(admin)
const free = (await one(`insert into public.courses (slug, title_ar, title_en, level, price, hours, is_published, instructor_id)
  values ('qgis-zero', 'QGIS من الصفر', 'QGIS from Zero', 'beginner', 0, 6, true, $1) returning id`, [instructor])).id
const paid = (await one(`insert into public.courses (slug, title_ar, title_en, level, price, hours, is_published)
  values ('arcgis', 'ArcGIS', 'ArcGIS', 'intermediate', 349, 14, true) returning id`)).id
const draftC = (await one(`insert into public.courses (slug, title_ar, title_en, level, is_published) values ('draft', 'مسودة', 'Draft', 'beginner', false) returning id`)).id
const mod = (await one(`insert into public.modules (course_id, title_ar, title_en) values ($1, 'و1', 'M1') returning id`, [free])).id
const lPrev = (await one(`insert into public.lessons (module_id, course_id, title_ar, title_en, position, is_preview) values ($1, $2, 'معاينة', 'Preview', 0, true) returning id`, [mod, free])).id
const lQuiz = (await one(`insert into public.lessons (module_id, course_id, title_ar, title_en, position, has_quiz) values ($1, $2, 'اختبار', 'Quiz', 1, true) returning id`, [mod, free])).id
const lAsg = (await one(`insert into public.lessons (module_id, course_id, title_ar, title_en, position, has_assignment) values ($1, $2, 'تمرين', 'Exercise', 2, true) returning id`, [mod, free])).id
for (const l of [lPrev, lQuiz, lAsg]) await q(`insert into public.lesson_content (lesson_id, body_ar, body_en) values ($1, 'محتوى', 'content')`, [l])
const qq = (await one(`insert into public.quiz_questions (lesson_id, prompt_ar, prompt_en, options) values ($1, 'س', 'Q', '[{"ar":"أ","en":"A"},{"ar":"ب","en":"B"}]') returning id`, [lQuiz])).id
await q(`insert into public.quiz_answer_keys (question_id, correct_index) values ($1, 1)`, [qq])

await as(null)
ok((await q(`select id from public.courses`)).length === 2, 'visitors see only published courses')
ok((await q(`select lesson_id from public.lesson_content`)).length === 1, 'visitors read only the preview lesson content')
ok((await q(`select * from public.quiz_answer_keys`)).length === 0, 'visitors cannot read answer keys')
await throws(() => q(`select public.enroll($1, null)`, [free]), 'permission|not authenticated', 'visitor cannot enroll')

await as(student)
ok((await q(`select * from public.quiz_answer_keys`)).length === 0, 'students never read answer keys')
await throws(() => q(`insert into public.enrollments (user_id, course_id, status) values ($1, $2, 'active')`, [student, paid]), 'row-level|policy|permission', 'students cannot self-activate enrollments')
ok((await one(`select public.enroll($1, null) as s`, [free])).s === 'active', 'free course enrolls as active')
ok((await q(`select lesson_id from public.lesson_content`)).length === 3, 'enrolled student reads all lesson content')
const wrong = (await one(`select public.submit_quiz($1, array[0]) as r`, [lQuiz])).r
ok(wrong.passed === false && wrong.score === 0, 'wrong quiz answer fails (graded on server)')
const right = (await one(`select public.submit_quiz($1, array[1]) as r`, [lQuiz])).r
ok(right.passed === true && right.score === 100, 'correct quiz answer passes')
for (const l of [lPrev, lQuiz, lAsg]) await q(`insert into public.lesson_progress (user_id, lesson_id, course_id) values ($1, $2, $3)`, [student, l, free])
await throws(() => q(`select public.claim_certificate($1)`, [free]), 'requirements', 'no certificate before the exercise is approved')
await q(`insert into public.storage_dummy_check_skip as x select 1`).catch(() => {})
const sub = (await one(`insert into public.assignment_submissions (user_id, lesson_id, course_id, file_path, file_name) values ($1, $2, $3, $4, 'map.pdf') returning id`, [student, lAsg, free, `${student}/x/map.pdf`])).id
await throws(() => q(`update public.assignment_submissions set status = 'approved' where id = $1`, [sub]).then(async () => {
  await su()
  const s = await one(`select status from public.assignment_submissions where id = $1`, [sub])
  if (s.status === 'approved') throw new Error('changed')
  throw new Error('row-level: unchanged')
}), 'row-level|unchanged', 'student cannot approve own exercise')

await as(instructor)
ok((await q(`select id from public.courses`)).length >= 2, 'instructor sees published courses')
ok((await q(`select * from public.quiz_answer_keys`)).length === 1, 'course instructor can read answer keys of own course')
ok((await one(`select full_name from public.profiles where id = $1`, [student]))?.full_name === 'طالب معدّل', 'instructor sees names of own students')
await q(`select public.grade_submission($1, 'approved', 90, 'ممتاز')`, [sub])

await as(student2)
await throws(() => q(`select public.grade_submission($1, 'approved', 100, null)`, [sub]), 'not allowed', 'other users cannot grade')

await as(student)
const code = (await one(`select public.claim_certificate($1) as c`, [free])).c
ok(typeof code === 'string' && code.length === 12, 'certificate issued after all requirements')
ok((await one(`select status from public.enrollments where user_id = $1 and course_id = $2`, [student, free])).status === 'completed', 'enrollment marked completed')
await as(null)
const v = await one(`select * from public.verify_certificate($1)`, [code.toLowerCase()])
ok(v && v.full_name === 'طالب معدّل', 'anyone can verify a certificate (case-insensitive)')
ok(!(await one(`select * from public.verify_certificate('NOPE00000000')`)), 'unknown certificate code returns nothing')

/* ═══════════ 3. الدفع والكوبونات ═══════════ */
await as(admin)
await q(`insert into public.coupons (code, percent_off, scope, max_uses) values ('STUDENT20', 20, 'courses', 1)`)
await q(`update public.site_settings set value = 'مقياس' where key = 'seller_name'`)
await as(student)
ok((await q(`select * from public.coupons`)).length === 0, 'students cannot list coupons')
ok((await one(`select public.enroll($1, null) as s`, [paid])).s === 'pending_payment', 'paid course enrolls as pending payment')
ok((await q(`select lesson_id from public.lesson_content lc join public.lessons l on l.id = lc.lesson_id where l.course_id = $1`, [paid])).length === 0, 'pending enrollment cannot read paid content')
const quote = (await one(`select public.quote_payment('course', $1, 'student20') as q`, [paid])).q
ok(Number(quote.total) === 279.2 && quote.coupon_error === null, 'coupon applies 20% (279.20)')
await throws(() => q(`select public.submit_payment('course', $1, 'STUDENT20', 'someone-else/r.png')`, [paid]), 'invalid receipt', 'receipt path must be in own folder')
const pay = (await one(`select public.submit_payment('course', $1, 'STUDENT20', $2) as id`, [paid, `${student}/r.png`])).id
await throws(() => q(`select public.submit_payment('course', $1, null, $2)`, [paid, `${student}/r2.png`]), 'already', 'no duplicate pending payment')
await throws(() => q(`select public.review_payment($1, true, null)`, [pay]), 'admins only', 'students cannot confirm payments')
await as(admin)
await throws(() => q(`select public.review_payment($1, false, '')`, [pay]), 'reason', 'rejection needs a reason')
await q(`select public.review_payment($1, true, null)`, [pay])
const pr = await one(`select * from public.payments where id = $1`, [pay])
ok(pr.status === 'confirmed' && /^INV-\d{4}-00001$/.test(pr.invoice_number) && Number(pr.vat_amount) === 36.42, 'confirmed payment gets invoice number and VAT 36.42')
ok((await one(`select status from public.enrollments where user_id = $1 and course_id = $2`, [student, paid])).status === 'active', 'confirming payment activates the course')
ok((await one(`select used_count from public.coupons where code = 'STUDENT20'`)).used_count === 1, 'coupon usage counted')
await as(student2)
await q(`select public.enroll($1, null)`, [paid])
ok((await one(`select public.quote_payment('course', $1, 'STUDENT20') as q`, [paid])).q.coupon_error === 'used_up', 'coupon max uses enforced')
ok((await q(`select * from public.payments`)).length === 0, 'users cannot see others’ payments')
await as(admin)
const rev = (await one(`select public.admin_revenue(6) as r`)).r
ok(Array.isArray(rev) && rev.length === 6 && rev.some((m) => Number(m.courses) === 279.2), 'admin revenue counts confirmed payments')
const stats = (await one(`select public.admin_stats(6) as s`)).s
ok(stats.users.total === 6 && stats.certificates === 1, 'admin stats compute')
await as(student)
await throws(() => q(`select public.admin_stats(6)`), 'admins only', 'non-admins cannot read stats')

/* ═══════════ 4. طلبات الخدمات ═══════════ */
await su()
const stCustom = (await one(`select id from public.service_types where slug = 'mapping'`)).id
const stFixed = (await one(`select id from public.service_types where slug = 'consulting'`)).id
const stInstall = (await one(`select id from public.service_types where slug = 'software-install'`)).id
const stGrad = (await one(`select id from public.service_types where slug = 'graduation-guidance'`)).id
await as(student)
await throws(() => q(`insert into public.service_requests (client_id, service_type_id, title, description) values ($1, $2, 'خريطة', 'وصف طويل بما يكفي للطلب هنا')`, [student, stCustom]), 'location required', 'mapping needs a location')
await throws(() => q(`insert into public.service_requests (client_id, service_type_id, title, description) values ($1, $2, 'تخرج', 'وصف طويل بما يكفي للطلب هنا')`, [student, stGrad]), 'pledge', 'graduation guidance needs the academic pledge')
const r1 = await one(`insert into public.service_requests (client_id, service_type_id, title, description, location_lat, location_lng, status, price)
  values ($1, $2, 'خريطة حي', 'وصف طويل بما يكفي للطلب هنا', 24.7, 46.6, 'completed', 1) returning id, status, price, number`, [student, stCustom])
ok(r1.status === 'new' && r1.price === null && Number(r1.number) >= 1001, 'custom request starts as new; client cannot set status or price')
const r2 = await one(`insert into public.service_requests (client_id, service_type_id, title, description) values ($1, $2, 'استشارة', 'وصف طويل بما يكفي للطلب هنا') returning id, status, price`, [student, stFixed])
ok(r2.status === 'awaiting_payment' && Number(r2.price) === 150, 'fixed-price request goes straight to awaiting payment')
await throws(() => q(`select public.request_transition($1, 'in_progress')`, [r2.id]), 'not allowed', 'client cannot start work without paying')
await q(`insert into public.request_messages (request_id, sender_id, body) values ($1, $2, 'مرحبا')`, [r1.id, student])
await throws(() => q(`insert into public.request_messages (request_id, sender_id, body, is_internal) values ($1, $2, 'سر', true)`, [r1.id, student]), 'row-level|policy', 'client cannot post internal notes')

await as(teamUser)
ok((await q(`select id from public.service_requests`)).length === 0, 'team member sees no unassigned requests')
await as(admin)
await q(`select public.assign_request($1, $2)`, [r1.id, teamUser])
await throws(() => q(`select public.assign_request($1, $2)`, [r1.id, student2]), 'not a team member', 'cannot assign to a non-team user')
await q(`select public.request_transition($1, 'awaiting_payment', 450)`, [r1.id])
await q(`select public.request_transition($1, 'in_progress')`, [r1.id])
await as(teamUser)
ok((await q(`select id from public.service_requests`)).length === 1, 'team member sees assigned request')
ok((await one(`select full_name from public.profiles where id = $1`, [student]))?.full_name === 'طالب معدّل', 'team member sees the client name')
await q(`insert into public.request_messages (request_id, sender_id, body, is_internal) values ($1, $2, 'ملاحظة داخلية', true)`, [r1.id, teamUser])
await throws(() => q(`select public.request_transition($1, 'review')`, [r1.id]), 'deliverable', 'mapping needs a final file before review')
await q(`insert into public.request_files (request_id, uploaded_by, kind, name, file_path) values ($1, $2, 'deliverable', 'map.pdf', $3)`, [r1.id, teamUser, `${r1.id}/deliverable/map.pdf`])
await q(`select public.request_transition($1, 'review')`, [r1.id])
await as(student)
ok((await q(`select id from public.request_messages where request_id = $1`, [r1.id])).length === 1, 'client does not see internal notes')
await throws(() => q(`insert into public.request_files (request_id, uploaded_by, kind, name, file_path) values ($1, $2, 'deliverable', 'x', 'x')`, [r1.id, student]), 'row-level|policy', 'client cannot upload deliverables')
await q(`select public.request_transition($1, 'completed')`, [r1.id])
ok((await one(`select status from public.service_requests where id = $1`, [r1.id])).status === 'completed', 'client accepts delivery → completed')
await throws(() => q(`insert into public.request_messages (request_id, sender_id, body) values ($1, $2, 'بعد الإغلاق')`, [r1.id, student]), 'row-level|policy', 'no messages after completion')

// تحميل البرامج: مدفوع، ويُغلق دون ملف نهائي
const r3 = await one(`insert into public.service_requests (client_id, service_type_id, title, description) values ($1, $2, 'تحميل وتثبيت QGIS', 'أرغب في تحميل البرنامج وتثبيته') returning id, status, price`, [student, stInstall])
ok(r3.status === 'awaiting_payment' && Number(r3.price) === 49, 'software install request is paid (49)')
const pay2 = (await one(`select public.submit_payment('request', $1, null, $2) as id`, [r3.id, `${student}/r3.png`])).id
await as(admin)
await q(`select public.review_payment($1, true, null)`, [pay2])
ok((await one(`select status from public.service_requests where id = $1`, [r3.id])).status === 'in_progress', 'confirming request payment starts work')
await q(`select public.assign_request($1, $2)`, [r3.id, teamUser])
await as(teamUser)
await q(`select public.request_transition($1, 'review')`, [r3.id])
ok((await one(`select status from public.service_requests where id = $1`, [r3.id])).status === 'review', 'software support closes without a final file')

/* ═══════════ 5. المنتدى ═══════════ */
await as(student)
const th = (await one(`insert into public.forum_threads (author_id, title, body, author_name, author_role, is_hidden) values ($1, 'سؤال عن QGIS', 'تفاصيل السؤال هنا بما يكفي', 'منتحل', 'admin', true) returning *`, [student]))
ok(th.author_name === 'طالب معدّل' && th.author_role === 'user' && th.is_hidden === false, 'forum stamps real author name/role (no badge spoofing)')
await as(student2)
await q(`insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'رد مفيد')`, [th.id, student2])
await q(`update public.forum_threads set is_hidden = true where id = $1`, [th.id])
await q(`insert into public.forum_reports (thread_id, reporter_id, reason) values ($1, $2, 'سبب البلاغ')`, [th.id, student2])
await as(null)
const anonTh = await one(`select reply_count, is_hidden from public.forum_threads where id = $1`, [th.id])
ok(anonTh && anonTh.reply_count === 1 && anonTh.is_hidden === false, 'visitors read the forum; others cannot hide posts; reply count updates')
await as(admin)
ok((await q(`select * from public.forum_reports`)).length === 1, 'admin sees reports')
await q(`update public.forum_threads set is_locked = true where id = $1`, [th.id])
await as(student)
await throws(() => q(`insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'رد')`, [th.id, student]), 'row-level|policy', 'locked thread rejects replies')

/* ═══════════ 6. الفرص والبرامج والتواصل والإعدادات ═══════════ */
await as(null)
ok((await q(`select * from public.software`)).length === 8, 'visitors see the software list')
ok((await q(`select * from public.software_links`)).length === 0, 'visitors cannot read official download links')
await as(student)
ok((await q(`select * from public.software_links`)).length === 0, 'students cannot read official download links')
await throws(() => q(`insert into public.job_posts (kind, title, organization, description) values ('job', 'وظيفة', 'جهة', 'وصف')`), 'row-level|policy', 'students cannot post jobs')
await throws(() => q(`update public.site_settings set value = 'x' where key = 'bank_iban' returning key`).then((r) => { if (!r.length) throw new Error('row-level: no rows') }), 'row-level', 'students cannot change bank details')
await as(teamUser)
ok((await q(`select * from public.software_links`)).length === 8, 'team can read official download links')
await as(null)
await q(`insert into public.contact_messages (name, email, message) values ('زائر', 'v@x.sa', 'رسالة تواصل للاختبار')`)
ok((await q(`select * from public.contact_messages`)).length === 0, 'visitors can send but not read contact messages')
await as(admin)
ok((await q(`select * from public.contact_messages`)).length === 1, 'admin reads contact messages')
await q(`insert into public.job_posts (kind, title, organization, description, apply_url) values ('coop', 'تدريب', 'جهة', 'وصف', 'mailto:a@b.sa')`)
await as(null)
ok((await q(`select * from public.job_posts`)).length === 1, 'visitors see published jobs')

/* ═══════════ 7. التخزين ═══════════ */
await as(student)
await q(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${student}/a.png`])
await throws(() => q(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${student2}/a.png`]), 'row-level|policy', 'cannot upload a receipt into someone else’s folder')
await as(student2)
ok((await q(`select * from storage.objects where bucket_id = 'receipts'`)).length === 0, 'cannot read other users’ receipts')
await as(admin)
ok((await q(`select * from storage.objects where bucket_id = 'receipts'`)).length === 1, 'admin reads receipts')

/* ═══════════ النتيجة ═══════════ */
console.log(`\n${passed} passed, ${failures.length} failed`)
for (const f of failures) console.log('  ✗ ' + f)
process.exit(failures.length ? 1 : 0)
