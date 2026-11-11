/**
 * محتوى الصفحة الرئيسية الثابت.
 * الدورات تأتي من coursesApi (Supabase أو بيانات المعاينة).
 * ⚠️ الآراء هنا **نموذجية** — استبدلوها بآراء متدربين حقيقيين (بإذنهم) قبل الإطلاق.
 */
import type { Localized } from '../lib/lang'

/** slug يطابق service_types.slug لفتح نموذج الطلب على الخدمة مباشرة */
export const services = [
  { key: 'graduation', slug: 'graduation-guidance', icon: 'GraduationCap' },
  { key: 'consulting', slug: 'consulting', icon: 'MessagesSquare' },
  { key: 'mapping', slug: 'mapping', icon: 'Map' },
  { key: 'analysis', slug: 'spatial-analysis', icon: 'Layers' },
  { key: 'survey', slug: 'land-survey', icon: 'Ruler' },
  { key: 'conversion', slug: 'data-conversion', icon: 'FileCog' },
] as const

export const software = [
  { name: 'QGIS', license: 'free' },
  { name: 'ArcGIS Pro', license: 'student' },
  { name: 'Google Earth Pro', license: 'free' },
  { name: 'Python', license: 'free' },
  { name: 'AutoCAD Civil 3D', license: 'student' },
  { name: 'GRASS GIS', license: 'free' },
] as const

export const reasons = ['arabic', 'practical', 'certificate', 'team'] as const

/**
 * true ما دامت الآراء نموذجية: يظهر القسم في بيئة التطوير فقط بشارة «نموذج»،
 * ولا يظهر في النسخة المنشورة حتى تُضاف آراء حقيقية وتُغيَّر القيمة إلى false.
 */
export const testimonialsAreSamples = true

export const testimonials: { name: Localized; role: Localized; quote: Localized }[] = [
  {
    name: { ar: 'اسم المتدرب', en: 'Trainee name' },
    role: { ar: 'طالب نظم معلومات جغرافية', en: 'GIS student' },
    quote: {
      ar: 'نص نموذجي — يُستبدل برأي متدرب حقيقي بعد أول دفعة.',
      en: 'Sample text — replace with a real trainee review after the first cohort.',
    },
  },
  {
    name: { ar: 'اسم المتدربة', en: 'Trainee name' },
    role: { ar: 'مهندسة مساحة', en: 'Surveying engineer' },
    quote: {
      ar: 'نص نموذجي — يُستبدل برأي متدربة حقيقية بعد أول دفعة.',
      en: 'Sample text — replace with a real trainee review after the first cohort.',
    },
  },
  {
    name: { ar: 'اسم العميل', en: 'Client name' },
    role: { ar: 'باحث دراسات عليا', en: 'Graduate researcher' },
    quote: {
      ar: 'نص نموذجي — يُستبدل برأي عميل حقيقي بعد أول طلب خدمة.',
      en: 'Sample text — replace with a real client review after the first service request.',
    },
  },
]

/**
 * روابط التواصل الاحتياطية. البريد والواتساب يُقرآن أولاً من إعدادات المنشأة في لوحة الإدارة؛
 * الحسابات الاجتماعية تظهر في التذييل فقط إذا وُضع رابطها هنا.
 */
export const contact = {
  email: '',
  whatsapp: '',
  x: '',
  linkedin: '',
  instagram: '',
}
