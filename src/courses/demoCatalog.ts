/**
 * كتالوج وضع المعاينة: المسوّدات هي المصدر، وتُحفظ في المتصفح
 * حتى تظهر تعديلات المحرّر فوراً في صفحات المتدرب.
 */
import { demoCourses, demoLessonContent } from './demoData'
import type { CourseDraft } from './draft'
import type { CourseDetail } from './types'

const KEY = 'miqyas-demo-catalog'
/** مقاعد محجوزة مسبقاً لعرض «المقاعد المتبقية» */
const demoTaken: Record<string, number> = { 'co-p1': 18 }

function defaults(): CourseDraft[] {
  return demoCourses.map((c) => ({
    id: c.id,
    isNew: false,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    description: c.description,
    outcomes: c.outcomes,
    level: c.level,
    format: c.format,
    software: c.software,
    price: c.price,
    hours: c.hours,
    tone: c.tone,
    passScore: c.passScore,
    instructorId: null,
    instructorName: c.instructorName,
    instructorBio: c.instructorBio,
    isFeatured: c.isFeatured,
    isPublished: true,
    cohorts: c.cohorts.map(({ seatsLeft: _s, ...rest }) => rest),
    modules: c.modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => {
        const x = demoLessonContent[l.id]
        return {
          id: l.id,
          title: l.title,
          durationMin: l.durationMin,
          isPreview: l.isPreview,
          youtubeId: x?.youtubeId ?? null,
          body: x?.body ?? { ar: '', en: '' },
          hasQuiz: l.hasQuiz,
          questions: (x?.questions ?? []).map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, options: q.options, correct: q.correct })),
          hasAssignment: l.hasAssignment,
          assignment: x?.assignment ?? { ar: '', en: '' },
          attachments: (x?.attachments ?? []).map((a) => ({ ...a })),
        }
      }),
    })),
  }))
}

export function loadDrafts(): CourseDraft[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as CourseDraft[]
  } catch {
    /* تجاهل */
  }
  return defaults()
}

export function saveDrafts(drafts: CourseDraft[]) {
  // الملفات لا تُحفظ في المتصفح؛ نحتفظ بالاسم والحجم فقط
  const clean = drafts.map((d) => ({
    ...d,
    isNew: false,
    modules: d.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({ ...l, attachments: l.attachments.map(({ file: _f, ...a }) => a) })),
    })),
  }))
  try {
    localStorage.setItem(KEY, JSON.stringify(clean))
  } catch {
    /* تجاهل */
  }
}

export function draftToDetail(d: CourseDraft): CourseDetail {
  const lessons = d.modules.flatMap((m) => m.lessons)
  const openStarts = d.cohorts.filter((c) => c.status === 'open').map((c) => c.startsOn).sort()
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    summary: d.summary,
    description: d.description,
    outcomes: d.outcomes,
    software: d.software,
    level: d.level,
    format: d.format,
    hours: d.hours,
    lessonsCount: lessons.length,
    price: d.price,
    instructorName: d.instructorName,
    instructorBio: d.instructorBio,
    tone: d.tone,
    isFeatured: d.isFeatured,
    passScore: d.passScore,
    nextCohortStart: d.format === 'live' ? openStarts[0] : undefined,
    cohorts: d.cohorts.map((c) => ({ ...c, seatsLeft: Math.max(0, c.seats - (demoTaken[c.id] ?? 0)) })),
    modules: d.modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        durationMin: l.durationMin,
        isPreview: l.isPreview,
        hasQuiz: l.hasQuiz,
        hasAssignment: l.hasAssignment,
      })),
    })),
  }
}
