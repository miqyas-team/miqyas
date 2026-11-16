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
