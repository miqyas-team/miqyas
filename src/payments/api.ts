import { isSupabaseConfigured, supabase } from '../lib/supabase'

export type PaymentKind = 'course' | 'request'
export type PaymentStatus = 'pending_review' | 'confirmed' | 'rejected'
export type CouponScope = 'all' | 'courses' | 'services'

export interface SiteSettings {
  seller_name: string
  vat_number: string
  cr_number: string
  seller_address: string
  bank_name: string
  bank_account_name: string
  bank_iban: string
  contact_email: string
  contact_whatsapp: string
}

export interface Quote {
  description: string
  listPrice: number
  percentOff: number
  discount: number
  total: number
  couponError: 'invalid' | 'expired' | 'used_up' | 'scope' | null
}

export interface Payment {
  id: string
  userName: string
  kind: PaymentKind
  refId: string
  description: string
  listPrice: number
  couponCode: string | null
  discount: number
  total: number
  vatAmount: number
  status: PaymentStatus
  receiptUrl: string
  rejectionReason: string | null
  invoiceNumber: string | null
  createdAt: string
  reviewedAt: string | null
}

export interface Coupon {
  id: string
  code: string
  percentOff: number
  scope: CouponScope
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  isActive: boolean
  note: string | null
}

export interface PaymentsApi {
  getSettings(): Promise<SiteSettings>
  saveSettings(s: SiteSettings): Promise<void>
  quote(kind: PaymentKind, ref: string, coupon: string): Promise<Quote>
  submit(kind: PaymentKind, ref: string, coupon: string, receipt: File): Promise<string>
  myPayments(): Promise<Payment[]>
  listPayments(): Promise<Payment[]>
  getPayment(id: string): Promise<Payment | null>
  review(id: string, approve: boolean, reason: string): Promise<void>
  listCoupons(): Promise<Coupon[]>
  saveCoupon(id: string | null, c: Omit<Coupon, 'id' | 'usedCount'>): Promise<void>
}

export const VAT_RATE = 0.15
export const vatOf = (total: number) => Math.round((total - total / (1 + VAT_RATE)) * 100) / 100
export const MAX_RECEIPT_MB = 10

/** رمز QR للفاتورة المبسّطة (المرحلة الأولى — هيئة الزكاة): TLV ثم Base64 */
export function zatcaQr(seller: string, vat: string, isoTime: string, total: number, vatAmount: number) {
  const enc = new TextEncoder()
  const fields = [seller, vat, isoTime, total.toFixed(2), vatAmount.toFixed(2)]
  const bytes: number[] = []
  fields.forEach((v, i) => {
    const b = enc.encode(v)
    bytes.push(i + 1, b.length, ...b)
  })
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

/* ═════════════════ وضع المعاينة ═════════════════ */
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 200))
const read = <T,>(k: string, fb: () => T): T => {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : fb()
  } catch {
    return fb()
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* تجاهل */
  }
}

const demoSettings = (): SiteSettings => ({
  seller_name: 'مقياس (بيانات تجريبية)',
  vat_number: '300000000000003',
  cr_number: '',
  seller_address: '',
  bank_name: 'بنك تجريبي',
  bank_account_name: 'مقياس (تجريبي)',
  bank_iban: 'SA00 0000 0000 0000 0000 0000',
  contact_email: '',
  contact_whatsapp: '',
})
const demoCoupons = (): Coupon[] => [
  { id: 'cp-1', code: 'STUDENT20', percentOff: 20, scope: 'courses', maxUses: 100, usedCount: 0, expiresAt: null, isActive: true, note: 'خصم الطلاب (نموذج)' },
]

type DemoPayment = Omit<Payment, 'receiptUrl'> & { receiptDataUrl?: string }

