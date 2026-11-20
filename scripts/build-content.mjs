/**
 * يبني بنك المحتوى (المكتبة العلمية + أسئلة التحدي) من content/bank:
 *   1) supabase/migrations/0014_content_bank.sql — يُدرج المحتوى «بانتظار الموافقة»
 *   2) src/data/contentBank.json — لوضع المعاينة
 * ويخلط ترتيب الخيارات بشكل ثابت (نفس النتيجة كل مرة) حتى لا تكون الإجابة الصحيحة في نفس الموضع.
 * الاستخدام: npm run content:build
 */
import fs from 'node:fs'

const dir = 'content/bank'
const read = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'))
const files = fs.readdirSync(dir)

/* المواضيع */
const CATEGORIES = ['maps', 'data', 'coordinates', 'remote_sensing', 'analysis', 'surveying', 'tools']
const articles = files.filter((f) => f.startsWith('articles-')).sort().flatMap(read)
const slugs = new Set()
for (const a of articles) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) throw new Error(`bad slug ${a.slug}`)
  if (slugs.has(a.slug)) throw new Error(`duplicate slug ${a.slug}`)
  if (!CATEGORIES.includes(a.category)) throw new Error(`bad category ${a.slug}`)
  if (!a.title || !a.summary || !a.body) throw new Error(`missing text ${a.slug}`)
  slugs.add(a.slug)
}

/* الأسئلة */
function rng(seed) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}
const questions = []
for (const f of files.filter((f) => f.startsWith('questions-')).sort()) {
  for (const [lvl, list] of Object.entries(read(f))) {
    for (const [prompt, options, correct, explanation] of list) {
      if (!prompt || !explanation || options.length < 2 || correct < 0 || correct >= options.length) throw new Error(`bad question L${lvl}: ${prompt}`)
      // خلط ثابت لترتيب الخيارات
      const r = rng(prompt)
      const order = options.map((_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      questions.push({ level: Number(lvl), prompt, options: order.map((i) => options[i]), correct: order.indexOf(correct), explanation })
    }
  }
}
const perLevel = Array.from({ length: 12 }, (_, i) => questions.filter((q) => q.level === i + 1).length)
if (perLevel.some((n) => n < 5)) throw new Error(`every level needs at least 5 questions: ${perLevel}`)
const prompts = new Set()
for (const q of questions) {
  if (prompts.has(q.prompt)) throw new Error(`duplicate question: ${q.prompt}`)
  prompts.add(q.prompt)
}

/* 1) ملف المعاينة */
fs.writeFileSync('src/data/contentBank.json', JSON.stringify({ articles, questions }))

/* 2) ملف قاعدة البيانات */
const s = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = (a) => `array[${a.map(s).join(', ')}]::text[]`
const sql = [
  '-- ============================================================',
  '-- مقياس — بنك المحتوى الأولي (مولَّد آلياً: npm run content:build — لا تعدّله يدوياً)',
  `-- ${articles.length} موضوعاً للمكتبة العلمية + ${questions.length} سؤالاً للتحدي على 12 مستوى.`,
  '-- كل المحتوى يدخل «بانتظار الموافقة»: يراجعه المدير ويعتمده من لوحة الإدارة.',
  '-- ============================================================',
  '',
  'insert into public.articles (slug, category, title_ar, title_en, summary_ar, body_ar, read_min) values',
  articles.map((a) => `  (${s(a.slug)}, ${s(a.category)}, ${s(a.title)}, ${s(a.titleEn)}, ${s(a.summary)}, ${s(a.body)}, ${a.readMin ?? 4})`).join(',\n') +
    '\non conflict (slug) do nothing;',
  '',
  'insert into public.challenge_questions (level, prompt_ar, options_ar, correct, explanation_ar) values',
  questions.map((q) => `  (${q.level}, ${s(q.prompt)}, ${arr(q.options)}, ${q.correct}, ${s(q.explanation)})`).join(',\n') + ';',
  '',
].join('\n')
fs.writeFileSync('supabase/migrations/0014_content_bank.sql', sql)

const dist = [0, 1, 2, 3].map((i) => questions.filter((q) => q.correct === i).length)
console.log(`✓ ${articles.length} articles, ${questions.length} questions (per level: ${perLevel.join(' ')}; correct-answer positions: ${dist.join(' / ')})`)
