# ربط مقياس بـ Supabase — خطوة بخطوة

يستغرق الإعداد قرابة 15 دقيقة. الخطة المجانية تكفي للتطوير والتجربة.

## 1. إنشاء المشروع
1. ادخل [supabase.com](https://supabase.com) وأنشئ حساباً (بنفسك).
2. **New project** ← الاسم: `miqyas`.
3. اختر كلمة مرور قوية لقاعدة البيانات واحفظها في مكان آمن.
4. **المنطقة (Region):** لا توجد منطقة داخل السعودية حالياً؛ أقرب الخيارات عادةً Frankfurt أو Mumbai.
   > ⚠️ نظام حماية البيانات الشخصية (PDPL) يضع اشتراطات على نقل البيانات خارج المملكة. راجعوا ذلك مع مستشار قبل الإطلاق الفعلي.

## 2. إنشاء الجداول
1. من القائمة الجانبية: **SQL Editor** ← **New query**.
2. انسخ محتوى الملف `supabase/migrations/0001_profiles_and_roles.sql` كاملاً والصقه.
3. اضغط **Run**. يجب أن تظهر رسالة `Success`.

## 3. ربط المنصة بالمشروع
1. **Project Settings** ← **API**.
2. في مجلد المشروع، انسخ الملف `.env.example` باسم `.env.local`.
3. ضع فيه:
   - `VITE_SUPABASE_URL` = قيمة **Project URL**
   - `VITE_SUPABASE_ANON_KEY` = قيمة **anon public**
4. أعد تشغيل `npm run dev`.

> ملف `.env.local` لا يُرفع إلى Git. لا تضع أبداً مفتاح **service_role** في هذا الملف أو في كود الواجهة.

## 4. إعدادات تسجيل الدخول
**Authentication** ← **URL Configuration**:
- **Site URL:** `http://localhost:5173` (يُغيَّر إلى النطاق الحقيقي عند الإطلاق)
- **Redirect URLs:** أضف `http://localhost:5173/**`

**Authentication** ← **Providers** ← **Email**: اترك **Confirm email** مفعّلاً.

## 5. الدخول بحساب Google
1. ادخل [Google Cloud Console](https://console.cloud.google.com) وأنشئ مشروعاً.
2. **APIs & Services** ← **OAuth consent screen**: الاسم «مقياس» وبريد الدعم.
3. **Credentials** ← **Create credentials** ← **OAuth client ID** ← نوع **Web application**.
4. في **Authorized redirect URIs** ضع الرابط الذي يظهر في Supabase تحت
   **Authentication** ← **Providers** ← **Google** (يشبه `https://xxxx.supabase.co/auth/v1/callback`).
5. انسخ **Client ID** و**Client Secret** إلى صفحة Google في Supabase وفعّلها.

## 6. تعيين نفسك مديراً
1. سجّل حساباً من المنصة وفعّل بريدك.
2. في **SQL Editor** شغّل (مع بريدك):
   ```sql
   update public.profiles set role = 'admin' where email = 'بريدك@example.com';
   ```
3. سجّل الخروج ثم الدخول. ستظهر لك «لوحة الإدارة».

بعدها يستطيع المدير تغيير أدوار الآخرين (مدرّب، عضو فريق) — ستُضاف شاشة لذلك في لوحة الإدارة (الأمر 6).

## ملاحظة عن الرسائل البريدية
خدمة البريد المدمجة في Supabase محدودة (بضع رسائل في الساعة) ومخصّصة للتجربة. قبل الإطلاق اربطوا مزوّد بريد (مثل Resend أو Amazon SES) من **Authentication** ← **Emails** ← **SMTP Settings**.
