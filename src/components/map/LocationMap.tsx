import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LocateFixed } from 'lucide-react'

export type LatLng = { lat: number; lng: number }

/** مركز المملكة تقريباً */
const KSA: L.LatLngExpression = [24.2, 45.1]

/** دبوس مقياس الذهبي بدل أيقونة Leaflet الافتراضية */
const pinIcon = L.divIcon({
  className: '',
  html: `<svg viewBox="0 0 28 40" width="28" height="40" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.3))">
    <path d="M14 39C5 27 0 20 0 14a14 14 0 0 1 28 0c0 6-5 13-14 25z" fill="#C9954A"/>
    <circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 39],
})

function baseLayers() {
  const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  })
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Imagery &copy; Esri',
  })
  return { streets, satellite }
}

/**
 * خريطة الموقع: اختيار نقطة بالنقر (editable) أو عرضها فقط.
 * الحاوية LTR لأن أدوات Leaflet مصممة لهذا الاتجاه.
 */
export function LocationMap({
  value,
  onChange,
  height = 320,
}: {
  value: LatLng | null
  onChange?: (v: LatLng | null) => void
  height?: number
}) {
  const { t } = useTranslation()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editable = Boolean(onChange)

  useEffect(() => {
    if (!el.current) return
    const { streets, satellite } = baseLayers()
    const m = L.map(el.current, { center: value ?? KSA, zoom: value ? 14 : 5, layers: [streets], attributionControl: true })
    L.control.layers({ [t('map.streets')]: streets, [t('map.satellite')]: satellite }, undefined, { position: 'topright' }).addTo(m)
    L.control.scale({ imperial: false }).addTo(m)
    if (editable) {
      m.on('click', (e: L.LeafletMouseEvent) => onChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    }
    map.current = m
    // الحاوية قد تتغير أبعادها بعد الرسم الأول
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
      marker.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // مزامنة الدبوس مع القيمة
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!value) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (!marker.current) {
      marker.current = L.marker(value, { icon: pinIcon, draggable: editable }).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng()
        onChangeRef.current?.({ lat: p.lat, lng: p.lng })
      })
    } else {
      marker.current.setLatLng(value)
    }
    if (!editable) m.setView(value, 14)
  }, [value, editable])

  function locateMe() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const v = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        onChange?.(v)
        map.current?.setView(v, 15)
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15" dir="ltr">
      <div ref={el} style={{ height }} className="z-0 w-full" />
      {editable && 'geolocation' in navigator && (
        <button
          type="button"
          onClick={locateMe}
          className="absolute bottom-3 left-3 z-[400] inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-primary shadow-lg hover:bg-sand"
          dir="auto"
        >
          <LocateFixed className="h-4 w-4" /> {t('map.locateMe')}
        </button>
      )}
    </div>
  )
}