function demoQuote(kind: PaymentKind, ref: string, coupon: string): Quote {
  let price: number | null = null
  let desc = ''
  if (kind === 'course') {
    const st = read<{ enrollments?: Record<string, { status: string }> }>('miqyas-demo-courses', () => ({}))
    const catalog = read<{ id: string; price: number; title: { ar: string } }[]>('miqyas-demo-catalog', () => [])
    const fallback: Record<string, { price: number; title: string }> = {
      'c-arcgis': { price: 349, title: 'التحليل المكاني باستخدام ArcGIS Pro' },
      'c-python': { price: 799, title: 'Python لنظم المعلومات الجغرافية' },
      'c-rs': { price: 199, title: 'أساسيات الاستشعار عن بعد' },
    }
    if (st.enrollments?.[ref]?.status === 'pending_payment') {
      const c = catalog.find((x) => x.id === ref)
      price = c?.price ?? fallback[ref]?.price ?? null
      desc = c?.title.ar ?? fallback[ref]?.title ?? ''
    }
  } else {
    const r = read<{ id: string; price: number | null; title: string; status: string }[]>('miqyas-demo-requests', () => []).find((x) => x.id === ref)
    if (r?.status === 'awaiting_payment') {
      price = r.price
      desc = r.title
    }
  }
  if (price === null) throw new Error('nothing to pay')
  let off = 0
  let err: Quote['couponError'] = null
  const code = coupon.trim().toUpperCase()
  if (code) {
    const c = read('miqyas-demo-coupons', demoCoupons).find((x) => x.code === code)
    if (!c || !c.isActive) err = 'invalid'
    else if (c.expiresAt && new Date(c.expiresAt) < new Date(new Date().toDateString())) err = 'expired'
    else if (c.maxUses !== null && c.usedCount >= c.maxUses) err = 'used_up'
    else if ((c.scope === 'courses' && kind !== 'course') || (c.scope === 'services' && kind !== 'request')) err = 'scope'
    else off = c.percentOff
  }
  const discount = Math.round(price * off) / 100
  return { description: desc, listPrice: price, percentOff: off, discount, total: Math.round((price - discount) * 100) / 100, couponError: err }
}

const toDemoOut = ({ receiptDataUrl, ...p }: DemoPayment): Payment => ({ ...p, receiptUrl: receiptDataUrl ?? '#' })

const demoApi: PaymentsApi = {
  getSettings: async () => delay(read('miqyas-demo-settings', demoSettings)),
  async saveSettings(s) {
    write('miqyas-demo-settings', s)
    await delay(null)
  },
  quote: async (kind, ref, coupon) => delay(demoQuote(kind, ref, coupon)),
  async submit(kind, ref, coupon, receipt) {
    const q = demoQuote(kind, ref, coupon)
    if (q.couponError) throw new Error(`coupon ${q.couponError}`)
    const all = read<DemoPayment[]>('miqyas-demo-payments', () => [])
    if (all.some((p) => p.refId === ref && p.status === 'pending_review')) throw new Error('already submitted')
    const dataUrl = receipt.size <= 1_500_000
      ? await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(receipt) })
      : undefined
    const id = crypto.randomUUID()
    all.unshift({
      id, userName: 'متدرب تجريبي', kind, refId: ref, description: q.description, listPrice: q.listPrice,
      couponCode: q.percentOff ? coupon.trim().toUpperCase() : null, discount: q.discount, total: q.total, vatAmount: vatOf(q.total),
      status: 'pending_review', rejectionReason: null, invoiceNumber: null, createdAt: new Date().toISOString(), reviewedAt: null, receiptDataUrl: dataUrl,
    })
    write('miqyas-demo-payments', all)
    return delay(id)
  },
  myPayments: async () => delay(read<DemoPayment[]>('miqyas-demo-payments', () => []).map(toDemoOut)),
  listPayments: async () => delay(read<DemoPayment[]>('miqyas-demo-payments', () => []).map(toDemoOut)),
  getPayment: async (id) => {
    const p = read<DemoPayment[]>('miqyas-demo-payments', () => []).find((x) => x.id === id)
    return delay(p ? toDemoOut(p) : null)
  },
  async review(id, approve, reason) {
    const all = read<DemoPayment[]>('miqyas-demo-payments', () => [])
    const p = all.find((x) => x.id === id)
    if (!p || p.status !== 'pending_review') throw new Error('not pending')
    if (!approve) {
      if (!reason.trim()) throw new Error('reason required')
      Object.assign(p, { status: 'rejected', rejectionReason: reason.trim(), reviewedAt: new Date().toISOString() })
    } else {
      const n = all.filter((x) => x.invoiceNumber).length + 1
      Object.assign(p, { status: 'confirmed', reviewedAt: new Date().toISOString(), invoiceNumber: `INV-${new Date().getFullYear()}-${String(n).padStart(5, '0')}` })
      if (p.couponCode) {
        const cs = read('miqyas-demo-coupons', demoCoupons)
        const c = cs.find((x) => x.code === p.couponCode)
        if (c) c.usedCount++
        write('miqyas-demo-coupons', cs)
      }
      if (p.kind === 'course') {
        const st = read<{ enrollments?: Record<string, { status: string }> }>('miqyas-demo-courses', () => ({}))
        if (st.enrollments?.[p.refId]) st.enrollments[p.refId].status = 'active'
        write('miqyas-demo-courses', st)
      } else {
        const rs = read<{ id: string; status: string; events: unknown[]; updatedAt: string }[]>('miqyas-demo-requests', () => [])
        const r = rs.find((x) => x.id === p.refId)
        if (r && r.status === 'awaiting_payment') {
          r.events.push({ id: crypto.randomUUID(), type: 'status', from: 'awaiting_payment', to: 'in_progress', createdAt: new Date().toISOString() })
          r.status = 'in_progress'
          r.updatedAt = new Date().toISOString()
        }
        write('miqyas-demo-requests', rs)
      }
    }
    write('miqyas-demo-payments', all)
    await delay(null)
  },
  listCoupons: async () => delay(read('miqyas-demo-coupons', demoCoupons)),
  async saveCoupon(id, c) {
    const all = read('miqyas-demo-coupons', demoCoupons)
    if (id) Object.assign(all.find((x) => x.id === id) ?? {}, c)
    else all.push({ ...c, id: crypto.randomUUID(), usedCount: 0 })
    write('miqyas-demo-coupons', all)
    await delay(null)
  },
}

