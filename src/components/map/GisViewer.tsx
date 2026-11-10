import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Feature } from 'geojson'
import { AlertTriangle, Eye, EyeOff, FileUp, Focus, Layers3, LocateFixed, Ruler, Square, Trash2, X } from 'lucide-react'
import {
  formatArea,
  formatDistance,
  GisFileError,
  parseGisFile,
  pathLength,
  polygonArea,
  type LL,
} from './gisFiles'
import { useLang } from '../../lib/lang'

export type LatLng = { lat: number; lng: number }
export interface ViewerFile {
  /** معرّف ثابت لتجنّب إعادة التحميل */
  key: string
  name: string
  source: Blob | string
}

interface LayerItem {
  id: string
  name: string
  color: string
  visible: boolean
  count: number
  warning: boolean
  fromKey?: string
}

const KSA: L.LatLngExpression = [24.2, 45.1]
const PALETTE = ['#0F5E4E', '#C9954A', '#3FB59A', '#7C3AED', '#DC2626', '#2563EB', '#DB2777']
const MEASURE_COLOR = '#C9954A'

const pinIcon = L.divIcon({
  className: '',
  html: `<svg viewBox="0 0 28 40" width="28" height="40" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.3))">
    <path d="M14 39C5 27 0 20 0 14a14 14 0 0 1 28 0c0 6-5 13-14 25z" fill="#C9954A"/>
    <circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 39],
})

/** نافذة خصائص المعلم — تُبنى عناصر DOM (لا HTML) لأن محتوى الملفات غير موثوق */
function propertiesPopup(f: Feature, emptyLabel: string) {
  const box = document.createElement('div')
  box.style.maxHeight = '220px'
  box.style.overflow = 'auto'
  box.dir = 'auto'
  const entries = Object.entries(f.properties ?? {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').slice(0, 40)
  if (!entries.length) {
    box.textContent = emptyLabel
    return box
  }
  const table = document.createElement('table')
  table.style.fontSize = '12px'
  table.style.borderCollapse = 'collapse'
  for (const [k, v] of entries) {
    const tr = table.insertRow()
    const th = document.createElement('th')
    th.textContent = k
    th.style.cssText = 'text-align:start;padding:2px 8px 2px 0;color:#5b6b67;font-weight:600;vertical-align:top'
    const td = tr.insertCell()
    td.textContent = String(v)
    td.style.cssText = 'padding:2px 0;word-break:break-word'
    tr.prepend(th)
  }
  box.appendChild(table)
  return box
}

export function GisViewer({
  height = 420,
  pick,
  marker,
  files,
  allowUpload = true,
  showLayersPanel = true,
}: {
  height?: number | string
  /** وضع اختيار الموقع: النقر يضع الدبوس */
  pick?: { value: LatLng | null; onChange: (v: LatLng | null) => void }
  /** دبوس للعرض فقط */
  marker?: LatLng | null
  /** ملفات تُعرض تلقائياً (مرفقات الطلب مثلاً) */
  files?: ViewerFile[]
  allowUpload?: boolean
  showLayersPanel?: boolean
}) {
  const { t } = useTranslation()
  const lang = useLang()
  const pageDir = lang === 'ar' ? 'rtl' : 'ltr'

  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const leafletLayers = useRef(new Map<string, L.GeoJSON>())
  const loadedKeys = useRef(new Set<string>())
  const pinRef = useRef<L.Marker | null>(null)
  const measureGroup = useRef<L.LayerGroup | null>(null)
  const draft = useRef<{ points: LL[]; shape: L.Path | null; vertices: L.LayerGroup | null }>({ points: [], shape: null, vertices: null })
  const toolRef = useRef<'distance' | 'area' | null>(null)
  const pickRef = useRef(pick)
  pickRef.current = pick
  const colorIdx = useRef(0)
  /** يزداد مع كل إنشاء للخريطة؛ التحميلات القديمة تُهمل (مهم مع StrictMode وإعادة التركيب) */
  const generation = useRef(0)
  // معالجات أحداث الخريطة تُقرأ من مرجع لتستخدم أحدث نسخة (اللغة مثلاً)
  const handlers = useRef({ addMeasurePoint: (_: L.LatLng) => {}, finishMeasure: () => {} })

  const [layers, setLayers] = useState<LayerItem[]>([])
  const [tool, setTool] = useState<'distance' | 'area' | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [cursor, setCursor] = useState<LL | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(0)
  const [panelOpen, setPanelOpen] = useState(true)
  const [dragOver, setDragOver] = useState(false)

  /* ───────── إنشاء الخريطة ───────── */
  useEffect(() => {
    if (!el.current) return
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' })
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' })
    const start = pick?.value ?? marker ?? null
    const m = L.map(el.current, { center: start ?? KSA, zoom: start ? 14 : 5, layers: [streets], zoomControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.control.layers({ [t('map.streets')]: streets, [t('map.satellite')]: satellite }, undefined, { position: 'topright' }).addTo(m)
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(m)
    measureGroup.current = L.layerGroup().addTo(m)

    m.on('mousemove', (e: L.LeafletMouseEvent) => setCursor(e.latlng))
    m.on('mouseout', () => setCursor(null))
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (toolRef.current) handlers.current.addMeasurePoint(e.latlng)
      else pickRef.current?.onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    m.on('dblclick', () => {
      if (toolRef.current) handlers.current.finishMeasure()
    })

    mapRef.current = m
    generation.current++
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    const layersMap = leafletLayers.current
    const keys = loadedKeys.current
    return () => {
      ro.disconnect()
      m.remove()
      mapRef.current = null
      pinRef.current = null
      layersMap.clear()
      keys.clear()
      setLayers([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ───────── الدبوس (اختيار أو عرض) ───────── */
  const pinValue = pick ? pick.value : (marker ?? null)
  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    if (!pinValue) {
      pinRef.current?.remove()
      pinRef.current = null
      return
    }
    if (!pinRef.current) {
      pinRef.current = L.marker(pinValue, { icon: pinIcon, draggable: Boolean(pick) }).addTo(m)
      pinRef.current.on('dragend', () => {
        const p = pinRef.current!.getLatLng()
        pickRef.current?.onChange({ lat: p.lat, lng: p.lng })
      })
    } else {
      pinRef.current.setLatLng(pinValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinValue?.lat, pinValue?.lng])

  /* ───────── الطبقات ───────── */
  const errorText = useCallback(
    (name: string, e: unknown) => t(`viewer.errors.${e instanceof GisFileError ? e.code : 'invalid'}`, { name }),
    [t],
  )

  const addFile = useCallback(
    async (source: Blob | string, name: string, fromKey?: string) => {
      setBusy((n) => n + 1)
      const gen = generation.current
      try {
        const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source
        const parsed = await parseGisFile(blob, name)
        const m = mapRef.current
        if (!m || gen !== generation.current) return
        let bounds: L.LatLngBounds | null = null
        const items: LayerItem[] = []
        for (const p of parsed) {
          const color = PALETTE[colorIdx.current++ % PALETTE.length]
          const layer = L.geoJSON(p.data, {
            style: { color, weight: 2, fillOpacity: 0.2 },
            pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }),
            onEachFeature: (f, l) => l.bindPopup(() => propertiesPopup(f, t('viewer.noAttributes')), { maxWidth: 320 }),
          }).addTo(m)
          const id = crypto.randomUUID()
          leafletLayers.current.set(id, layer)
          items.push({ id, name: p.name, color, visible: true, count: p.data.features.length, warning: p.projectedWarning, fromKey })
          // طبقة بإحداثيات مُسقَطة تقع خارج الكرة الأرضية؛ لا نقرّب إليها
          const b = layer.getBounds()
          if (b.isValid() && !p.projectedWarning) bounds = bounds ? bounds.extend(b) : b
        }
        setLayers((ls) => [...ls, ...items])
        if (bounds) m.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
      } catch (e) {
        setErrors((es) => [...es, errorText(name, e)])
      } finally {
        setBusy((n) => n - 1)
      }
    },
    [errorText, t],
  )

  // الملفات القادمة من الخارج: تحميل الجديد وإزالة المحذوف
  const fileKeys = (files ?? []).map((f) => f.key).join('|')
  useEffect(() => {
    if (!mapRef.current) return
    const current = new Set((files ?? []).map((f) => f.key))
    for (const f of files ?? []) {
      if (loadedKeys.current.has(f.key)) continue
      loadedKeys.current.add(f.key)
      void addFile(f.source, f.name, f.key)
    }
    for (const key of [...loadedKeys.current]) {
      if (current.has(key)) continue
      loadedKeys.current.delete(key)
      setLayers((ls) => {
        for (const l of ls.filter((x) => x.fromKey === key)) {
          leafletLayers.current.get(l.id)?.remove()
          leafletLayers.current.delete(l.id)
        }
        return ls.filter((x) => x.fromKey !== key)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKeys, addFile])

  function toggleLayer(id: string) {
    const layer = leafletLayers.current.get(id)
    const m = mapRef.current
    if (!layer || !m) return
    setLayers((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l
        if (l.visible) layer.remove()
        else layer.addTo(m)
        return { ...l, visible: !l.visible }
      }),
    )
  }

  function zoomTo(id: string) {
    const b = leafletLayers.current.get(id)?.getBounds()
    if (b?.isValid()) mapRef.current?.fitBounds(b, { padding: [30, 30], maxZoom: 17 })
  }

  function removeLayer(id: string) {
    leafletLayers.current.get(id)?.remove()
    leafletLayers.current.delete(id)
    setLayers((ls) => ls.filter((l) => l.id !== id))
  }

  function onPick(list: FileList | null) {
    for (const f of [...(list ?? [])]) void addFile(f, f.name)
  }

  /* ───────── القياس ───────── */
  function updateDraft() {
    const m = mapRef.current
    const d = draft.current
    if (!m) return
    d.shape?.remove()
    const latlngs = d.points.map((p) => L.latLng(p.lat, p.lng))
    const style = { color: MEASURE_COLOR, weight: 3, dashArray: '6 6', fillOpacity: 0.15 }
    const shape: L.Path = toolRef.current === 'area' && latlngs.length >= 3 ? L.polygon(latlngs, style) : L.polyline(latlngs, style)
    shape.addTo(m)
    d.shape = shape
    setReading(
      toolRef.current === 'area'
        ? d.points.length >= 3
          ? formatArea(polygonArea(d.points), lang)
          : t('viewer.measure.areaHint')
        : d.points.length >= 2
          ? formatDistance(pathLength(d.points), lang)
          : t('viewer.measure.distanceHint'),
    )
  }

  function addMeasurePoint(ll: L.LatLng) {
    const d = draft.current
    const last = d.points[d.points.length - 1]
    if (last && Math.abs(last.lat - ll.lat) < 1e-9 && Math.abs(last.lng - ll.lng) < 1e-9) return
    d.points.push({ lat: ll.lat, lng: ll.lng })
    if (!d.vertices) d.vertices = L.layerGroup().addTo(mapRef.current!)
    L.circleMarker(ll, { radius: 4, color: '#fff', weight: 2, fillColor: MEASURE_COLOR, fillOpacity: 1 }).addTo(d.vertices)
    updateDraft()
  }

  function clearDraft() {
    const d = draft.current
    d.shape?.remove()
    d.vertices?.remove()
    draft.current = { points: [], shape: null, vertices: null }
  }

  function finishMeasure() {
    const d = draft.current
    const kind = toolRef.current
    const enough = kind === 'area' ? d.points.length >= 3 : d.points.length >= 2
    if (enough && d.shape && measureGroup.current) {
      const label = kind === 'area' ? formatArea(polygonArea(d.points), lang) : formatDistance(pathLength(d.points), lang)
      const done = (kind === 'area'
        ? L.polygon(d.points, { color: MEASURE_COLOR, weight: 3, fillOpacity: 0.15 })
        : L.polyline(d.points, { color: MEASURE_COLOR, weight: 3 })
      ).bindTooltip(label, { permanent: true, direction: 'center', className: 'miqyas-measure-label' })
      done.addTo(measureGroup.current)
    }
    clearDraft()
    setTool(null)
  }

  handlers.current = { addMeasurePoint, finishMeasure }

  useEffect(() => {
    toolRef.current = tool
    const m = mapRef.current
    if (!m) return
    if (tool) {
      m.doubleClickZoom.disable()
      el.current?.classList.add('cursor-crosshair')
      setReading(t(tool === 'area' ? 'viewer.measure.areaHint' : 'viewer.measure.distanceHint'))
    } else {
      m.doubleClickZoom.enable()
      el.current?.classList.remove('cursor-crosshair')
      setReading(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && toolRef.current) {
        clearDraft()
        setTool(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  function startTool(kind: 'distance' | 'area') {
    clearDraft()
    setTool((cur) => (cur === kind ? null : kind))
  }

  function locateMe() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const v = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        pickRef.current?.onChange(v)
        mapRef.current?.setView(v, 15)
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const btn = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${active ? 'bg-primary text-white' : 'text-ink hover:bg-primary-50'}`

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${dragOver ? 'border-secondary ring-4 ring-secondary/20' : 'border-primary/15'}`}
      dir="ltr"
      onDragOver={(e) => {
        if (!allowUpload) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!allowUpload) return
        e.preventDefault()
        setDragOver(false)
        onPick(e.dataTransfer.files)
      }}
    >
      <div ref={el} style={{ height }} className="z-0 w-full" />

      {/* شريط الأدوات */}
      <div dir={pageDir} className="absolute left-2 right-20 top-2 z-[500] flex w-fit flex-wrap items-center gap-1 rounded-xl bg-white/95 p-1 shadow-lg backdrop-blur">
        {allowUpload && (
          <label className={`${btn(false)} cursor-pointer`}>
            <FileUp className="h-4 w-4 text-secondary" /> {t('viewer.addFile')}
            <input type="file" multiple accept=".geojson,.json,.kml,.kmz,.zip" className="sr-only" onChange={(e) => { onPick(e.target.files); e.target.value = '' }} />
          </label>
        )}
        <button type="button" className={btn(tool === 'distance')} onClick={() => startTool('distance')} aria-pressed={tool === 'distance'}>
          <Ruler className="h-4 w-4" /> {t('viewer.measure.distance')}
        </button>
        <button type="button" className={btn(tool === 'area')} onClick={() => startTool('area')} aria-pressed={tool === 'area'}>
          <Square className="h-4 w-4" /> {t('viewer.measure.area')}
        </button>
        <button type="button" className={btn(false)} onClick={() => { clearDraft(); measureGroup.current?.clearLayers(); setTool(null) }} title={t('viewer.measure.clear')} aria-label={t('viewer.measure.clear')}>
          <Trash2 className="h-4 w-4" />
        </button>
        {pick && 'geolocation' in navigator && (
          <button type="button" className={btn(false)} onClick={locateMe}>
            <LocateFixed className="h-4 w-4" /> {t('map.locateMe')}
          </button>
        )}
      </div>

      {/* قراءة القياس */}
      {tool && (
        <div dir={pageDir} className="absolute left-1/2 top-14 z-[500] flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">
          <span>{reading}</span>
          <button type="button" onClick={finishMeasure} className="rounded-full bg-accent px-3 py-0.5 text-xs">{t('viewer.measure.finish')}</button>
        </div>
      )}

      {/* لوحة الطبقات */}
      {showLayersPanel && layers.length > 0 && (
        <div dir={pageDir} className="absolute bottom-8 left-2 z-[500] w-60 max-w-[70%] rounded-xl bg-white/95 text-xs shadow-lg backdrop-blur">
          <button type="button" onClick={() => setPanelOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 font-semibold">
            <span className="inline-flex items-center gap-1.5"><Layers3 className="h-4 w-4 text-primary" /> {t('viewer.layers')} ({layers.length})</span>
            <span className="text-muted">{panelOpen ? '−' : '+'}</span>
          </button>
          {panelOpen && (
            <ul className="max-h-48 space-y-1 overflow-y-auto border-t border-primary/10 p-2">
              {layers.map((l) => (
                <li key={l.id} className="rounded-lg px-1.5 py-1 hover:bg-sand">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: l.color }} />
                    <span className="min-w-0 flex-1 truncate" title={l.name} dir="auto">{l.name}</span>
                    <span className="shrink-0 text-muted">{l.count}</span>
                    <button type="button" onClick={() => zoomTo(l.id)} className="rounded p-0.5 text-muted hover:text-primary" aria-label={t('viewer.zoomTo')}><Focus className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => toggleLayer(l.id)} className="rounded p-0.5 text-muted hover:text-primary" aria-label={t('viewer.toggle')}>
                      {l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    {!l.fromKey && (
                      <button type="button" onClick={() => removeLayer(l.id)} className="rounded p-0.5 text-muted hover:text-red-600" aria-label={t('editor.remove')}><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                  {l.warning && (
                    <p className="mt-1 flex gap-1 text-[11px] leading-snug text-[#8a5f22]"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{t('viewer.projectedWarning')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* الأخطاء */}
      {errors.length > 0 && (
        <div dir={pageDir} className="absolute right-2 top-14 z-[500] w-72 max-w-[80%] space-y-1">
          {errors.slice(-3).map((e, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{e}</span>
              <button type="button" onClick={() => setErrors((es) => es.filter((x) => x !== e))} aria-label={t('common.close')}><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {busy > 0 && (
        <div className="absolute inset-0 z-[400] grid place-items-center bg-white/40">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-secondary/30 border-t-primary" />
        </div>
      )}

      {dragOver && (
        <div dir={pageDir} className="pointer-events-none absolute inset-0 z-[600] grid place-items-center bg-secondary/15 text-sm font-bold text-primary">
          {t('viewer.dropHere')}
        </div>
      )}

      {/* الإحداثيات */}
      <div className="pointer-events-none absolute bottom-1 left-2 z-[500] rounded bg-white/85 px-2 py-0.5 font-mono text-[11px] text-ink">
        {cursor ? `${cursor.lat.toFixed(5)}, ${cursor.lng.toFixed(5)}` : 'WGS 84'}
      </div>
    </div>
  )
}
