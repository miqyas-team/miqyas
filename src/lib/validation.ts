/** يحوّل الأرقام العربية-الهندية والفارسية إلى أرقام لاتينية */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/** يوحّد رقم الجوال السعودي إلى الصيغة 05xxxxxxxx */
export function normalizeSaudiPhone(raw: string): string {
  let v = toLatinDigits(raw).replace(/[\s\-()]/g, '')
  if (v.startsWith('+966')) v = '0' + v.slice(4)
  else if (v.startsWith('00966')) v = '0' + v.slice(5)
  else if (v.startsWith('966')) v = '0' + v.slice(3)
  else if (/^5\d{8}$/.test(v)) v = '0' + v
  return v
}

export const isSaudiPhone = (v: string) => /^05\d{8}$/.test(v)
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
export const MIN_PASSWORD = 8
