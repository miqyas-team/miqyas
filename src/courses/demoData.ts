/**
 * بيانات وضع المعاينة (قبل ربط Supabase).
 * ⚠️ نموذجية للعرض والتجربة فقط — الدورات الحقيقية تُضاف من لوحة الإدارة.
 */
import type { CourseDetail, QuizQuestion } from './types'

const team = { ar: 'فريق مقياس', en: 'Miqyas Team' }
const teamBio = {
  ar: 'مختصون في نظم المعلومات الجغرافية والمساحة، يقدّمون المحتوى بالعربية مع التطبيق على بيانات سعودية.',
  en: 'GIS and surveying specialists teaching in Arabic with practice on Saudi data.',
}

export interface DemoLessonExtra {
  youtubeId: string | null
  body: { ar: string; en: string }
  assignment?: { ar: string; en: string }
  questions?: (QuizQuestion & { correct: number })[]
  attachments?: { id: string; name: string; sizeBytes: number }[]
}

const trueFalse: QuizQuestion['options'] = [
  { ar: 'صح', en: 'True' },
  { ar: 'خطأ', en: 'False' },
]

export const demoCourses: CourseDetail[] = [
  {
    id: 'c-qgis',
    slug: 'qgis-from-zero',
    title: { ar: 'QGIS من الصفر', en: 'QGIS from Zero' },
    summary: {
      ar: 'ابدأ أول خريطة لك ببرنامج مجاني ومفتوح المصدر، خطوة بخطوة.',
      en: 'Make your first map with free, open-source software — step by step.',
    },
    description: {
      ar: 'دورة تأسيسية تأخذك من تثبيت QGIS حتى إخراج خريطة احترافية. تتعلّم أنواع البيانات المكانية، وأنظمة الإحداثيات، والتعامل مع الطبقات، والترميز، وتنتهي بتمرين عملي على بيانات مدينة سعودية.',
      en: 'A foundation course taking you from installing QGIS to producing a professional map: spatial data types, coordinate systems, layers, symbology, and a final exercise on a Saudi city dataset.',
    },
    outcomes: {
      ar: ['تثبيت QGIS وفهم واجهته', 'الفرق بين البيانات الخطية (Vector) والشبكية (Raster)', 'اختيار نظام الإحداثيات المناسب للمملكة', 'ترميز الطبقات وإخراج خريطة للطباعة'],
      en: ['Install QGIS and understand its interface', 'Vector vs. raster data', 'Choose the right coordinate system for KSA', 'Symbolize layers and export a print-ready map'],
    },
    software: ['QGIS'],
    level: 'beginner',
    format: 'recorded',
    hours: 6,
    lessonsCount: 6,
    price: 0,
    instructorName: team,
    instructorBio: teamBio,
    tone: 'secondary',
    isFeatured: true,
    passScore: 70,
    cohorts: [],
    modules: [
      {
        id: 'm-q1',
        title: { ar: 'البداية مع QGIS', en: 'Getting started with QGIS' },
        lessons: [
          { id: 'l-q1', title: { ar: 'ما هي نظم المعلومات الجغرافية؟', en: 'What is GIS?' }, durationMin: 8, isPreview: true, hasQuiz: false, hasAssignment: false },
          { id: 'l-q2', title: { ar: 'تثبيت QGIS وجولة في الواجهة', en: 'Installing QGIS & a UI tour' }, durationMin: 12, isPreview: false, hasQuiz: true, hasAssignment: false },
        ],
      },
      {
        id: 'm-q2',
        title: { ar: 'البيانات والإحداثيات', en: 'Data and coordinates' },
        lessons: [
          { id: 'l-q3', title: { ar: 'Vector و Raster', en: 'Vector and raster' }, durationMin: 15, isPreview: false, hasQuiz: false, hasAssignment: false },
          { id: 'l-q4', title: { ar: 'أنظمة الإحداثيات في المملكة', en: 'Coordinate systems in KSA' }, durationMin: 18, isPreview: false, hasQuiz: true, hasAssignment: false },
        ],
      },
      {
        id: 'm-q3',
        title: { ar: 'إخراج الخريطة', en: 'Map layout' },
        lessons: [
          { id: 'l-q5', title: { ar: 'الترميز والتسميات', en: 'Symbology and labels' }, durationMin: 20, isPreview: false, hasQuiz: false, hasAssignment: false },
          { id: 'l-q6', title: { ar: 'تمرين: خريطة حي سكني', en: 'Exercise: a neighborhood map' }, durationMin: 25, isPreview: false, hasQuiz: false, hasAssignment: true },
        ],
      },
    ],
  },
  {
    id: 'c-arcgis',
    slug: 'arcgis-pro-spatial-analysis',
    title: { ar: 'التحليل المكاني باستخدام ArcGIS Pro', en: 'Spatial Analysis with ArcGIS Pro' },
    summary: { ar: 'تحليل الملاءمة والشبكات والكثافة لدعم القرار.', en: 'Suitability, network and density analysis for decision support.' },
    description: {
      ar: 'دورة متوسطة تبني على أساسيات GIS لتنفيذ تحليلات مكانية حقيقية: تحليل الملاءمة متعدد المعايير، وتحليل الشبكات، والكثافة، والنمذجة باستخدام ModelBuilder.',
      en: 'An intermediate course for real spatial analysis: multi-criteria suitability, network analysis, density and ModelBuilder.',
    },
    outcomes: {
      ar: ['تحليل الملاءمة متعدد المعايير', 'تحليل الشبكات وأقرب مرفق', 'خرائط الكثافة والنقاط الساخنة', 'أتمتة التحليل بـ ModelBuilder'],
      en: ['Multi-criteria suitability', 'Network & closest facility', 'Density and hot spots', 'Automating with ModelBuilder'],
    },
    software: ['ArcGIS Pro'],
    level: 'intermediate',
    format: 'recorded',
    hours: 14,
    lessonsCount: 4,
    price: 349,
    instructorName: team,
    instructorBio: teamBio,
    tone: 'primary',
    isFeatured: true,
    passScore: 70,
    cohorts: [],
    modules: [
      {
        id: 'm-a1',
        title: { ar: 'أدوات التحليل', en: 'Analysis tools' },
        lessons: [
          { id: 'l-a1', title: { ar: 'مقدمة في Geoprocessing', en: 'Intro to geoprocessing' }, durationMin: 14, isPreview: true, hasQuiz: false, hasAssignment: false },
          { id: 'l-a2', title: { ar: 'تحليل الملاءمة', en: 'Suitability analysis' }, durationMin: 32, isPreview: false, hasQuiz: true, hasAssignment: false },
        ],
      },
      {
        id: 'm-a2',
        title: { ar: 'الشبكات والكثافة', en: 'Networks and density' },
        lessons: [
          { id: 'l-a3', title: { ar: 'تحليل الشبكات', en: 'Network analysis' }, durationMin: 28, isPreview: false, hasQuiz: false, hasAssignment: false },
          { id: 'l-a4', title: { ar: 'مشروع: موقع مدرسة جديدة', en: 'Project: siting a new school' }, durationMin: 40, isPreview: false, hasQuiz: false, hasAssignment: true },
        ],
      },
    ],
  },
  {
    id: 'c-python',
    slug: 'python-for-gis',
    title: { ar: 'Python لنظم المعلومات الجغرافية', en: 'Python for GIS' },
    summary: { ar: 'دفعة مباشرة: أتمتة سير العمل وتحليل البيانات المكانية بالبرمجة.', en: 'Live cohort: automate workflows and analyze spatial data with code.' },
    description: {
      ar: 'دفعة مباشرة عبر Zoom على مدى 5 أسابيع: GeoPandas وShapely وRasterio، وكتابة سكربتات تؤتمت المهام المتكررة، مع جلسات أسئلة وتسجيل لكل لقاء.',
      en: 'A 5-week live cohort on Zoom: GeoPandas, Shapely, Rasterio and scripts that automate repetitive tasks — every session recorded.',
    },
    outcomes: {
      ar: ['قراءة البيانات المكانية وتحليلها بـ GeoPandas', 'العمليات الهندسية بـ Shapely', 'معالجة الصور الفضائية بـ Rasterio', 'أتمتة مهام GIS المتكررة'],
      en: ['Read and analyze spatial data with GeoPandas', 'Geometry operations with Shapely', 'Raster processing with Rasterio', 'Automate repetitive GIS tasks'],
    },
    software: ['Python'],
    level: 'advanced',
    format: 'live',
    hours: 20,
    lessonsCount: 2,
    price: 799,
    instructorName: team,
    instructorBio: teamBio,
    tone: 'ink',
    isFeatured: true,
    passScore: 70,
    nextCohortStart: '2027-01-10',
    cohorts: [
      { id: 'co-p1', name: { ar: 'الدفعة الأولى', en: 'Cohort 1' }, startsOn: '2027-01-10', endsOn: '2027-02-14', seats: 25, seatsLeft: 7, status: 'open' },
      { id: 'co-p2', name: { ar: 'الدفعة الثانية', en: 'Cohort 2' }, startsOn: '2027-03-07', endsOn: '2027-04-11', seats: 25, seatsLeft: 25, status: 'open' },
    ],
    modules: [
      {
        id: 'm-p1',
        title: { ar: 'الأسبوع الأول', en: 'Week 1' },
        lessons: [
          { id: 'l-p1', title: { ar: 'إعداد البيئة وأساسيات GeoPandas', en: 'Setup & GeoPandas basics' }, durationMin: 90, isPreview: false, hasQuiz: false, hasAssignment: false },
          { id: 'l-p2', title: { ar: 'العمليات المكانية', en: 'Spatial operations' }, durationMin: 90, isPreview: false, hasQuiz: false, hasAssignment: true },
        ],
      },
    ],
  },
  {
    id: 'c-rs',
    slug: 'remote-sensing-basics',
    title: { ar: 'أساسيات الاستشعار عن بعد', en: 'Remote Sensing Basics' },
    summary: { ar: 'تحميل صور Sentinel وLandsat وتحليلها لرصد التغيّر.', en: 'Download and analyze Sentinel and Landsat imagery to detect change.' },
    description: {
      ar: 'تتعرف على الصور الفضائية المجانية وكيفية تحميلها ومعالجتها في QGIS، وحساب المؤشرات مثل NDVI، ورصد التغيّر العمراني.',
      en: 'Learn free satellite imagery, how to download and process it in QGIS, compute indices like NDVI and detect urban change.',
    },
    outcomes: {
      ar: ['مصادر الصور الفضائية المجانية', 'المعالجة المسبقة للصور', 'حساب NDVI', 'رصد التغيّر العمراني'],
      en: ['Free imagery sources', 'Image pre-processing', 'Computing NDVI', 'Urban change detection'],
    },
    software: ['QGIS', 'Google Earth Engine'],
    level: 'intermediate',
    format: 'recorded',
    hours: 8,
    lessonsCount: 2,
    price: 199,
    instructorName: team,
    instructorBio: teamBio,
    tone: 'accent',
    isFeatured: false,
    passScore: 70,
    cohorts: [],
    modules: [
      {
        id: 'm-r1',
        title: { ar: 'الصور الفضائية', en: 'Satellite imagery' },
        lessons: [
          { id: 'l-r1', title: { ar: 'مصادر الصور المجانية', en: 'Free imagery sources' }, durationMin: 16, isPreview: true, hasQuiz: false, hasAssignment: false },
          { id: 'l-r2', title: { ar: 'حساب NDVI', en: 'Computing NDVI' }, durationMin: 22, isPreview: false, hasQuiz: true, hasAssignment: false },
        ],
      },
    ],
  },
]

