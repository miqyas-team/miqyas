/**
 * يتأكد أن كل جدول ودالة وعلاقة يستدعيها كود الواجهة موجودة فعلاً في قاعدة البيانات.
 * الاستخدام: npm run db:check-frontend
 */
import fs from 'node:fs'
import path from 'node:path'
import { freshDb } from './run-migrations.mjs'

const db = await freshDb()
const files = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) && files.push(path.join(d, e.name))))
walk('src')
const code = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

const tables = new Set((await db.query(`select table_name from information_schema.tables where table_schema = 'public'`)).rows.map((r) => r.table_name))
const fns = new Set((await db.query(`select routine_name from information_schema.routines where routine_schema = 'public'`)).rows.map((r) => r.routine_name))
const fks = new Set((await db.query(`select conname from pg_constraint where contype = 'f'`)).rows.map((r) => r.conname))
const buckets = new Set((await db.query(`select id from storage.buckets`)).rows.map((r) => r.id))
const columns = (await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public'`)).rows
const colSet = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`))

const problems = []
const uniq = (re) => [...new Set([...code.matchAll(re)].map((m) => m[1]))]

for (const t of uniq(/\.from\('([a-z_]+)'\)/g)) if (!tables.has(t) && !buckets.has(t)) problems.push(`table or bucket not found: ${t}`)
for (const b of uniq(/storage\.from\('([a-z-]+)'\)/g)) if (!buckets.has(b)) problems.push(`storage bucket not found: ${b}`)
for (const f of uniq(/\.rpc\('([a-z_]+)'/g)) if (!fns.has(f)) problems.push(`function not found: ${f}`)
for (const k of uniq(/![a-z_]+?_fkey|!([a-z_]+_fkey)/g).filter(Boolean)) if (!fks.has(k)) problems.push(`foreign key not found: ${k}`)

// أعمدة .eq/.order/.is/.in/.neq على الجداول المعروفة: نتحقق أن العمود موجود في جدول ما على الأقل
const allCols = new Set(columns.map((c) => c.column_name))
for (const c of uniq(/\.(?:eq|neq|order|is|in)\('([a-z_]+)'/g)) if (!allCols.has(c)) problems.push(`column not found in any table: ${c}`)

// أعمدة في insert/update/upsert({ col: … }) — نتحقق بحسب الجدول
for (const m of code.matchAll(/\.from\('([a-z_]+)'\)\s*\.(?:insert|update|upsert)\(\{([^}]*)\}/g)) {
  const table = m[1]
  for (const k of [...m[2].matchAll(/([a-z_]+)\s*:/g)].map((x) => x[1])) {
    if (!colSet.has(`${table}.${k}`)) problems.push(`column ${table}.${k} not found`)
  }
}

console.log(`checked ${files.length} files: ${uniq(/\.from\('([a-z_]+)'\)/g).length} tables, ${uniq(/\.rpc\('([a-z_]+)'/g).length} functions`)
if (problems.length) {
  console.log(problems.map((p) => '  ✗ ' + p).join('\n'))
  process.exit(1)
}
console.log('✓ every table, function, bucket, key and column the frontend uses exists')
