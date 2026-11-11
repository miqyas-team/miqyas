import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Localized } from '../lib/lang'
import type {
  NewRequestInput,
  RequestDetail,
  RequestEvent,
  RequestFile,
  RequestMessage,
  RequestStatus,
  RequestSummary,
  ServiceType,
  ServiceTypePatch,
  TeamMember,
} from './types'

export interface ServicesApi {
  listServiceTypes(): Promise<ServiceType[]>
  createRequest(input: NewRequestInput): Promise<string>
  myRequests(): Promise<RequestSummary[]>
  /** للمدير: كل الطلبات؛ لعضو الفريق: المسندة إليه */
  staffRequests(scope: 'all' | 'assigned'): Promise<RequestSummary[]>
  getRequest(id: string): Promise<RequestDetail | null>
  sendMessage(id: string, body: string, internal: boolean): Promise<void>
  uploadFiles(id: string, kind: 'input' | 'deliverable', files: File[]): Promise<void>
  transition(id: string, to: RequestStatus, price?: number): Promise<void>
  assign(id: string, memberId: string | null): Promise<void>
  listTeam(): Promise<TeamMember[]>
  /** للمدير: كل الخدمات بما فيها المخفية */
  adminServiceTypes(): Promise<ServiceType[]>
  saveServiceType(id: string, patch: ServiceTypePatch): Promise<void>
  /** آخر رسالة (غير داخلية) في كل طلب — لمعرفة من ينتظر الرد */
  latestMessages(ids: string[]): Promise<Record<string, LatestMessage>>
}

export interface LatestMessage {
  body: string
  fromClient: boolean
  createdAt: string
}

/* ═════════════════ وضع المعاينة ═════════════════ */

const DEMO_USER = 'demo-user'
const DEMO_NAME = 'متدرب تجريبي'
const demoTeam: TeamMember[] = [
  { id: DEMO_USER, name: 'أنت (الحساب التجريبي)' },
  { id: 'demo-team', name: 'عضو فريق تجريبي' },
]

const demoTypes: ServiceType[] = [
  { id: 'st-software', slug: 'software-install', icon: 'FileCog', pricing: 'fixed', price: 49, unit: { ar: 'للبرنامج', en: 'per software' }, requiresLocation: false, isAcademic: false, requiresDeliverable: false, isActive: true, position: 0,
    name: { ar: 'تحميل وتثبيت البرامج', en: 'Software download & setup' },
    description: { ar: 'يتواصل معك الدعم الفني في محادثة الطلب، ويساعدك في تحميل البرنامج من مصدره الرسمي وتثبيته وتفعيله.', en: 'Tech support contacts you in the request chat and helps you download the software from its official source, install and activate it.' } },
  { id: 'st-grad', slug: 'graduation-guidance', icon: 'GraduationCap', pricing: 'custom', price: null, unit: null, requiresLocation: false, isAcademic: true, requiresDeliverable: true, isActive: true, position: 1,
    name: { ar: 'توجيه مشاريع التخرج', en: 'Graduation project guidance' },
    description: { ar: 'نساعدك في اختيار المنهجية والأدوات، ونراجع خرائطك وتحليلاتك قبل التسليم.', en: 'We help you choose the method and tools, and review your maps and analysis before submission.' } },
  { id: 'st-consult', slug: 'consulting', icon: 'MessagesSquare', pricing: 'fixed', price: 150, unit: { ar: 'للساعة', en: 'per hour' }, requiresLocation: false, isAcademic: false, requiresDeliverable: true, isActive: true, position: 2,
    name: { ar: 'استشارة فنية', en: 'Technical consultation' },
    description: { ar: 'جلسة مع مختص لحل مشكلة أو مراجعة عملك أو الإجابة عن أسئلتك.', en: 'A session with a specialist to fix an issue, review your work or answer your questions.' } },
  { id: 'st-map', slug: 'mapping', icon: 'Map', pricing: 'custom', price: null, unit: null, requiresLocation: true, isAcademic: false, requiresDeliverable: true, isActive: true, position: 3,
    name: { ar: 'رسم الخرائط', en: 'Mapping' },
    description: { ar: 'خرائط موضوعية وإخراج كارتوغرافي احترافي جاهز للطباعة والنشر.', en: 'Thematic maps and professional cartographic layouts.' } },
  { id: 'st-analysis', slug: 'spatial-analysis', icon: 'Layers', pricing: 'custom', price: null, unit: null, requiresLocation: true, isAcademic: false, requiresDeliverable: true, isActive: true, position: 4,
    name: { ar: 'التحليل المكاني', en: 'Spatial analysis' },
    description: { ar: 'تحليل الملاءمة والشبكات والكثافة والتغيّر لدعم القرار.', en: 'Suitability, network, density and change analysis.' } },
  { id: 'st-survey', slug: 'land-survey', icon: 'Ruler', pricing: 'custom', price: null, unit: null, requiresLocation: true, isAcademic: false, requiresDeliverable: true, isActive: true, position: 5,
    name: { ar: 'الرفع المساحي', en: 'Land surveying' },
    description: { ar: 'رفع ميداني ومعالجة بيانات المساحة وإعداد المخططات.', en: 'Field surveys, data processing and plan preparation.' } },
  { id: 'st-convert', slug: 'data-conversion', icon: 'FileCog', pricing: 'fixed', price: 99, unit: { ar: 'للملف', en: 'per file' }, requiresLocation: false, isAcademic: false, requiresDeliverable: true, isActive: true, position: 6,
    name: { ar: 'تحويل البيانات', en: 'Data conversion' },
    description: { ar: 'من CAD إلى GIS، وإصلاح الإحداثيات، وتنظيف البيانات وتحويل الصيغ.', en: 'CAD to GIS, coordinate fixes, data cleaning and format conversion.' } },
]

