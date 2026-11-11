/** يجمع supabase/migrations بالترتيب في supabase/ALL_MIGRATIONS.sql (للصق مرة واحدة في Supabase) */
import fs from 'node:fs'

const dir = 'supabase/migrations'
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const header =
  `-- مقياس — كل ملفات قاعدة البيانات بالترتيب (${files[0].slice(0, 4)} → ${files[files.length - 1].slice(0, 4)})\n` +
  '-- الصقه كاملاً في Supabase > SQL Editor ثم Run، مرة واحدة فقط على مشروع جديد.\n' +
  '-- مُختبَر محلياً: npm run db:test\n\n'
const body = files.map((f) => `-- ════════ ${f} ════════\n${fs.readFileSync(`${dir}/${f}`, 'utf8')}\n`).join('\n')
fs.writeFileSync('supabase/ALL_MIGRATIONS.sql', header + body)
console.log(`bundled ${files.length} migrations → supabase/ALL_MIGRATIONS.sql`)
