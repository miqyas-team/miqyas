/**
 * ÙŠÙÙ†Ø´Ø¦ robots.txt Ùˆsitemap.xml ÙÙŠ dist Ø¨Ø¹Ø¯ Ø§Ù„Ø¨Ù†Ø§Ø¡.
 * ÙŠØ­ØªØ§Ø¬ Ù…ØªØºÙŠØ± Ø§Ù„Ø¨ÙŠØ¦Ø© SITE_URL (Ù…Ø«Ø§Ù„: https://miqyas.sa) â€” ÙŠÙØ¶Ø¨Ø· ÙÙŠ Vercel.
 * Ø¨Ø¯ÙˆÙ† SITE_URL ÙŠÙÙƒØªØ¨ robots.txt ÙÙ‚Ø· Ø¯ÙˆÙ† Ø®Ø±ÙŠØ·Ø© Ø§Ù„Ù…ÙˆÙ‚Ø¹.
 */
import fs from 'node:fs'

const site = (process.env.SITE_URL || process.env.VITE_SITE_URL || '').replace(/\/+$/, '')
const pages = ['/', '/courses', '/services', '/software', '/map-viewer', '/community', '/jobs', '/about', '/contact', '/terms', '/privacy']

// Ù„ÙˆØ­Ø§Øª Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª ÙˆØ§Ù„Ø¥Ø¯Ø§Ø±Ø© Ù„Ø§ ØªÙÙÙ‡Ø±Ø³
const disallow = ['/app', '/admin', '/team', '/instructor', '/invoices', '/login', '/register', '/reset-password', '/update-password']

let robots = 'User-agent: *\n' + disallow.map((p) => `Disallow: ${p}`).join('\n') + '\n'
if (site) {
  robots += `\nSitemap: ${site}/sitemap.xml\n`
  const today = new Date().toISOString().slice(0, 10)
  const urls = pages.map((p) => `  <url><loc>${site}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')
  fs.writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  console.log(`sitemap.xml written for ${site}`)
} else {
  console.log('SITE_URL not set â€” skipped sitemap.xml')
}
fs.writeFileSync('dist/robots.txt', robots)
console.log('robots.txt written')