/* ═════════════════ Supabase ═════════════════ */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

async function toPayment(r: Row): Promise<Payment> {
  const { data } = await supabase.storage.from('receipts').createSignedUrl(r.receipt_path, 3600)
  return {
    id: r.id, userName: r.payer?.full_name ?? '', kind: r.kind, refId: r.course_id ?? r.request_id, description: r.description,
    listPrice: Number(r.list_price), couponCode: r.coupon_code, discount: Number(r.discount), total: Number(r.total), vatAmount: Number(r.vat_amount),
    status: r.status, receiptUrl: data?.signedUrl ?? '#', rejectionReason: r.rejection_reason, invoiceNumber: r.invoice_number,
    createdAt: r.created_at, reviewedAt: r.reviewed_at,
  }
}
const PAY_COLS = '*, payer:profiles!payments_user_id_fkey(full_name)'

const supabaseApi: PaymentsApi = {
  async getSettings() {
    const rows = must(await supabase.from('site_settings').select('key, value')) as Row[]
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as unknown as SiteSettings
  },
  async saveSettings(s) {
    for (const [key, value] of Object.entries(s)) {
      must(await supabase.from('site_settings').update({ value: String(value ?? '').trim(), updated_at: new Date().toISOString() }).eq('key', key))
    }
  },
  async quote(kind, ref, coupon) {
    const r = must(await supabase.rpc('quote_payment', { p_kind: kind, p_ref: ref, p_coupon: coupon || null })) as Row
    return { description: r.description, listPrice: Number(r.list_price), percentOff: r.percent_off, discount: Number(r.discount), total: Number(r.total), couponError: r.coupon_error }
  },
  async submit(kind, ref, coupon, receipt) {
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) throw new Error('not authenticated')
    const path = `${u.user.id}/${crypto.randomUUID()}-${receipt.name.replace(/[^\w.\-]+/g, '_')}`
    must(await supabase.storage.from('receipts').upload(path, receipt))
    return must(await supabase.rpc('submit_payment', { p_kind: kind, p_ref: ref, p_coupon: coupon || null, p_receipt_path: path })) as string
  },
  async myPayments() {
    const { data: u } = await supabase.auth.getUser()
    const rows = must(await supabase.from('payments').select(PAY_COLS).eq('user_id', u.user?.id ?? '').order('created_at', { ascending: false })) as Row[]
    return Promise.all(rows.map(toPayment))
  },
  async listPayments() {
    const rows = must(await supabase.from('payments').select(PAY_COLS).order('created_at', { ascending: false }).limit(300)) as Row[]
    return Promise.all(rows.map(toPayment))
  },
  async getPayment(id) {
    const r = must(await supabase.from('payments').select(PAY_COLS).eq('id', id).maybeSingle()) as Row | null
    return r ? toPayment(r) : null
  },
  async review(id, approve, reason) {
    must(await supabase.rpc('review_payment', { p_payment: id, p_approve: approve, p_reason: reason || null }))
  },
  async listCoupons() {
    const rows = must(await supabase.from('coupons').select('*').order('created_at', { ascending: false })) as Row[]
    return rows.map((c) => ({ id: c.id, code: c.code, percentOff: c.percent_off, scope: c.scope, maxUses: c.max_uses, usedCount: c.used_count, expiresAt: c.expires_at, isActive: c.is_active, note: c.note }))
  },
  async saveCoupon(id, c) {
    const row = { code: c.code.trim().toUpperCase(), percent_off: c.percentOff, scope: c.scope, max_uses: c.maxUses, expires_at: c.expiresAt || null, is_active: c.isActive, note: c.note || null }
    must(id ? await supabase.from('coupons').update(row).eq('id', id) : await supabase.from('coupons').insert(row))
  },
}

export const paymentsApi: PaymentsApi = isSupabaseConfigured ? supabaseApi : demoApi
