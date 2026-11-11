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
