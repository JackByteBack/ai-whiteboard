import { Link } from 'react-router-dom'
import { Download, MousePointer2, PenLine, Shapes, Sparkles, Users } from 'lucide-react'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  {
    icon: Shapes,
    title: 'Every tool you need',
    body: 'Text, sticky notes, shapes, lines, arrows, freehand drawing and bullet lists on one infinite canvas.',
  },
  {
    icon: Sparkles,
    title: 'AI brainstorming',
    body: 'Turn a prompt into a wall of sticky notes or a structured outline. Summarize a busy board in a click.',
  },
  {
    icon: Users,
    title: 'Real-time collaboration',
    body: "See teammates' cursors and edits live. Share a board with editors and viewers.",
  },
  {
    icon: Download,
    title: 'Export anywhere',
    body: 'Download your whiteboard as a crisp PNG or a scalable SVG to drop into docs and decks.',
  },
]

function ArrowDoodle() {
  return (
    <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
      <path
        d="M5 36C21 10 42 6 62 17"
        stroke="#e11d48"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M62 17 48 16" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" />
      <path d="M62 17 55 6" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen w-full">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="brand-gradient grid h-9 w-9 place-items-center rounded-xl text-white">
            <PenLine className="h-4 w-4" />
          </span>
          <span className="font-display text-xl font-bold">Canvas</span>
        </Link>

        <nav className="flex items-center gap-2">
          {user ? (
            <Link to="/dashboard">
              <Button size="sm">Open app</Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button size="sm" variant="ghost">
                  Sign in
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl animate-in px-6 pb-10 pt-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-muted shadow-[var(--shadow-card)]">
          <Sparkles className="h-3.5 w-3.5 text-brand-500" />
          AI-powered whiteboard notes
        </span>

        <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] sm:text-6xl">
          The infinite canvas for
          <br />
          <span className="text-gradient">notes that think with you.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          Sketch, diagram and brainstorm freely. Drop text, shapes and sticky notes, draw by hand,
          and let AI expand your ideas — all in real time.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to={user ? '/dashboard' : '/register'}>
            <Button size="lg">
              <MousePointer2 className="h-4 w-4" />
              Start whiteboarding
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="secondary">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      {/* Canvas preview */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div
          className="card canvas-bg-dots rounded-3xl p-8 shadow-[var(--shadow-lift)]"
          style={{ backgroundSize: '22px 22px', backgroundColor: '#fff' }}
        >
          <div className="flex flex-wrap items-center justify-center gap-6 py-4 sm:gap-10">
            <div className="rotate-[-3deg] rounded-lg bg-[#fde68a] px-5 py-4 text-sm font-medium text-ink shadow-[var(--shadow-soft)]">
              💡 Brainstorm ideas
            </div>

            <div className="rounded-xl border-[3px] border-brand-500 bg-surface px-6 py-3 text-sm font-semibold text-ink shadow-[var(--shadow-soft)]">
              Plan
            </div>

            <ArrowDoodle />

            <div className="rotate-2 rounded-full bg-[#bfdbfe] px-5 py-2.5 text-sm font-semibold text-ink shadow-[var(--shadow-soft)]">
              Ship 🚀
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="card rounded-2xl p-6">
              <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line py-8 text-center text-sm text-muted">
        Built with the PERN stack · React · Express · PostgreSQL · Socket.IO
      </footer>
    </div>
  )
}
