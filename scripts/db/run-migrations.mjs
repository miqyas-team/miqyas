/**
 * يشغّل ملفات supabase/migrations بالترتيب على Postgres محلي (PGlite) لاكتشاف الأخطاء.
 * الاستخدام: npm run db:check
 */
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

export async function freshDb() {
  const db = new PGlite()
  await db.exec(fs.readFileSync('scripts/db/supabase-stubs.sql', 'utf8'))
  const dir = 'supabase/migrations'
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'))
    } catch (e) {
      throw new Error(`${file}: ${e.message}${e.position ? ` (position ${e.position})` : ''}`)
    }
  }
  return db
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1].endsWith('run-migrations.mjs')) {
  freshDb()
    .then(() => console.log('✓ all migrations applied cleanly'))
    .catch((e) => {
      console.error('✗', e.message)
      process.exit(1)
    })
}
