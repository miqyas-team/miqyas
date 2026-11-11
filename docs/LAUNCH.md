# إطلاق مقياس — دليل خطوة بخطوة

الكود جاهز للنشر. الخطوات أدناه تحتاج حساباتك أنت (لا أستطيع إنشاء حسابات نيابةً عنك).
**حساب واحد يكفي:** GitHub — ثم تدخل Supabase وCloudflare بزر «Continue with GitHub».

| الخدمة | التكلفة |
|---|---|
| GitHub | مجاني |
| Cloudflare Pages (الاستضافة) | مجاني، ويسمح بالاستخدام التجاري |
| Supabase | مجاني للبداية؛ يُنصح بخطة Pro عند الإطلاق الفعلي (لا يتوقف + نسخ احتياطي) |
| النطاق | مدفوع سنوياً |

---

## 1. GitHub ✅
- الحساب: `miqyas-team`
- مستودع **خاص** فارغ باسم `miqyas` على https://github.com/new — ثم يُرفع الكود إليه.

## 2. Supabase (قاعدة البيانات وتسجيل الدخول)
1. [supabase.com](https://supabase.com) ← **Start your project** ← **Continue with GitHub**.
2. **New project** باسم `miqyas`، كلمة مرور قوية لقاعدة البيانات (احفظها)، المنطقة **Frankfurt**.
   > ⚠️ نظام حماية البيانات الشخصية يضع ضوابط لنقل البيانات خارج المملكة — راجعه مع مستشار.
3. **SQL Editor ← New query** ← الصق محتوى `supabase/ALL_MIGRATIONS.sql` كاملاً ← **Run** ← يجب أن تظهر `Success`.
   - الملف مُختبَر محلياً على Postgres حقيقي (`npm run db:test`: 80 اختباراً).
4. **Project Settings ← API**: انسخ **Project URL** و**anon public** (للخطوة 3).
   > لا تستخدم مفتاح `service_role` في أي مكان من الواجهة.

## 3. Cloudflare Pages (الاستضافة)
1. [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) ← سجّل (أو ادخل بـ GitHub إن ظهر الخيار).
2. **Workers & Pages ← Create ← Pages ← Connect to Git** ← اربط GitHub ← اختر مستودع `miqyas`.
3. إعدادات البناء:
   - **Framework preset:** `Vite` (أو None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Environment variables** (قبل أول نشر):

   | الاسم | القيمة |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL من الخطوة 2 |
   | `VITE_SUPABASE_ANON_KEY` | anon public key من الخطوة 2 |
   | `SITE_URL` | `https://miqyas.sa` (نطاقك) — لخريطة الموقع |
   | `NODE_VERSION` | `22` |

5. **Save and Deploy**. بعد دقيقتين يظهر رابط مثل `miqyas.pages.dev`.
   > إن نسيت مفتاحي Supabase تظهر صفحة «المنصة قيد التجهيز» بدل بيانات وهمية — هذا مقصود.
   > كل تعديل يُرفع إلى GitHub يُنشر تلقائياً.

## 4. ربط النطاق
- Cloudflare Pages ← المشروع ← **Custom domains** ← أضف `miqyas.sa` و`www.miqyas.sa`، واتبع التعليمات (أسهل إن نقلت إدارة DNS للنطاق إلى Cloudflare). شهادة HTTPS تلقائية.

## 5. إعدادات تسجيل الدخول في Supabase
**Authentication ← URL Configuration**
- **Site URL:** `https://miqyas.sa`
- **Redirect URLs:** `https://miqyas.sa/**` و`https://miqyas.pages.dev/**`

**الدخول بـ Google:** اتبع الخطوة 5 في `docs/SUPABASE_SETUP.md`، وأضف نطاقك في Google Cloud.

**البريد (مهم قبل الإطلاق):** بريد Supabase المدمج محدود جداً.
اربط مزوّداً مثل Resend (مجاني حتى نحو 3,000 رسالة شهرياً) من **Authentication ← Emails ← SMTP Settings**، وغيّر قوالب الرسائل للعربية.

## 6. أول مدير
1. سجّل حساباً من المنصة وفعّل بريدك.
2. في **SQL Editor** شغّل (ببريدك):
   ```sql
   update public.profiles set role = 'admin' where email = 'بريدك@example.com';
   ```
3. سجّل الخروج والدخول — تظهر لك لوحة الإدارة.

## 7. قبل فتح المنصة للعموم (من لوحة الإدارة)
- [ ] **المدفوعات ← البنك والمنشأة:** اسم المنشأة، الرقم الضريبي، السجل التجاري، الآيبان، بريد وواتساب التواصل.
- [ ] **الدورات:** أضف أول دورة (المجانية أولاً) وانشرها، وضع روابط فيديو YouTube غير المُدرجة.
- [ ] **المستخدمون:** امنح أعضاء الفريق دور «عضو فريق»، والمدرّبين دور «مدرّب».
- [ ] **البرامج:** راجع روابط التحميل الرسمية (للفريق فقط) والأسعار.
- [ ] **الخدمات:** راجع أسعار الخدمات الثابتة (الاستشارة 150، تحويل البيانات 99، تحميل البرامج 49).
- [ ] روابط التواصل الاجتماعي في `src/data/home.ts`.
- [ ] **مراجعة قانونية** لصفحتي الشروط والأحكام وسياسة الخصوصية.
- [ ] **محاسب:** متطلبات الفوترة الإلكترونية (المرحلة الثانية من «فاتورة»).
- [ ] جرّب بنفسك: تسجيل، اشتراك في دورة مجانية، طلب خدمة، دفع بإيصال، تأكيده من المدير.

## 8. بعد الإطلاق
- Google Search Console: أضف النطاق وأرسل `https://miqyas.sa/sitemap.xml`.
- آراء المتدربين الحقيقية في `src/data/home.ts` وغيّر `testimonialsAreSamples` إلى `false`.
- عند زيادة الزوار: مزوّد خرائط أساس مدفوع (مثل MapTiler).
- المرحلة التالية: الجلسات المباشرة وروابط Zoom، والإشعارات بالبريد.