interface DemoRequest {
  id: string
  number: number
  clientId: string
  serviceTypeId: string
  title: string
  description: string
  location: { lat: number; lng: number } | null
  locationNote: string | null
  dueDate: string | null
  price: number | null
  assignedTo: string | null
  status: RequestStatus
  createdAt: string
  updatedAt: string
  /** dataUrl: نسخة من الملفات الصغيرة لتعمل المعاينة والتنزيل في وضع المعاينة */
  files: (Omit<RequestFile, 'url'> & { dataUrl?: string })[]
  messages: Omit<RequestMessage, 'senderName' | 'senderIsStaff'>[]
  events: Omit<RequestEvent, 'actorName'>[]
}

const KEY = 'miqyas-demo-requests'
const loadDemo = (): DemoRequest[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as DemoRequest[]
  } catch {
    return []
  }
}
const saveDemo = (rs: DemoRequest[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(rs))
  } catch {
    /* تجاهل */
  }
}
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 200))

const DEMO_FILE_LIMIT = 1_500_000
function readDataUrl(f: File): Promise<string | undefined> {
  if (f.size > DEMO_FILE_LIMIT) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : undefined)
    r.onerror = () => resolve(undefined)
    r.readAsDataURL(f)
  })
}
async function demoFiles(files: File[], kind: 'input' | 'deliverable', at: string) {
  return Promise.all(
    files.map(async (f) => ({ id: crypto.randomUUID(), kind, name: f.name, sizeBytes: f.size, uploadedBy: DEMO_USER, createdAt: at, dataUrl: await readDataUrl(f) })),
  )
}

