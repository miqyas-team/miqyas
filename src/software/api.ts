import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Localized } from '../lib/lang'

export type SoftwareCategory = 'desktop' | 'web' | 'library' | 'survey' | 'remote_sensing'
export type SoftwareLicense = 'free' | 'trial' | 'student' | 'paid'
export type OS = 'windows' | 'mac' | 'linux' | 'web'

export interface Software {
  id: string
  slug: string
  name: string
  category: SoftwareCategory
  license: SoftwareLicense
  os: OS[]
  description: Localized
  install: Localized
  downloadUrl: string
  courseSlugs: string[]
  position: number
  isPublished: boolean
}

export interface Dataset {
  id: string
  title: Localized
  description: Localized
  region: string | null
  format: string
  license: string | null
  url: string
  sizeBytes: number | null
  isPublished: boolean
  createdAt: string
}

export type SoftwareInput = Omit<Software, 'id'>
export type DatasetInput = Omit<Dataset, 'id' | 'url' | 'createdAt' | 'sizeBytes'> & { externalUrl: string | null }

export interface SoftwareApi {
  listSoftware(scope: 'public' | 'admin'): Promise<Software[]>
  saveSoftware(id: string | null, input: SoftwareInput): Promise<void>
  removeSoftware(id: string): Promise<void>
  listDatasets(scope: 'public' | 'admin'): Promise<Dataset[]>
  saveDataset(id: string | null, input: DatasetInput, file: File | null): Promise<void>
  removeDataset(id: string): Promise<void>
}

/* ═════════════════ وضع المعاينة ═════════════════ */
const L = (ar: string, en: string): Localized => ({ ar, en })
const steps = (...s: [string, string][]) => L(s.map((x) => x[0]).join('\n'), s.map((x) => x[1]).join('\n'))

const seedSoftware = (): Software[] =>
  [
    { slug: 'qgis', name: 'QGIS', category: 'desktop', license: 'free', os: ['windows', 'mac', 'linux'],
      description: L('برنامج GIS مجاني ومفتوح المصدر، يكفي لمعظم أعمال الخرائط والتحليل المكاني.', 'Free, open-source desktop GIS that covers most mapping and spatial analysis work.'),
      install: steps(
        ['ادخل صفحة التحميل الرسمية واختر نظام تشغيلك.', 'Open the official download page and choose your OS.'],
        ['حمّل إصدار LTR (طويل الدعم) فهو الأكثر استقراراً.', 'Download the LTR (long-term release) for stability.'],
        ['شغّل ملف التثبيت واتبع الخطوات الافتراضية.', 'Run the installer with the default options.'],
        ['افتح QGIS وغيّر اللغة إن رغبت من Settings ← Options ← General.', 'Open QGIS; change the language under Settings → Options → General if you like.'],
      ),
      downloadUrl: 'https://qgis.org/download/', courseSlugs: ['qgis-from-zero', 'remote-sensing-basics'] },
    { slug: 'arcgis-pro', name: 'ArcGIS Pro', category: 'desktop', license: 'trial', os: ['windows'],
      description: L('برنامج Esri الاحترافي للتحليل المكاني وإخراج الخرائط. تتوفر نسخة تجريبية ورخص طلابية عبر الجامعات.', 'Esri’s professional GIS for spatial analysis and cartography. Free trial; student licenses via universities.'),
      install: steps(
        ['اسأل جامعتك عن رخصة ArcGIS الطلابية أولاً.', 'Ask your university about an ArcGIS student license first.'],
        ['أو اطلب النسخة التجريبية من صفحة Esri الرسمية.', 'Or request the free trial from Esri’s official page.'],
        ['سجّل الدخول بحساب ArcGIS ثم حمّل البرنامج.', 'Sign in with an ArcGIS account and download.'],
        ['يعمل على Windows فقط؛ تحقق من متطلبات الجهاز قبل التثبيت.', 'Windows only; check system requirements before installing.'],
      ),
      downloadUrl: 'https://www.esri.com/en-us/arcgis/products/arcgis-pro/trial', courseSlugs: ['arcgis-pro-spatial-analysis'] },
    { slug: 'google-earth-pro', name: 'Google Earth Pro', category: 'desktop', license: 'free', os: ['windows', 'mac', 'linux'],
      description: L('استكشاف الصور الفضائية التاريخية، ورسم النقاط والمسارات، وتصدير ملفات KML.', 'Explore historical imagery, draw placemarks and paths, and export KML files.'),
      install: L('', ''), downloadUrl: 'https://www.google.com/earth/about/versions/', courseSlugs: [] },
    { slug: 'grass-gis', name: 'GRASS GIS', category: 'desktop', license: 'free', os: ['windows', 'mac', 'linux'],
      description: L('محرك تحليل مكاني قوي ومفتوح المصدر، ويعمل أيضاً من داخل QGIS.', 'Powerful open-source spatial analysis engine, also usable inside QGIS.'),
      install: L('', ''), downloadUrl: 'https://grass.osgeo.org/download/', courseSlugs: [] },
    { slug: 'snap', name: 'SNAP (ESA)', category: 'remote_sensing', license: 'free', os: ['windows', 'mac', 'linux'],
      description: L('أداة وكالة الفضاء الأوروبية لمعالجة صور Sentinel وتحليلها.', 'ESA’s toolbox for processing and analyzing Sentinel imagery.'),
      install: L('', ''), downloadUrl: 'https://step.esa.int/main/download/snap-download/', courseSlugs: ['remote-sensing-basics'] },
    { slug: 'google-earth-engine', name: 'Google Earth Engine', category: 'web', license: 'free', os: ['web'],
      description: L('منصة سحابية لتحليل الصور الفضائية بكميات ضخمة. مجانية للأغراض البحثية وغير التجارية.', 'Cloud platform for large-scale satellite imagery analysis. Free for research and non-commercial use.'),
      install: L('', ''), downloadUrl: 'https://earthengine.google.com/', courseSlugs: ['remote-sensing-basics'] },
    { slug: 'python', name: 'Python', category: 'library', license: 'free', os: ['windows', 'mac', 'linux'],
      description: L('لغة البرمجة الأشهر في GIS مع مكتبات GeoPandas وShapely وRasterio.', 'The most popular language for GIS, with GeoPandas, Shapely and Rasterio.'),
      install: steps(
        ['حمّل Python من الموقع الرسمي (أو استخدم Miniforge لإدارة البيئات).', 'Download Python from the official site (or use Miniforge for environments).'],
        ['فعّل خيار Add Python to PATH أثناء التثبيت على Windows.', 'Tick “Add Python to PATH” during setup on Windows.'],
        ['ثبّت المكتبات: pip install geopandas rasterio', 'Install libraries: pip install geopandas rasterio'],
        ['جرّب في الطرفية: python -c "import geopandas"', 'Test in a terminal: python -c "import geopandas"'],
      ),
      downloadUrl: 'https://www.python.org/downloads/', courseSlugs: ['python-for-gis'] },
    { slug: 'autocad-civil-3d', name: 'AutoCAD Civil 3D', category: 'survey', license: 'student', os: ['windows'],
      description: L('برنامج Autodesk للتصميم المدني والمساحي. رخصة تعليمية مجانية للطلاب.', 'Autodesk’s civil and survey design software. Free educational license for students.'),
      install: L('', ''), downloadUrl: 'https://www.autodesk.com/education/edu-software/overview', courseSlugs: [] },
  ].map((s, i) => ({ ...s, id: `sw-${s.slug}`, position: i + 1, isPublished: true }) as Software)

