import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../lib/lang'

/** ألوان المخططات — مُتحقَّق منها (تمييز عمى الألوان والتباين) مقابل سطح أبيض */
export const SERIES = { courses: '#11907A', services: '#E0703A' } as const
const GRID = '#E7E5DF'
const INK_MUTED = '#5b6b67'

export function fmtNumber(n: number, lang: 'ar' | 'en', compact = false) {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(n)
}

export function fmtMonth(ym: string, lang: 'ar' | 'en') {
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { month: 'short' }).format(new Date(y, m - 1, 1))
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  // 0 حتى القياس الأول: لا نرسم بعرض افتراضي قد يتجاوز الشاشة على الجوال
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    setW(Math.max(260, Math.round(ref.current.getBoundingClientRect().width)))
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: ReactNode; tone?: 'warn' }) {
  return (
    <div className={`rounded-card border bg-white p-5 ${tone === 'warn' ? 'border-accent/50' : 'border-primary/10'}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * أعمدة مكدّسة شهرية (سلسلتان). الزمن يُعكس مع RTL ليقرأ من اليمين.
 * تلميح لكل عمود عند المرور أو التركيز، وقيمة الإجمالي على رأس العمود.
 */
export function StackedColumns({
  data,
  series,
  formatValue,
  ariaLabel,
}: {
  data: { key: string; label: string; values: number[] }[]
  series: { color: string; label: string }[]
  formatValue: (n: number, compact?: boolean) => string
  ariaLabel: string
}) {
  const lang = useLang()
  const rtl = lang === 'ar'
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const height = 240
  const pad = { top: 22, bottom: 26, start: 44, end: 8 }
  const innerW = width - pad.start - pad.end
  const innerH = height - pad.top - pad.bottom
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0))
  const max = niceMax(Math.max(...totals, 1))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const band = innerW / Math.max(data.length, 1)
  const barW = Math.min(24, band * 0.5)
  const y = (v: number) => pad.top + innerH - (v / max) * innerH
  // موضع العمود: من اليمين في العربية
  const cx = (i: number) => {
    const idx = rtl ? data.length - 1 - i : i
    return (rtl ? pad.end : pad.start) + band * idx + band / 2
  }
  const axisX = rtl ? width - pad.start : pad.start

  return (
    <div ref={ref} className="relative w-full min-w-0" style={{ minHeight: height }}>
      {width > 0 && <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={rtl ? pad.end : pad.start} x2={rtl ? width - pad.start : width - pad.end} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth={1} />
            <text x={rtl ? axisX + 6 : axisX - 6} y={y(tv)} dy="0.32em" textAnchor={rtl ? 'start' : 'end'} fontSize={11} fill={INK_MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatValue(tv, true)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          let acc = 0
          const total = totals[i]
          const segs = d.values.map((v, si) => {
            const y0 = y(acc)
            acc += v
            const y1 = y(acc)
            return { si, y0, y1, v }
          }).filter((s) => s.v > 0)
          const top = segs[segs.length - 1]
          return (
            <g
              key={d.key}
              tabIndex={0}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${d.label}: ${series.map((s, si) => `${s.label} ${formatValue(d.values[si])}`).join('، ')}`}
              style={{ outline: 'none' }}
            >
              {/* منطقة التفاعل أوسع من العمود */}
              <rect x={cx(i) - band / 2} y={pad.top} width={band} height={innerH} fill={hover === i ? '#167D680A' : 'transparent'} />
              {segs.map((s) => {
                const h = Math.max(0, s.y0 - s.y1 - (s === top ? 0 : 2)) // فجوة 2px بين المقاطع
                const isTop = s === top
                const r = isTop ? Math.min(4, h) : 0
                const x0 = cx(i) - barW / 2
                const yTop = s.y1
                // رأس مستدير 4px، والقاعدة مربعة
                const path = `M${x0},${yTop + h} L${x0},${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} L${x0 + barW - r},${yTop} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} L${x0 + barW},${yTop + h} Z`
                return <path key={s.si} d={path} fill={series[s.si].color} opacity={hover === null || hover === i ? 1 : 0.55} />
              })}
              {total > 0 && (
                <text x={cx(i)} y={y(total) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#162220">
                  {formatValue(total, true)}
                </text>
              )}
              <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={INK_MUTED}>{d.label}</text>
            </g>
          )
        })}
      </svg>}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-xl bg-white px-3 py-2 text-xs shadow-xl ring-1 ring-primary/10"
          style={{ left: Math.min(Math.max(cx(hover) - 72, 0), width - 150), top: 0 }}
        >
          <p className="mb-1 font-semibold text-ink">{data[hover].label}</p>
          {series.map((s, si) => (
            <p key={s.label} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-ink">{formatValue(data[hover].values[si])}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** أشرطة أفقية لسلسلة واحدة مع القيمة عند الطرف */
export function HBars({
  rows,
  color = SERIES.courses,
  formatValue,
}: {
  rows: { key: string; label: string; value: number; href?: string }[]
  color?: string
  formatValue: (n: number) => string
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const content = (
          <>
            <span className="w-28 shrink-0 truncate text-sm text-ink/85" title={r.label}>{r.label}</span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className="h-3 rounded-e-[4px]"
                style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`, background: color }}
              />
              <span className="shrink-0 text-xs font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(r.value)}</span>
            </span>
          </>
        )
        return (
          <li key={r.key} title={`${r.label}: ${formatValue(r.value)}`}>
            {r.href ? (
              <Link to={r.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-0.5 hover:bg-primary-50/60">{content}</Link>
            ) : (
              <div className="flex items-center gap-3">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