/** محتوى الدروس — مكتمل لدورة QGIS فقط للتجربة */
export const demoLessonContent: Record<string, DemoLessonExtra> = {
  'l-q1': {
    youtubeId: null,
    body: {
      ar: 'نظم المعلومات الجغرافية (GIS) هي أدوات لجمع البيانات المرتبطة بموقع، وتخزينها وتحليلها وعرضها على الخريطة. في هذا الدرس نتعرف على استخداماتها في التخطيط والبلديات والبيئة.',
      en: 'GIS is a set of tools to collect, store, analyze and display location-based data. In this lesson we look at its uses in planning, municipalities and environment.',
    },
  },
  'l-q2': {
    youtubeId: null,
    body: {
      ar: 'نحمّل QGIS من الموقع الرسمي (إصدار LTR)، ونتعرف على لوحة الطبقات، ومتصفح البيانات، وشريط الأدوات.',
      en: 'We download QGIS (LTR) from the official site and explore the Layers panel, Browser and toolbars.',
    },
    attachments: [{ id: 'att-1', name: 'qgis-install-guide-ar.pdf', sizeBytes: 842_000 }],
    questions: [
      {
        id: 'q1', kind: 'mcq', correct: 1,
        prompt: { ar: 'أي إصدار من QGIS يُنصح به للاستخدام في العمل؟', en: 'Which QGIS release is recommended for production work?' },
        options: [
          { ar: 'أحدث إصدار تجريبي', en: 'The latest nightly build' },
          { ar: 'الإصدار طويل الدعم (LTR)', en: 'The Long Term Release (LTR)' },
          { ar: 'أي إصدار قديم', en: 'Any older version' },
        ],
      },
      {
        id: 'q2', kind: 'true_false', correct: 0,
        prompt: { ar: 'QGIS برنامج مجاني ومفتوح المصدر.', en: 'QGIS is free and open source.' },
        options: trueFalse,
      },
    ],
  },
  'l-q3': {
    youtubeId: null,
    body: {
      ar: 'البيانات الخطية (Vector) تمثّل الظواهر بنقاط وخطوط ومضلعات، والشبكية (Raster) تمثّلها بخلايا مثل الصور الفضائية ونماذج الارتفاع.',
      en: 'Vector data represents features as points, lines and polygons; raster represents them as cells, like satellite images and elevation models.',
    },
  },
  'l-q4': {
    youtubeId: null,
    body: {
      ar: 'نتعرف على النظام الجغرافي WGS 84 والإسقاط UTM، والنطاقات المستخدمة في المملكة (37N إلى 40N)، ومتى نستخدم كلاً منها.',
      en: 'We cover WGS 84, UTM projection and the zones used in KSA (37N–40N), and when to use each.',
    },
    questions: [
      {
        id: 'q3', kind: 'mcq', correct: 2,
        prompt: { ar: 'ما رمز EPSG للنظام الجغرافي WGS 84؟', en: 'What is the EPSG code for WGS 84?' },
        options: [
          { ar: 'EPSG:3857', en: 'EPSG:3857' },
          { ar: 'EPSG:32638', en: 'EPSG:32638' },
          { ar: 'EPSG:4326', en: 'EPSG:4326' },
        ],
      },
      {
        id: 'q4', kind: 'true_false', correct: 1,
        prompt: { ar: 'نقيس المساحات بدقة مباشرة على نظام جغرافي بالدرجات.', en: 'Areas are measured accurately directly in a geographic (degrees) system.' },
        options: trueFalse,
      },
    ],
  },
  'l-q5': {
    youtubeId: null,
    body: {
      ar: 'نطبّق الترميز المصنّف والمتدرج، ونضيف التسميات بخط عربي واضح، ونضبط ترتيب الطبقات.',
      en: 'We apply categorized and graduated symbology, add clear Arabic labels and order layers.',
    },
  },
  'l-q6': {
    youtubeId: null,
    body: {
      ar: 'التمرين الختامي: أنتج خريطة لحي سكني تتضمن العناصر الكارتوغرافية الأساسية.',
      en: 'Final exercise: produce a neighborhood map with the essential cartographic elements.',
    },
    assignment: {
      ar: 'حمّل بيانات الحي المرفقة، وأخرج خريطة بصيغة PDF تتضمن: العنوان، ومفتاح الخريطة، ومقياس الرسم، واتجاه الشمال، والمصدر. ارفع ملف PDF هنا.',
      en: 'Load the attached neighborhood data and export a PDF map including title, legend, scale bar, north arrow and source. Upload the PDF here.',
    },
    attachments: [{ id: 'att-2', name: 'neighborhood-data.zip', sizeBytes: 2_350_000 }],
  },
}