/** عيّنة تدريب صغيرة مولّدة — بيانات وهمية للتجربة فقط */
function sampleDataset(): Dataset {
  const fc = {
    type: 'FeatureCollection',
    features: [
      ...[[46.672, 24.712, 'مدرسة'], [46.684, 24.705, 'مستشفى'], [46.661, 24.698, 'حديقة'], [46.69, 24.72, 'مسجد']].map(([x, y, kind], i) => ({
        type: 'Feature', properties: { id: i + 1, type: kind, note: 'بيانات وهمية للتدريب' }, geometry: { type: 'Point', coordinates: [x, y] },
      })),
      { type: 'Feature', properties: { name: 'حي تدريبي أ', area_class: 'سكني' }, geometry: { type: 'Polygon', coordinates: [[[46.655, 24.695], [46.675, 24.695], [46.675, 24.715], [46.655, 24.715], [46.655, 24.695]]] } },
      { type: 'Feature', properties: { name: 'حي تدريبي ب', area_class: 'تجاري' }, geometry: { type: 'Polygon', coordinates: [[[46.675, 24.695], [46.695, 24.695], [46.695, 24.725], [46.675, 24.725], [46.675, 24.695]]] } },
    ],
  }
  const json = JSON.stringify(fc)
  return {
    id: 'ds-sample',
    title: L('عيّنة تدريب: أحياء وخدمات (نموذج)', 'Practice sample: districts & services (sample)'),
    description: L('بيانات وهمية صغيرة لتجربة الاستيراد والترميز والاستعلام في QGIS.', 'Small fictional dataset to practice importing, symbology and queries in QGIS.'),
    region: 'الرياض (تقريبي)', format: 'GeoJSON', license: 'CC0',
    url: `data:application/geo+json;charset=utf-8,${encodeURIComponent(json)}`,
    sizeBytes: json.length, isPublished: true, createdAt: new Date().toISOString(),
  }
}

const SW_KEY = 'miqyas-demo-software'
const DS_KEY = 'miqyas-demo-datasets'
const loadJson = <T,>(k: string, fallback: () => T): T => {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : fallback()
  } catch {
    return fallback()
  }
}
const saveJson = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* تجاهل */
  }
}
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))
const fileToDataUrl = (f: File) =>
  new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.readAsDataURL(f)
  })

