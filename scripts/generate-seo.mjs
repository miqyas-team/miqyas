/**
 * يُنشئ robots.txt وsitemap.xml في dist بعد البناء.
 * يحتاج متغير البيئة SITE_URL (مثال: https://miqyas.sa) — يُضبط في Vercel.
 * بدون SITE_URL يُكتب robots.txt فقط دون خريطة الموقع.
 */
import fs from 'node:fs'

const site = (process.env.SITE_URL || process.env.VITE_SITE_URL || '').replace(/\/+$/, '')
const pages = ['/', '/courses', '/services', '/software', '/map-viewer', '/community', '/jobs', '/about', '/contact', '/terms', '/privacy', '/verify']

// لوحات الحسابات والإدارة لا تُفهرس
const disallow = ['/app', '/admin', '/team', '/instructor', '/invoices', '/login', '/register', '/reset-password', '/update-password']

let robots = 'User-agent: *\n' + disallow.map((p) => `Disallow: ${p}`).join('\n') + '\n'
if (site) {
  robots += `\nSitemap: ${site}/sitemap.xml\n`
  const today = new Date().toISOString().slice(0, 10)
  const urls = pages.map((p) => `  <url><loc>${site}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')
  fs.writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  console.log(`sitemap.xml written for ${site}`)
} else {
  console.log('SITE_URL not set — skipped sitemap.xml')
}
fs.writeFileSync('dist/robots.txt', robots)
console.log('robots.txt written')
