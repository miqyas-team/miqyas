import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EyeOff, Lock, MessageSquare, Plus, Search, Trash2, Unlock, Eye } from 'lucide-react'
import { communityApi, type ForumPost, type ForumThread } from '../../community/api'
import { useAuth } from '../../auth/AuthProvider'
import { Alert, ErrorState, Spinner, useAsync } from '../../components/ui'
import { useLang } from '../../lib/lang'
import { Placeholder } from '../Placeholder'
import { usePageMeta } from '../../lib/seo'
import { AuthorLine, Composer, PostAttachments, relTime, ReportButton } from './parts'

/* ───────── قائمة الأسئلة ───────── */
export function CommunityHome() {
  const { t } = useTranslation()
  const lang = useLang()
  const { session } = useAuth()
  const { data, loading, error, reload } = useAsync(() => communityApi.listThreads(), [])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'unanswered'>('all')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data ?? []).filter(
      (th) => (filter === 'all' || th.replyCount === 0) && (!needle || `${th.title} ${th.body}`.toLowerCase().includes(needle)),
    )
  }, [data, q, filter])

  return (
    <>
      <section className="contour-bg border-b border-primary/10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-4 px-4 py-10">
          <div>
            <h1 className="text-3xl font-bold text-primary">{t('community.title')}</h1>
            <p className="mt-1 max-w-xl text-muted">{t('community.subtitle')}</p>
          </div>
          <Link
            to={session ? '/community/new' : `/login?next=${encodeURIComponent('/community/new')}`}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" /> {t('community.ask')}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">{t('community.search')}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('community.search')} className="w-full rounded-full border border-primary/15 bg-white py-2.5 pe-4 ps-9 text-sm outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20" />
          </label>
          {(['all', 'unanswered'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-2 text-sm font-medium ${filter === f ? 'bg-primary text-white' : 'border border-primary/15 bg-white'}`}>
              {t(`community.filters.${f}`)}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {loading && !data ? (
            <Spinner />
          ) : error ? (
            <ErrorState onRetry={reload} />
          ) : rows.length === 0 ? (
            <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-12 text-center text-muted">{t(q ? 'community.noResults' : 'community.empty')}</div>
          ) : (
            <ul className="space-y-3">
              {rows.map((th) => (
                <li key={th.id}>
                  <Link to={`/community/${th.id}`} className={`block rounded-card border bg-white p-5 transition hover:border-secondary hover:shadow-lg ${th.isHidden ? 'border-dashed border-red-200 opacity-70' : 'border-primary/10'}`}>
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="flex items-center gap-1.5 font-bold leading-snug">
                          {th.isLocked && <Lock className="h-4 w-4 shrink-0 text-muted" aria-label={t('community.locked')} />}
                          {th.isHidden && <EyeOff className="h-4 w-4 shrink-0 text-red-500" aria-label={t('community.hidden')} />}
                          <span className="truncate">{th.title}</span>
                        </h2>
                        <p className="mt-1 line-clamp-2 text-sm text-muted">{th.body}</p>
                        <div className="mt-3"><AuthorLine post={th} /></div>
                      </div>
                      <div className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2 text-center ${th.replyCount ? 'bg-secondary-100 text-primary' : 'bg-sand text-muted'}`}>
                        <span className="text-lg font-bold leading-none">{th.replyCount}</span>
                        <span className="mt-0.5 text-[11px]">{t('community.replies', { count: th.replyCount })}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">{t('community.lastActivity', { when: relTime(th.lastActivityAt, lang) })}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}

/* ───────── سؤال جديد ───────── */
export function NewThread() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/community" className="text-sm text-muted hover:text-primary">{t('community.back')}</Link>
      <h1 className="mt-2 text-3xl font-bold text-primary">{t('community.ask')}</h1>
      <div className="mt-4"><Alert tone="info">{t('community.tips')}</Alert></div>
      <div className="mt-6 rounded-card border border-primary/10 bg-white p-6">
        <Composer
          withTitle
          submitLabel={t('community.form.publish')}
          placeholder={t('community.form.bodyPh')}
          onSubmit={async ({ title, body, files }) => {
            const id = await communityApi.createThread(title, body, files)
            navigate(`/community/${id}`)
          }}
        />
      </div>
    </section>
  )
}

/* ───────── صفحة السؤال ───────── */
export function ThreadPage() {
  const { id = '' } = useParams()
  const res = useAsync(() => communityApi.getThread(id), [id])
  if (res.loading && !res.data) return <Spinner />
  if (res.error) return <ErrorState onRetry={res.reload} />
  if (!res.data) return <Placeholder notFound />
  return <ThreadView thread={res.data.thread} replies={res.data.replies} reload={res.reload} />
}