function demoSummary(r: DemoRequest): RequestSummary {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    serviceType: demoTypes.find((t) => t.id === r.serviceTypeId)!,
    status: r.status,
    price: r.price,
    dueDate: r.dueDate,
    clientName: DEMO_NAME,
    assignedTo: r.assignedTo,
    assignedName: r.assignedTo ? (demoTeam.find((m) => m.id === r.assignedTo)?.name ?? null) : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mutate(id: string, fn: (r: DemoRequest) => void) {
  const all = loadDemo()
  const r = all.find((x) => x.id === id)
  if (!r) throw new Error('request not found')
  fn(r)
  r.updatedAt = new Date().toISOString()
  saveDemo(all)
}

const event = (type: RequestEvent['type'], from: string | null, to: string | null) => ({
  id: crypto.randomUUID(),
  type,
  from,
  to,
  createdAt: new Date().toISOString(),
})

const demoApi: ServicesApi = {
  listServiceTypes: () => delay(demoTypes.filter((t) => t.isActive).sort((a, b) => a.position - b.position)),
  adminServiceTypes: () => delay([...demoTypes].sort((a, b) => a.position - b.position)),
  async saveServiceType(id, patch) {
    const t = demoTypes.find((x) => x.id === id)
    if (!t) throw new Error('service type not found')
    Object.assign(t, patch)
    await delay(null)
  },
  async latestMessages(ids) {
    const out: Record<string, LatestMessage> = {}
    for (const r of loadDemo()) {
      if (!ids.includes(r.id)) continue
      const m = [...r.messages].reverse().find((x) => !x.isInternal)
      if (m) out[r.id] = { body: m.body, fromClient: m.senderId === r.clientId, createdAt: m.createdAt }
    }
    return delay(out)
  },

  async createRequest(input) {
    const type = demoTypes.find((t) => t.id === input.serviceTypeId)
    if (!type) throw new Error('service type not available')
    const all = loadDemo()
    const now = new Date().toISOString()
    const status: RequestStatus = type.pricing === 'fixed' ? 'awaiting_payment' : 'new'
    const r: DemoRequest = {
      id: crypto.randomUUID(),
      number: 1001 + all.length,
      clientId: DEMO_USER,
      serviceTypeId: type.id,
      title: input.title.trim(),
      description: input.description.trim(),
      location: input.location,
      locationNote: input.locationNote.trim() || null,
      dueDate: input.dueDate,
      price: type.pricing === 'fixed' ? type.price : null,
      assignedTo: null,
      status,
      createdAt: now,
      updatedAt: now,
      files: await demoFiles(input.files, 'input', now),
      messages: [],
      events: [event('status', null, status)],
    }
    all.unshift(r)
    saveDemo(all)
    return delay(r.id)
  },

  myRequests: async () => delay(loadDemo().map(demoSummary)),

  staffRequests: async (scope) =>
    delay(loadDemo().filter((r) => scope === 'all' || r.assignedTo === DEMO_USER).map(demoSummary)),

  async getRequest(id) {
    const r = loadDemo().find((x) => x.id === id)
    if (!r) return delay(null)
    return delay({
      ...demoSummary(r),
      clientId: r.clientId,
      description: r.description,
      location: r.location,
      locationNote: r.locationNote,
      files: r.files.map(({ dataUrl, ...f }) => ({ ...f, url: dataUrl ?? '#' })),
      messages: r.messages.map((m) => ({ ...m, senderName: m.senderId === r.clientId && !m.isInternal ? DEMO_NAME : 'فريق مقياس', senderIsStaff: m.senderId !== r.clientId })),
      events: r.events.map((e) => ({ ...e, actorName: null })),
    })
  },

  async sendMessage(id, body, internal) {
    // في المعاينة: الحساب نفسه عميل وفريق؛ نميّز رسالة الفريق بمعرّف مختلف
    mutate(id, (r) =>
      r.messages.push({
        id: crypto.randomUUID(),
        senderId: internal || r.assignedTo === DEMO_USER ? 'demo-staff' : DEMO_USER,
        body: body.trim(),
        isInternal: internal,
        createdAt: new Date().toISOString(),
      }),
    )
    await delay(null)
  },

  async uploadFiles(id, kind, files) {
    const added = await demoFiles(files, kind, new Date().toISOString())
    mutate(id, (r) => r.files.push(...added))
    await delay(null)
  },

  async transition(id, to, price) {
    mutate(id, (r) => {
      if (to === 'awaiting_payment') {
        const p = price ?? r.price
        if (p === null || p === undefined) throw new Error('price required')
        if (p !== r.price) r.events.push(event('price', r.price?.toString() ?? null, String(p)))
        r.price = p
      }
      const needs = demoTypes.find((t) => t.id === r.serviceTypeId)?.requiresDeliverable ?? true
      if (to === 'review' && needs && !r.files.some((f) => f.kind === 'deliverable')) throw new Error('deliverable required')
      r.events.push(event('status', r.status, to))
      r.status = to
    })
    await delay(null)
  },

  async assign(id, memberId) {
    mutate(id, (r) => {
      r.events.push(event('assign', r.assignedTo, memberId))
      r.assignedTo = memberId
    })
    await delay(null)
  },

  listTeam: async () => delay(demoTeam),
}

/* ═════════════════ Supabase ═════════════════ */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
const L = (r: Row | null | undefined, key: string): Localized => ({ ar: r?.[`${key}_ar`] ?? '', en: r?.[`${key}_en`] ?? '' })

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const toType = (t: Row): ServiceType => ({
  id: t.id,
  slug: t.slug,
  name: L(t, 'name'),
  description: L(t, 'description'),
  icon: t.icon,
  pricing: t.pricing,
  price: t.price === null ? null : Number(t.price),
  unit: t.unit_ar || t.unit_en ? L(t, 'unit') : null,
  requiresLocation: t.requires_location,
  isAcademic: t.is_academic,
  requiresDeliverable: t.requires_deliverable ?? true,
  isActive: t.is_active ?? true,
  position: t.position ?? 0,
})

const SUMMARY_COLS =
  'id, number, title, status, price, due_date, assigned_to, created_at, updated_at, client_id, service_types(*), client:profiles!service_requests_client_id_fkey(full_name), assignee:profiles!service_requests_assigned_to_fkey(full_name)'

const toSummary = (r: Row): RequestSummary => ({
  id: r.id,
  number: r.number,
  title: r.title,
  serviceType: toType(r.service_types),
  status: r.status,
  price: r.price === null ? null : Number(r.price),
  dueDate: r.due_date,
  clientName: r.client?.full_name ?? '',
  assignedTo: r.assigned_to,
  assignedName: r.assignee?.full_name ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

async function uid() {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('not authenticated')
  return data.user.id
}

async function upload(requestId: string, kind: 'input' | 'deliverable', files: File[]) {
  const user = await uid()
  for (const f of files) {
    const path = `${requestId}/${kind}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_')}`
    must(await supabase.storage.from('request-files').upload(path, f))
    must(await supabase.from('request_files').insert({ request_id: requestId, uploaded_by: user, kind, name: f.name, file_path: path, size_bytes: f.size }))
  }
}

const supabaseApi: ServicesApi = {
  async listServiceTypes() {
    const rows = must(await supabase.from('service_types').select('*').eq('is_active', true).order('position')) as Row[]
    return rows.map(toType)
  },

  async createRequest(input) {
    const row = must(
      await supabase
        .from('service_requests')
        .insert({
          client_id: await uid(),
          service_type_id: input.serviceTypeId,
          title: input.title.trim(),
          description: input.description.trim(),
          location_lat: input.location?.lat ?? null,
          location_lng: input.location?.lng ?? null,
          location_note: input.locationNote.trim() || null,
          due_date: input.dueDate,
          academic_pledge: input.academicPledge,
        })
        .select('id')
        .single(),
    ) as Row
    if (input.files.length) await upload(row.id, 'input', input.files)
    return row.id
  },

  async myRequests() {
    const rows = must(await supabase.from('service_requests').select(SUMMARY_COLS).eq('client_id', await uid()).order('created_at', { ascending: false })) as Row[]
    return rows.map(toSummary)
  },

  async staffRequests(scope) {
    let q = supabase.from('service_requests').select(SUMMARY_COLS).order('created_at', { ascending: false })
    if (scope === 'assigned') q = q.eq('assigned_to', await uid())
    return (must(await q) as Row[]).map(toSummary)
  },

  async getRequest(id) {
    const r = must(
      await supabase
        .from('service_requests')
        .select(
          `${SUMMARY_COLS}, description, location_lat, location_lng, location_note,
           request_files(*), request_messages(*, sender:profiles(full_name)), request_events(*, actor:profiles(full_name))`,
        )
        .eq('id', id)
        .maybeSingle(),
    ) as Row | null
    if (!r) return null
    const files: RequestFile[] = await Promise.all(
      ((r.request_files ?? []) as Row[]).map(async (f) => {
        const { data } = await supabase.storage.from('request-files').createSignedUrl(f.file_path, 3600, { download: f.name })
        return { id: f.id, kind: f.kind, name: f.name, sizeBytes: f.size_bytes, url: data?.signedUrl ?? '#', uploadedBy: f.uploaded_by, createdAt: f.created_at }
      }),
    )
    const byDate = (a: Row, b: Row) => a.created_at.localeCompare(b.created_at)
    return {
      ...toSummary(r),
      clientId: r.client_id,
      description: r.description,
      location: r.location_lat !== null && r.location_lng !== null ? { lat: r.location_lat, lng: r.location_lng } : null,
      locationNote: r.location_note,
      files: files.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      messages: ((r.request_messages ?? []) as Row[]).sort(byDate).map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.sender?.full_name ?? '',
        senderIsStaff: m.sender_id !== r.client_id,
        body: m.body,
        isInternal: m.is_internal,
        createdAt: m.created_at,
      })),
      events: ((r.request_events ?? []) as Row[]).sort(byDate).map((e) => ({
        id: e.id,
        type: e.type,
        from: e.from_value,
        to: e.to_value,
        actorName: e.actor?.full_name ?? null,
        createdAt: e.created_at,
      })),
    }
  },

  async sendMessage(id, body, internal) {
    must(await supabase.from('request_messages').insert({ request_id: id, sender_id: await uid(), body: body.trim(), is_internal: internal }))
  },

  uploadFiles: (id, kind, files) => upload(id, kind, files),

  async transition(id, to, price) {
    must(await supabase.rpc('request_transition', { p_request: id, p_to: to, p_price: price ?? null }))
  },

  async assign(id, memberId) {
    must(await supabase.rpc('assign_request', { p_request: id, p_member: memberId }))
  },

  async listTeam() {
    const rows = must(await supabase.from('profiles').select('id, full_name, email').in('role', ['team', 'admin']).order('full_name')) as Row[]
    return rows.map((r) => ({ id: r.id, name: r.full_name || r.email }))
  },

  async adminServiceTypes() {
    const rows = must(await supabase.from('service_types').select('*').order('position')) as Row[]
    return rows.map(toType)
  },

  async saveServiceType(id, p) {
    must(
      await supabase
        .from('service_types')
        .update({
          name_ar: p.name.ar.trim(),
          name_en: p.name.en.trim(),
          description_ar: p.description.ar.trim(),
          description_en: p.description.en.trim(),
          pricing: p.pricing,
          price: p.price,
          unit_ar: p.unit?.ar.trim() || null,
          unit_en: p.unit?.en.trim() || null,
          is_active: p.isActive,
          position: p.position,
        })
        .eq('id', id),
    )
  },

  async latestMessages(ids) {
    const out: Record<string, LatestMessage> = {}
    if (!ids.length) return out
    const rows = must(
      await supabase
        .from('request_messages')
        .select('request_id, sender_id, body, created_at, service_requests(client_id)')
        .in('request_id', ids)
        .eq('is_internal', false)
        .order('created_at', { ascending: false }),
    ) as Row[]
    for (const m of rows) {
      if (out[m.request_id]) continue
      out[m.request_id] = { body: m.body, fromClient: m.sender_id === m.service_requests?.client_id, createdAt: m.created_at }
    }
    return out
  },
}

export const servicesApi: ServicesApi = isSupabaseConfigured ? supabaseApi : demoApi
