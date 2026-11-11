import { useAsync } from '../components/ui'
import { paymentsApi, vatEnabled } from './api'

/** هل تُحتسب الضريبة؟ (يوجد رقم ضريبي في إعدادات المنشأة) */
export function useVatOn() {
  const s = useAsync(() => paymentsApi.getSettings(), [])
  return vatEnabled(s.data)
}