function ModTools({ kind, post, locked, reload }: { kind: 'thread' | 'reply'; post: ForumPost; locked?: boolean; reload: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const isAdmin = role === 'admin'
  const own = user?.id === post.authorId
  const btn = 'inline-flex items-center gap-1 text-xs text-muted hover:text-primary'
  return (
    <div className="flex flex-wrap items-center gap-3">
      {isAdmin && (
        <button type="button" className={btn} onClick={async () => { await communityApi.setHidden(kind, post.id, !post.isHidden); reload() }}>
          {post.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {t(post.isHidden ? 'community.mod.unhide' : 'community.mod.hide')}
        </button>
      )}
      {isAdmin && kind === 'thread' && (
        <button type="button" className={btn} onClick={async () => { await communityApi.setLocked(post.id, !locked); reload() }}>
          {locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {t(locked ? 'community.mod.unlock' : 'community.mod.lock')}
        </button>
      )}
      {(own || isAdmin) && (
        <button
          type="button"
          className={`${btn} hover:text-red-600`}
          onClick={async () => {
            if (!confirm(t(kind === 'thread' ? 'community.mod.confirmDeleteThread' : 'community.mod.confirmDeleteReply'))) return
            await communityApi.deletePost(kind, post.id)
            if (kind === 'thread') navigate('/community')
            else reload()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> {t('editor.remove')}
        </button>
      )}
    </div>
  )
}

function ThreadView({ thread, replies, reload }: { thread: ForumThread; replies: ForumPost[]; reload: () => void }) {
  const { t } = useTranslation()
  const { session, user } = useAuth()
  usePageMeta(thread.title, thread.body)

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/community" className="text-sm text-muted hover:text-primary">{t('community.back')}</Link>

      <article className={`mt-3 rounded-card border bg-white p-6 ${thread.isHidden ? 'border-dashed border-red-300' : 'border-primary/10'}`}>
        {thread.isHidden && <p className="mb-3 text-xs font-semibold text-red-600">{t('community.hiddenNote')}</p>}
        <h1 className="flex items-start gap-2 text-2xl font-bold leading-snug text-ink">
          {thread.isLocked && <Lock className="mt-1.5 h-5 w-5 shrink-0 text-muted" />}
          {thread.title}
        </h1>
        <div className="mt-2"><AuthorLine post={thread} /></div>
        <p className="mt-5 whitespace-pre-line leading-relaxed text-ink/90" dir="auto">{thread.body}</p>
        <PostAttachments items={thread.attachments} />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 pt-3">
          <ModTools kind="thread" post={thread} locked={thread.isLocked} reload={reload} />
          {session && user?.id !== thread.authorId && <ReportButton threadId={thread.id} replyId={null} />}
        </div>
      </article>

      <h2 className="mt-8 flex items-center gap-2 font-bold">
        <MessageSquare className="h-5 w-5 text-secondary" /> {t('community.replies', { count: replies.length })} ({replies.length})
      </h2>
      <ul className="mt-3 space-y-3">
        {replies.map((r) => {
          const staff = r.authorRole === 'team' || r.authorRole === 'admin' || r.authorRole === 'instructor'
          return (
            <li key={r.id} className={`rounded-card border bg-white p-5 ${r.isHidden ? 'border-dashed border-red-300 opacity-70' : staff ? 'border-secondary/50' : 'border-primary/10'}`}>
              <AuthorLine post={r} />
              <p className="mt-3 whitespace-pre-line leading-relaxed text-ink/90" dir="auto">{r.body}</p>
              <PostAttachments items={r.attachments} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <ModTools kind="reply" post={r} reload={reload} />
                {session && user?.id !== r.authorId && <ReportButton threadId={thread.id} replyId={r.id} />}
              </div>
            </li>
          )
        })}
        {replies.length === 0 && <li className="rounded-card bg-sand/60 p-6 text-center text-sm text-muted">{t('community.noReplies')}</li>}
      </ul>

      <div className="mt-6 rounded-card border border-primary/10 bg-white p-5">
        {thread.isLocked ? (
          <p className="flex items-center gap-2 text-sm text-muted"><Lock className="h-4 w-4" /> {t('community.lockedNote')}</p>
        ) : session ? (
          <>
            <h3 className="mb-3 font-bold">{t('community.yourReply')}</h3>
            <Composer submitLabel={t('community.form.reply')} placeholder={t('community.form.replyPh')} onSubmit={async ({ body, files }) => { await communityApi.reply(thread.id, body, files); reload() }} />
          </>
        ) : (
          <p className="text-sm">
            <Link to={`/login?next=${encodeURIComponent(`/community/${thread.id}`)}`} className="font-semibold text-primary underline">{t('nav.login')}</Link> {t('community.loginToReply')}
          </p>
        )}
      </div>
    </section>
  )
}
