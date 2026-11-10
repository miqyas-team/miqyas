declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson'
  /** يقرأ Shapefile مضغوطاً (zip) ويعيد طبقة أو عدة طبقات، ويعيد الإسقاط إلى WGS84 إن وُجد ملف .prj */
  export default function shp(
    input: ArrayBuffer | string,
  ): Promise<(FeatureCollection & { fileName?: string }) | (FeatureCollection & { fileName?: string })[]>
}
