/**
 * قراءة ملفات GIS في المتصفح مباشرة (لا تُرفع لأي خادم):
 * GeoJSON · KML · KMZ · Shapefile مضغوط (zip)
 */
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import { strFromU8, unzipSync } from 'fflate'

export type GisKind = 'geojson' | 'kml' | 'kmz' | 'shapefile'

export interface ParsedLayer {
  name: string
  data: FeatureCollection
  /** إحداثيات خارج نطاق الدرجات: غالباً نظام مُسقَط بلا ملف .prj */
  projectedWarning: boolean
}

export class GisFileError extends Error {
  constructor(public code: 'unsupported' | 'invalid' | 'empty' | 'tooLarge' | 'rawShp') {
    super(code)
  }
}

export const MAX_PREVIEW_MB = 30

export function detectGisKind(name: string): GisKind | null {
  const n = name.toLowerCase()
  if (n.endsWith('.geojson') || n.endsWith('.json')) return 'geojson'
  if (n.endsWith('.kml')) return 'kml'
  if (n.endsWith('.kmz')) return 'kmz'
  if (n.endsWith('.zip')) return 'shapefile'
  return null
}

export const isPreviewable = (name: string) => detectGisKind(name) !== null

const baseName = (name: string) => name.replace(/\.[^.]+$/, '')

function toCollection(json: unknown): FeatureCollection {
  const j = json as { type?: string; features?: unknown[] }
  if (j?.type === 'FeatureCollection' && Array.isArray(j.features)) return j as FeatureCollection
  if (j?.type === 'Feature') return { type: 'FeatureCollection', features: [j as Feature] }
  const geomTypes = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']
  if (j?.type && geomTypes.includes(j.type)) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: j as Geometry }] }
  }
  throw new GisFileError('invalid')
}

function* positions(g: Geometry | null): Generator<Position> {
  if (!g) return
  switch (g.type) {
    case 'Point': yield g.coordinates; break
    case 'MultiPoint': case 'LineString': yield* g.coordinates; break
    case 'MultiLineString': case 'Polygon': for (const r of g.coordinates) yield* r; break
    case 'MultiPolygon': for (const p of g.coordinates) for (const r of p) yield* r; break
    case 'GeometryCollection': for (const x of g.geometries) yield* positions(x); break
  }
}

function looksProjected(fc: FeatureCollection) {
  let checked = 0
  for (const f of fc.features) {
    for (const [x, y] of positions(f.geometry)) {
      if (Math.abs(x) > 180 || Math.abs(y) > 90) return true
      if (++checked > 500) return false
    }
  }
  return false
}

function finalize(name: string, data: FeatureCollection): ParsedLayer {
  const features = data.features.filter((f) => f && f.geometry)
  if (!features.length) throw new GisFileError('empty')
  const fc: FeatureCollection = { type: 'FeatureCollection', features }
  return { name, data: fc, projectedWarning: looksProjected(fc) }
}

function parseKmlText(text: string): FeatureCollection {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new GisFileError('invalid')
  return kmlToGeoJSON(doc) as FeatureCollection
}

/** يحوّل الملف إلى طبقة أو أكثر (الملف المضغوط قد يحوي عدة Shapefiles) */
export async function parseGisFile(file: Blob, name: string): Promise<ParsedLayer[]> {
  const kind = detectGisKind(name)
  if (!kind) {
    if (/\.(shp|dbf|shx|prj)$/i.test(name)) throw new GisFileError('rawShp')
    throw new GisFileError('unsupported')
  }
  if (file.size > MAX_PREVIEW_MB * 1_000_000) throw new GisFileError('tooLarge')

  try {
    if (kind === 'geojson') {
      return [finalize(baseName(name), toCollection(JSON.parse(await file.text())))]
    }
    if (kind === 'kml') {
      return [finalize(baseName(name), parseKmlText(await file.text()))]
    }
    if (kind === 'kmz') {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
      const kmlEntry = Object.keys(entries).find((k) => k.toLowerCase().endsWith('.kml'))
      if (!kmlEntry) throw new GisFileError('invalid')
      return [finalize(baseName(name), parseKmlText(strFromU8(entries[kmlEntry])))]
    }
    // Shapefile مضغوط — يُحمَّل عند الحاجة فقط لتخفيف حجم الصفحة
    const { default: shp } = await import('shpjs')
    const result = await shp(await file.arrayBuffer())
    const list = Array.isArray(result) ? result : [result]
    return list.map((fc, i) => finalize(fc.fileName ? baseName(fc.fileName.split('/').pop()!) : list.length > 1 ? `${baseName(name)} (${i + 1})` : baseName(name), fc))
  } catch (e) {
    if (e instanceof GisFileError) throw e
    throw new GisFileError('invalid')
  }
}

/* ───────── القياس الجيوديسي ───────── */
const R = 6378137 // نصف قطر الأرض (WGS84) بالمتر
const rad = (d: number) => (d * Math.PI) / 180

export type LL = { lat: number; lng: number }

/** طول خط بالمتر (Haversine) */
export function pathLength(points: LL[]) {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dLat = rad(b.lat - a.lat)
    const dLng = rad(b.lng - a.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
    total += 2 * R * Math.asin(Math.sqrt(h))
  }
  return total
}

/** مساحة مضلع على سطح الكرة بالمتر المربع */
export function polygonArea(points: LL[]) {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    area += rad(p2.lng - p1.lng) * (2 + Math.sin(rad(p1.lat)) + Math.sin(rad(p2.lat)))
  }
  return Math.abs((area * R * R) / 2)
}

export function formatDistance(m: number, lang: 'ar' | 'en') {
  const n = (v: number, d = 2) => v.toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { maximumFractionDigits: d })
  if (m < 1000) return `${n(m, 1)} ${lang === 'ar' ? 'م' : 'm'}`
  return `${n(m / 1000)} ${lang === 'ar' ? 'كم' : 'km'}`
}

export function formatArea(m2: number, lang: 'ar' | 'en') {
  const n = (v: number, d = 2) => v.toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { maximumFractionDigits: d })
  const parts = [`${n(m2, 0)} ${lang === 'ar' ? 'م²' : 'm²'}`]
  if (m2 >= 1000) parts.push(`${n(m2 / 10_000)} ${lang === 'ar' ? 'هكتار' : 'ha'}`)
  if (m2 >= 1_000_000) parts.push(`${n(m2 / 1_000_000)} ${lang === 'ar' ? 'كم²' : 'km²'}`)
  return parts.join(' · ')
}