const demoApi: SoftwareApi = {
  listSoftware: async (scope) => delay(loadJson(SW_KEY, seedSoftware).filter((s) => scope === 'admin' || s.isPublished).sort((a, b) => a.position - b.position)),
  async saveSoftware(id, input) {
    const all = loadJson(SW_KEY, seedSoftware)
    if (id) Object.assign(all.find((s) => s.id === id) ?? {}, input)
    else all.push({ ...input, id: crypto.randomUUID() })
    saveJson(SW_KEY, all)
    await delay(null)
  },
  async removeSoftware(id) {
    saveJson(SW_KEY, loadJson(SW_KEY, seedSoftware).filter((s) => s.id !== id))
    await delay(null)
  },
  listDatasets: async (scope) => delay(loadJson(DS_KEY, () => [sampleDataset()]).filter((d) => scope === 'admin' || d.isPublished)),
  async saveDataset(id, input, file) {
    const all = loadJson<Dataset[]>(DS_KEY, () => [sampleDataset()])
    const url = file && file.size <= 1_500_000 ? await fileToDataUrl(file) : input.externalUrl ?? '#'
    const { externalUrl: _e, ...rest } = input
    if (id) {
      const d = all.find((x) => x.id === id)
      if (d) Object.assign(d, rest, file || input.externalUrl ? { url, sizeBytes: file?.size ?? null } : {})
    } else all.push({ ...rest, id: crypto.randomUUID(), url, sizeBytes: file?.size ?? null, createdAt: new Date().toISOString() })
    saveJson(DS_KEY, all)
    await delay(null)
  },
  async removeDataset(id) {
    saveJson(DS_KEY, loadJson<Dataset[]>(DS_KEY, () => [sampleDataset()]).filter((d) => d.id !== id))
    await delay(null)
  },
}

/* ═════════════════ Supabase ═════════════════ */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
const LR = (r: Row, k: string): Localized => ({ ar: r[`${k}_ar`] ?? '', en: r[`${k}_en`] ?? '' })
function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const supabaseApi: SoftwareApi = {
  async listSoftware(scope) {
    // الروابط الرسمية في جدول خاص بالفريق؛ للعامة تعود فارغة
    let q = supabase.from('software').select(scope === 'admin' ? '*, software_links(download_url)' : '*').order('position')
    if (scope === 'public') q = q.eq('is_published', true)
    return (must(await q) as Row[]).map((r) => ({
      id: r.id, slug: r.slug, name: r.name, category: r.category, license: r.license, os: r.os,
      description: LR(r, 'description'), install: LR(r, 'install'),
      downloadUrl: (Array.isArray(r.software_links) ? r.software_links[0] : r.software_links)?.download_url ?? '',
      courseSlugs: r.course_slugs ?? [], position: r.position, isPublished: r.is_published,
    }))
  },
  async saveSoftware(id, s) {
    const row = {
      slug: s.slug, name: s.name, category: s.category, license: s.license, os: s.os,
      description_ar: s.description.ar, description_en: s.description.en,
      install_ar: s.install.ar || null, install_en: s.install.en || null,
      course_slugs: s.courseSlugs, position: s.position, is_published: s.isPublished,
      updated_at: new Date().toISOString(),
    }
    const saved = must(
      id ? await supabase.from('software').update(row).eq('id', id).select('id').single() : await supabase.from('software').insert(row).select('id').single(),
    ) as Row
    must(await supabase.from('software_links').upsert({ software_id: saved.id, download_url: s.downloadUrl }))
  },
  async removeSoftware(id) {
    must(await supabase.from('software').delete().eq('id', id))
  },
  async listDatasets(scope) {
    let q = supabase.from('datasets').select('*').order('created_at', { ascending: false })
    if (scope === 'public') q = q.eq('is_published', true)
    return (must(await q) as Row[]).map((r) => ({
      id: r.id, title: LR(r, 'title'), description: LR(r, 'description'), region: r.region, format: r.format, license: r.license,
      url: r.file_path ? supabase.storage.from('datasets').getPublicUrl(r.file_path).data.publicUrl : r.external_url,
      sizeBytes: r.size_bytes, isPublished: r.is_published, createdAt: r.created_at,
    }))
  },
  async saveDataset(id, d, file) {
    let file_path: string | undefined
    if (file) {
      file_path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
      must(await supabase.storage.from('datasets').upload(file_path, file))
    }
    const row: Row = {
      title_ar: d.title.ar, title_en: d.title.en, description_ar: d.description.ar || null, description_en: d.description.en || null,
      region: d.region || null, format: d.format, license: d.license || null, external_url: d.externalUrl || null, is_published: d.isPublished,
      ...(file ? { file_path, size_bytes: file.size } : {}),
    }
    must(id ? await supabase.from('datasets').update(row).eq('id', id) : await supabase.from('datasets').insert(row))
  },
  async removeDataset(id) {
    must(await supabase.from('datasets').delete().eq('id', id))
  },
}

export const softwareApi: SoftwareApi = isSupabaseConfigured ? supabaseApi : demoApi
