import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock3, Download, Eye, FileText,
  FolderOpen, GraduationCap, LayoutDashboard, LoaderCircle, Maximize, Minimize, NotebookPen,
  Pencil, Plus, Presentation as PresentationIcon, RotateCcw, Search, Trash2, UploadCloud, X,
} from 'lucide-react'
import { deleteData, downloadFile, getData, getFileContent, renameFile, saveData, uploadData } from './services/api'
import { FileContentViewer, RichText, SlideContent } from './components/ContentViewers'
import type {
  Assignment, DashboardData, Note, PreparationStatus, Presentation, PresentationSlide, Priority,
  StoredFile, Subject,
} from './types'
import './App.css'

type Toast = { id: number; message: string; tone: 'success' | 'error' }
type ResourcePath = '/subjects' | '/assignments' | '/presentations' | '/notes'
type FormValue = string | boolean | PresentationSlide[]
type FormFields = Record<string, FormValue>
type UploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed' | 'cancelled'
type UploadItem = { id: string; file: File; status: UploadStatus; progress: number; error: string; duplicate: boolean; retryable: boolean }

const AppContext = createContext<{ notify: (message: string, tone?: Toast['tone']) => void }>({ notify: () => undefined })
const useNotify = () => useContext(AppContext).notify
const currentDate = new Date()
const todayIso = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`

const pageDetails: Record<string, { label: string; icon: typeof LayoutDashboard }> = {
  '/': { label: 'Übersicht', icon: LayoutDashboard },
  '/assignments': { label: 'Aufgaben', icon: ClipboardList },
  '/presentations': { label: 'Präsentationen', icon: PresentationIcon },
  '/notes': { label: 'Notizen', icon: NotebookPen },
  '/files': { label: 'Dateien', icon: FolderOpen },
  '/subjects': { label: 'Fächer', icon: BookOpen },
}

const germanDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })
const timestamp = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
const dayOfMonth = new Intl.DateTimeFormat('de-DE', { day: '2-digit' })
const monthName = new Intl.DateTimeFormat('de-DE', { month: 'short' })
const weekdayName = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })

type BoundaryState = { failed: boolean }

class RouteErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('A page failed while rendering:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <section className="page-crash-state" role="alert">
      <div className="error-icon"><AlertCircle size={20} /></div>
      <div><h1>Dieser Bereich konnte nicht angezeigt werden.</h1><p>Deine gespeicherten Daten bleiben erhalten. Lade den Bereich neu oder wechsle über die Navigation zu einer anderen Seite.</p>
        <button className="button button-primary" onClick={() => this.setState({ failed: false })}>Bereich erneut laden</button>
      </div>
    </section>
  }
}

function App() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3600)
  }, [])

  return (
    <BrowserRouter>
      <AppContext.Provider value={{ notify }}>
        <div className="app-shell">
          <AppLayout />
          <div className="toast-stack" aria-live="polite">
            {toasts.map((toast) => (
              <div className={`toast toast-${toast.tone}`} key={toast.id}>
                {toast.tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
                <span>{toast.message}</span>
                <button aria-label="Meldung schließen" onClick={() => setToasts((list) => list.filter((item) => item.id !== toast.id))}><X size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </AppContext.Provider>
    </BrowserRouter>
  )
}

function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [quickActionsRoute, setQuickActionsRoute] = useState('')
  const routeKey = `${location.pathname}${location.search}`
  const quickActionsOpen = quickActionsRoute === routeKey

  return (
    <>
      <header className="masthead">
        <div className="masthead-main">
          <NavLink className="brand" to="/" aria-label="Schulplan Startseite">
            <span className="brand-mark"><GraduationCap size={20} strokeWidth={2.1} /></span>
            <span>schulplan<span className="brand-dot">/</span></span>
          </NavLink>
          <div className="workspace-caption"><span className="workspace-indicator" />Dein Lernatelier</div>
          <div className="masthead-date"><span>{germanDate.format(currentDate)}</span><span className="profile-mini">L</span></div>
          <button className="mobile-quick-trigger" type="button" aria-expanded={quickActionsOpen} aria-controls="mobile-quick-menu" onClick={() => setQuickActionsRoute(quickActionsOpen ? '' : routeKey)}>
            {quickActionsOpen ? <X size={17} /> : <Plus size={17} />}<span>Neu</span>
          </button>
        </div>
        <nav className="primary-nav" aria-label="Hauptnavigation">
          {Object.entries(pageDetails).map(([path, page], index) => {
            const Icon = page.icon
            return <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>
              <span className="nav-index">0{index + 1}</span><Icon size={16} strokeWidth={1.9} /><span>{page.label}</span>
            </NavLink>
          })}
        </nav>
        {quickActionsOpen && <nav id="mobile-quick-menu" className="mobile-quick-menu" aria-label="Schnellaktionen">
          <strong>Schnell etwas festhalten</strong>
          <button type="button" onClick={() => { setQuickActionsRoute(''); navigate('/assignments?create=1') }}><ClipboardList size={17} />Aufgabe anlegen<ArrowRight size={14} /></button>
          <button type="button" onClick={() => { setQuickActionsRoute(''); navigate('/presentations?create=1') }}><PresentationIcon size={17} />Präsentation planen<ArrowRight size={14} /></button>
          <button type="button" onClick={() => { setQuickActionsRoute(''); navigate('/notes?create=1') }}><NotebookPen size={17} />Notiz schreiben<ArrowRight size={14} /></button>
          <button type="button" onClick={() => { setQuickActionsRoute(''); navigate('/files') }}><UploadCloud size={17} />Dateien öffnen<ArrowRight size={14} /></button>
        </nav>}
      </header>
      <nav className="mobile-bottom-nav" aria-label="Mobile Hauptnavigation">
        {Object.entries(pageDetails).map(([path, page]) => {
          const Icon = page.icon
          const shortLabels: Record<string, string> = {
            '/': 'Übersicht',
            '/assignments': 'Aufgaben',
            '/presentations': 'Vorträge',
            '/notes': 'Notizen',
            '/files': 'Dateien',
            '/subjects': 'Fächer',
          }
          return <NavLink key={path} to={path} end={path === '/'} aria-label={page.label} className={({ isActive }) => `mobile-bottom-link ${isActive ? 'mobile-bottom-active' : ''}`}>
            <Icon size={19} strokeWidth={1.9} /><span>{shortLabels[path]}</span>
          </NavLink>
        })}
      </nav>
      <div className="main-shell">
        <main className="page-content" key={location.pathname}>
          <RouteErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/assignments/:id" element={<ResourceDetailPage kind="assignments" />} />
              <Route path="/assignments" element={<ResourcePage kind="assignments" />} />
              <Route path="/presentations/:id" element={<ResourceDetailPage kind="presentations" />} />
              <Route path="/presentations" element={<ResourcePage kind="presentations" />} />
              <Route path="/notes/:id" element={<ResourceDetailPage kind="notes" />} />
              <Route path="/notes" element={<ResourcePage kind="notes" />} />
              <Route path="/subjects/:id" element={<SubjectDetailPage />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/files/:id" element={<FileDetailPage />} />
              <Route path="/files" element={<FilesPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </RouteErrorBoundary>
        </main>
      </div>
    </>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  )
}

function useRemote<T>(path: string) {
  const [reloadId, setReloadId] = useState(0)
  const [result, setResult] = useState<{ key: string; data: T | null; error: string }>({ key: '', data: null, error: '' })
  const key = `${path}:${reloadId}`
  const reload = useCallback(() => setReloadId((id) => id + 1), [])

  useEffect(() => {
    let active = true
    getData<T>(path).then((value) => {
      if (active) setResult({ key, data: value, error: '' })
    }).catch((reason: unknown) => {
      if (active) setResult({ key, data: null, error: reason instanceof Error ? reason.message : 'Daten konnten nicht geladen werden.' })
    })
    return () => { active = false }
  }, [key, path])

  const current = result.key === key
  return { data: current ? result.data : null, loading: !current, error: current ? result.error : '', reload }
}

function LoadingState({ label = 'Wird geladen …' }: { label?: string }) {
  return <div className="loading-state"><LoaderCircle size={20} className="spin" />{label}</div>
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="error-state"><div className="error-icon"><AlertCircle size={20} /></div><div><strong>Das hat nicht geklappt</strong><p>{message}</p><button className="text-button" onClick={retry}>Erneut versuchen</button></div></div>
}

function EmptyState({ icon: Icon, title, text, action }: { icon: typeof FileText; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={20} /></div><strong>{title}</strong><p>{text}</p>{action}</div>
}

function DashboardPage() {
  const { data, loading, error, reload } = useRemote<DashboardData>('/dashboard')
  const navigate = useNavigate()
  const greetingDate = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(currentDate)
  const completed = data?.stats.completed_assignments ?? 0
  const open = data?.stats.open_assignments ?? 0
  const completion = data ? (completed + open ? Math.round(completed / (completed + open) * 100) : 0) : null
  return (
    <>
      <section className="dashboard-intro" aria-labelledby="welcome-title">
        <div className="intro-copy">
          <div className="eyebrow"><span className="eyebrow-line" />{greetingDate}</div>
          <h1 id="welcome-title">Dein Kopf ist für die guten Ideen da.</h1>
          <p>Der Lernplan hält die nächsten Schritte fest. Du entscheidest, womit du anfängst.</p>
        </div>
        <div className="intro-side">
          <span className="intro-side-label">DEIN FORTSCHRITT</span>
          <div className="progress-ring" style={{ '--progress': `${(completion ?? 0) * 3.6}deg` } as CSSProperties}><span>{completion ?? '–'}{completion !== null && <small>%</small>}</span></div>
          <span className="intro-progress-caption">{data ? `${completed} von ${completed + open} Aufgaben erledigt` : loading ? 'Wird berechnet' : 'Daten nicht verfügbar'}</span>
          <button className="button button-primary" onClick={() => navigate('/assignments')}><Plus size={16} /> Aufgabe planen</button>
        </div>
      </section>
      {loading ? <LoadingState label="Dein Lernbereich wird vorbereitet …" /> : error ? <ErrorState message={error} retry={reload} /> : data ? (
        <>
          <section className="stats-strip" aria-label="Dein Überblick">
            <div><span>OFFEN</span><strong>{data.stats.open_assignments}</strong><small>{data.stats.due_soon_assignments} bald fällig</small></div>
            <div className={data.stats.overdue_assignments ? 'stat-alert' : ''}><span>ÜBERFÄLLIG</span><strong>{data.stats.overdue_assignments}</strong><small>{data.stats.overdue_assignments ? 'Wieder in den Plan holen' : 'Alles im Zeitplan'}</small></div>
            <div><span>ERLEDIGT</span><strong>{data.stats.completed_assignments}</strong><small>Schritt für Schritt</small></div>
            <div><span>VORTRÄGE</span><strong>{data.stats.upcoming_presentations}</strong><small>Als Nächstes geplant</small></div>
          </section>

          <section className="dashboard-workbench">
            <div className="week-queue">
              <div className="section-kicker"><span>01</span><div><h2>Als Nächstes</h2><p>Deine anstehenden Aufgaben</p></div><button className="panel-link" onClick={() => navigate('/assignments')}>Zum Aufgabenplan <ArrowRight size={14} /></button></div>
              {data.assignments.length ? <div className="agenda-list">{data.assignments.map((item, index) => (
                <button className="agenda-row agenda-row-button" key={item.id} onClick={() => navigate(`/assignments/${item.id}`)}>
                  <span className="agenda-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="subject-dot" style={{ backgroundColor: item.subject_color ?? '#6673d9' }} />
                  <div className="agenda-copy"><strong>{item.title}</strong><span>{item.subject_name ?? 'Ohne Fach'}</span></div>
                  <span className={`agenda-due ${isOverdue(item.due_date) ? 'overdue-text' : ''}`}>{dueLabel(item.due_date)}</span>
                  <span className={`priority-pill priority-${item.priority}`}>{priorityLabel[item.priority]}</span>
                </button>
              ))}</div> : <EmptyState icon={ClipboardList} title="Noch nichts auf der Liste" text="Füge eine Aufgabe hinzu, damit du den Überblick behältst." action={<button className="text-button" onClick={() => navigate('/assignments')}>Aufgabe erstellen <ArrowRight size={14} /></button>} />}
            </div>

            <aside className="dashboard-aside">
              <div className="upcoming-block">
                <div className="section-kicker"><span>02</span><div><h2>Auf der Bühne</h2><p>Nächste Präsentationen</p></div></div>
                {data.presentations.length ? <div className="presentation-list">{data.presentations.map((item) => (
                <button className="presentation-row presentation-row-button" key={item.id} onClick={() => navigate(`/presentations/${item.id}`)}>
                  <div className="calendar-tile"><strong>{formatCalendarDate(item.presentation_date, dayOfMonth)}</strong><span>{formatCalendarDate(item.presentation_date, monthName)}</span></div>
                  <div className="agenda-copy"><strong>{item.title}</strong><span>{item.subject_name ?? 'Ohne Fach'}</span></div>
                  <span className={`prep-dot prep-${item.prep_status}`} title={prepLabel[item.prep_status]} />
                </button>
              ))}</div> : <EmptyState icon={PresentationIcon} title="Keine Termine geplant" text="Deine Präsentationen werden hier gesammelt." action={<button className="text-button" onClick={() => navigate('/presentations')}>Termin eintragen <ArrowRight size={14} /></button>} />}
                <button className="panel-link" onClick={() => navigate('/presentations')}>Alle Termine <ArrowRight size={14} /></button>
              </div>
              <div className="note-fragment">
                <div className="section-kicker"><span>03</span><div><h2>Frisch notiert</h2><p>Zuletzt festgehalten</p></div></div>
                {data.notes.length ? data.notes.slice(0, 2).map((note) => <button key={note.id} className="recent-note" onClick={() => navigate(`/notes/${note.id}`)}>
                  <span className="recent-note-title">{note.title}</span><span className="recent-note-preview">{note.preview}</span><span className="recent-note-meta">{note.subject_name ?? 'Ohne Fach'} · {timestamp.format(new Date(note.updated_at))}</span>
                </button>) : <p className="note-empty">Hier erscheinen deine neuesten Lernnotizen.</p>}
                <button className="panel-link" onClick={() => navigate('/notes')}>Notizbuch öffnen <ArrowRight size={14} /></button>
              </div>
              <div className="note-fragment dashboard-recent-files">
                <div className="section-kicker"><span>04</span><div><h2>Zuletzt abgelegt</h2><p>Deine aktuellen Dateien</p></div></div>
                {data.files.length ? data.files.slice(0, 3).map((file) => <button key={file.id} className="recent-note" onClick={() => navigate(`/files/${file.id}`)}>
                  <span className="recent-note-title">{file.filename}</span><span className="recent-note-preview">{file.subject_name ?? 'Ohne Fach'} · {formatSize(file.size_bytes)}</span><span className="recent-note-meta">{timestamp.format(new Date(file.created_at))}</span>
                </button>) : <p className="note-empty">Hier erscheinen deine zuletzt hochgeladenen Dateien.</p>}
                <button className="panel-link" onClick={() => navigate('/files')}>Dateien öffnen <ArrowRight size={14} /></button>
              </div>
            </aside>
          </section>

          <section className="subject-ribbon">
            <div className="ribbon-heading"><span className="section-number">05</span><div><h2>Deine Fächer</h2><p>Deine Arbeit, nach Themen sortiert.</p></div><button className="panel-link" onClick={() => navigate('/subjects')}>Fächer verwalten <ArrowRight size={14} /></button></div>
            {data.subjects.length ? <div className="subject-ribbon-items">{data.subjects.slice(0, 6).map((subject, index) => (
              <button className="subject-ribbon-item" key={subject.id} onClick={() => navigate(`/subjects/${subject.id}`)}>
                <span className="ribbon-subject-index">{String(index + 1).padStart(2, '0')}</span><span className="subject-ribbon-color" style={{ backgroundColor: subject.color }} /><strong>{subject.name}</strong><small>{subject.assignment_count} offen</small><ArrowUpRight size={15} />
              </button>
            ))}</div> : <EmptyState icon={BookOpen} title="Noch keine Fächer" text="Lege zuerst deine Fächer an und ordne ihnen deine Arbeit zu." action={<button className="text-button" onClick={() => navigate('/subjects')}>Fach hinzufügen <ArrowRight size={14} /></button>} />}
          </section>
        </>
      ) : null}
    </>
  )
}

const priorityLabel: Record<Priority, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' }
const prepLabel: Record<PreparationStatus, string> = { not_started: 'Nicht begonnen', in_progress: 'In Arbeit', ready: 'Bereit' }

function isOverdue(date: string) {
  const normalized = dateOnly(date)
  return Boolean(normalized) && normalized < todayIso
}

function dueLabel(date: string) {
  const normalized = dateOnly(date)
  const parsed = parseDateOnly(normalized)
  if (!parsed) return 'Datum ungültig'
  if (normalized === todayIso) return 'Heute fällig'
  if (normalized < todayIso) return `Überfällig · ${shortDate.format(parsed)}`
  return shortDate.format(parsed)
}

function dateOnly(value: string | null | undefined) {
  const normalized = /^\d{4}-\d{2}-\d{2}/.exec(value ?? '')?.[0]
  return normalized && parseDateOnly(normalized) ? normalized : ''
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const [year, month, day] = value.split('-').map(Number)
  return date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day
    ? date
    : null
}

function formatCalendarDate(value: string, formatter: Intl.DateTimeFormat) {
  const parsed = parseDateOnly(dateOnly(value))
  return parsed ? formatter.format(parsed) : 'Datum ungültig'
}

type ResourceKind = 'assignments' | 'presentations' | 'notes'
type EntityRecord = (Assignment | Presentation | Note) & { subject_name?: string; subject_color?: string }

const resourceMeta: Record<ResourceKind, { label: string; singular: string; description: string; icon: typeof FileText }> = {
  assignments: { label: 'Aufgaben', singular: 'Aufgabe', description: 'Behalte Abgaben und alles, was noch ansteht, im Blick.', icon: ClipboardList },
  presentations: { label: 'Präsentationen', singular: 'Präsentation', description: 'Plane deine Vorträge und verfolge deinen Vorbereitungsstand.', icon: PresentationIcon },
  notes: { label: 'Notizen', singular: 'Notiz', description: 'Sammle Lerninhalte, Gedanken und wichtige Erinnerungen.', icon: NotebookPen },
}

function ResourcePage({ kind }: { kind: ResourceKind }) {
  const meta = resourceMeta[kind]
  const Icon = meta.icon
  const path = `/${kind}` as ResourcePath
  const { data, loading, error, reload } = useRemote<EntityRecord[]>(path)
  const subjectsRemote = useRemote<Subject[]>('/subjects')
  const filesRemote = useRemote<StoredFile[]>('/files')
  const subjects = subjectsRemote.data ?? []
  const notify = useNotify()
  const [searchParams] = useSearchParams()
  const createFromMenu = searchParams.get('create') === '1'
  const [editing, setEditing] = useState<EntityRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState(searchParams.get('subject_id') ?? 'all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState(kind === 'notes' ? 'newest' : 'date')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    let result = [...(data ?? [])]
    if (subjectFilter !== 'all') result = result.filter((item) => item.subject_id === subjectFilter)
    if (search.trim()) {
      const term = search.trim().toLocaleLowerCase()
      result = result.filter((item) => `${item.title} ${'description' in item ? item.description : ''} ${'content' in item ? item.content : ''} ${item.subject_name ?? ''}`.toLocaleLowerCase().includes(term))
    }
    if (kind === 'assignments') {
      result = result.filter((item) => {
        const assignment = item as Assignment
        if (statusFilter === 'open') return !assignment.completed
        if (statusFilter === 'completed') return assignment.completed
        if (statusFilter === 'overdue') return !assignment.completed && isOverdue(assignment.due_date)
        return true
      })
      result.sort((a, b) => sortBy === 'priority'
        ? priorityOrder[(b as Assignment).priority] - priorityOrder[(a as Assignment).priority]
        : (a as Assignment).due_date.localeCompare((b as Assignment).due_date))
    } else if (kind === 'presentations') {
      result = result.filter((item) => statusFilter === 'all' || (item as Presentation).prep_status === statusFilter)
      result.sort((a, b) => {
        const first = a as Presentation
        const second = b as Presentation
        if (sortBy === 'latest') return second.presentation_date.localeCompare(first.presentation_date)
        if (sortBy === 'preparation') {
          return preparationOrder[first.prep_status] - preparationOrder[second.prep_status]
            || first.presentation_date.localeCompare(second.presentation_date)
        }
        return first.presentation_date.localeCompare(second.presentation_date)
      })
    } else {
      result.sort((a, b) => sortBy === 'oldest'
        ? a.updated_at.localeCompare(b.updated_at)
        : b.updated_at.localeCompare(a.updated_at))
    }
    return result
  }, [data, kind, search, sortBy, statusFilter, subjectFilter])
  const selectedNote = kind === 'notes'
    ? (filtered.find((item) => item.id === selectedNoteId) as Note | undefined) ?? filtered[0] as Note | undefined
    : undefined

  const save = async (values: FormFields, id?: string) => {
    const payload: FormFields = kind === 'notes'
      ? { subject_id: values.subject_id, title: values.title, content: values.content }
      : kind === 'assignments'
        ? { subject_id: values.subject_id, title: values.title, description: values.description, due_date: values.due_date, priority: values.priority, completed: values.completed }
        : { subject_id: values.subject_id, title: values.title, description: values.description, presentation_date: values.presentation_date, prep_status: values.prep_status, notes: values.notes, slides: Array.isArray(values.slides) ? values.slides : [] }
    await saveData(path, payload, id)
    setCreating(false)
    setEditing(null)
    reload()
    notify(`${meta.singular} ${id ? 'aktualisiert' : 'hinzugefügt'}.`)
    if (createFromMenu) navigate(path, { replace: true })
  }

  const remove = async (item: EntityRecord) => {
    if (!window.confirm(`Möchtest du „${item.title}“ wirklich löschen?`)) return
    try {
      await deleteData(path, item.id)
      reload()
      notify(`${meta.singular} gelöscht.`)
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Löschen fehlgeschlagen.', 'error')
    }
  }

  const toggleComplete = async (item: EntityRecord) => {
    const assignment = item as Assignment
    try {
      await saveData(path, { subject_id: assignment.subject_id, title: assignment.title, description: assignment.description, due_date: assignment.due_date, priority: assignment.priority, completed: !assignment.completed }, assignment.id)
      reload()
      notify(assignment.completed ? 'Aufgabe wieder geöffnet.' : 'Aufgabe erledigt. Gut gemacht!')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Status konnte nicht geändert werden.', 'error')
    }
  }

  return (
    <div className={`resource-page resource-page-${kind}`}>
      <PageHeading eyebrow={`DEIN LERNBEREICH · ${meta.label.toLocaleUpperCase('de-DE')}`} title={meta.label} description={meta.description} action={<button className="button button-primary" onClick={() => setCreating(true)} disabled={kind !== 'assignments' && subjects.length === 0 || kind === 'assignments' && subjects.length === 0}><Plus size={17} /> {meta.singular} erstellen</button>} />
      {subjectsRemote.error && <div className="inline-warning"><AlertCircle size={16} /> Fächer konnten nicht geladen werden: {subjectsRemote.error}</div>}
      {kind !== 'notes' || (data?.length ?? 0) > 0 ? <div className="toolbar">
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${meta.label} durchsuchen …`} aria-label={`${meta.label} durchsuchen`} />{search && <button aria-label="Suche löschen" onClick={() => setSearch('')}><X size={15} /></button>}</label>
        <div className="filter-fields">
          {subjects.length > 0 && <label className="select-field"><span className="sr-only">Nach Fach filtern</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">Alle Fächer</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><ChevronDown size={14} /></label>}
          {kind === 'assignments' && <label className="select-field"><span className="sr-only">Nach Status filtern</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Alle Status</option><option value="open">Offen</option><option value="overdue">Überfällig</option><option value="completed">Erledigt</option></select><ChevronDown size={14} /></label>}
          {kind === 'presentations' && <label className="select-field"><span className="sr-only">Nach Vorbereitungsstatus filtern</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Alle Stände</option><option value="not_started">Nicht begonnen</option><option value="in_progress">In Arbeit</option><option value="ready">Bereit</option></select><ChevronDown size={14} /></label>}
          {kind === 'presentations' && <label className="select-field"><span className="sr-only">Präsentationen sortieren</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="date">Nächster Termin</option><option value="latest">Spätester Termin</option><option value="preparation">Vorbereitungsstand</option></select><ChevronDown size={14} /></label>}
          {kind !== 'presentations' && <label className="select-field"><span className="sr-only">Sortieren</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{kind === 'assignments' ? <><option value="date">Nach Abgabedatum</option><option value="priority">Nach Priorität</option></> : <><option value="newest">Zuletzt geändert</option><option value="oldest">Älteste zuerst</option></>}</select><ChevronDown size={14} /></label>}
        </div>
      </div> : null}

      {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : filtered.length ? kind === 'notes' ? (
        <section className="notes-workspace" aria-label="Notizbuch">
          <div className="notes-index">
            <div className="notes-index-heading"><span>DEIN REGISTER</span><strong>{filtered.length} {filtered.length === 1 ? 'Notiz' : 'Notizen'}</strong></div>
            <div className="notes-index-list">{filtered.map((item) => <ResourceCard key={item.id} kind={kind} item={item} isSelected={item.id === selectedNote?.id} onSelect={() => setSelectedNoteId(item.id)} onOpen={() => navigate(`/notes/${item.id}`)} onEdit={() => setEditing(item)} onDelete={() => void remove(item)} onToggle={() => undefined} />)}</div>
          </div>
          {selectedNote && <article className="note-reader">
            <div className="note-reader-top"><span className="note-subject-mark" style={{ backgroundColor: selectedNote.subject_color ?? '#6673d9' }} />{selectedNote.subject_name ?? 'Ohne Fach'}<div className="card-actions"><button className="icon-button" aria-label={`${selectedNote.title} bearbeiten`} onClick={() => setEditing(selectedNote)}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`${selectedNote.title} löschen`} onClick={() => void remove(selectedNote)}><Trash2 size={15} /></button></div></div>
            <div className="note-reader-date">ZULETZT BEARBEITET · {timestamp.format(new Date(selectedNote.updated_at))}</div>
            <h2>{selectedNote.title}</h2>
            <div className="note-reader-content">{selectedNote.content ? <RichText content={selectedNote.content} /> : <span className="note-placeholder">Diese Notiz ist noch leer.</span>}</div>
            <div className="note-reader-footer"><span>{selectedNote.content.trim().split(/\s+/).filter(Boolean).length} Wörter</span><span>Im Lernatelier gespeichert</span></div>
          </article>}
        </section>
      ) : (
        <section className={kind === 'assignments' ? 'assignment-ledger' : 'presentation-timeline'} aria-label={meta.label}>
          {filtered.map((item) => <ResourceCard key={item.id} kind={kind} item={item} onOpen={() => navigate(`/${kind}/${item.id}`)} onEdit={() => setEditing(item)} onDelete={() => void remove(item)} onToggle={() => void toggleComplete(item)} />)}
        </section>
      ) : (
        <EmptyState icon={Icon} title={data?.length ? 'Nichts gefunden' : `Noch keine ${meta.label.toLocaleLowerCase('de-DE')}`} text={data?.length ? 'Passe deine Suche oder Filter an.' : `${meta.singular} hinzufügen und den Kopf frei bekommen.`} action={data?.length ? <button className="text-button" onClick={() => { setSearch(''); setSubjectFilter('all'); setStatusFilter('all') }}>Filter zurücksetzen</button> : <button className="button button-primary button-small" disabled={subjects.length === 0} onClick={() => subjects.length ? setCreating(true) : navigate('/subjects')}><Plus size={15} />{subjects.length ? `${meta.singular} erstellen` : 'Zuerst ein Fach anlegen'}</button>} />
      )}
      {subjects.length === 0 && kind !== 'assignments' && <p className="helper-note"><BookOpen size={15} /> <button className="text-button" onClick={() => navigate('/subjects')}>Lege zuerst ein Fach an</button>, damit deine {meta.label.toLocaleLowerCase('de-DE')} zugeordnet werden können.</p>}
      {(creating || createFromMenu || editing) && <ResourceModal kind={kind} subjects={subjects} files={filesRemote.data ?? []} item={editing} onClose={() => { setCreating(false); setEditing(null); if (createFromMenu) navigate(path, { replace: true }) }} onSave={save} />}
    </div>
  )
}

const priorityOrder: Record<Priority, number> = { low: 0, medium: 1, high: 2 }
const preparationOrder: Record<PreparationStatus, number> = { not_started: 0, in_progress: 1, ready: 2 }

function ResourceCard({ kind, item, onEdit, onDelete, onToggle, onOpen, onSelect, isSelected = false }: { kind: ResourceKind; item: EntityRecord; onEdit: () => void; onDelete: () => void; onToggle: () => void; onOpen?: () => void; onSelect?: () => void; isSelected?: boolean }) {
  const assignment = item as Assignment
  const presentation = item as Presentation
  const note = item as Note
  if (kind === 'notes') return <article className={`note-index-entry ${isSelected ? 'note-index-entry-active' : ''}`}>
    <button className="note-index-select" onClick={onSelect}>
      <span className="note-index-subject"><span className="subject-dot" style={{ backgroundColor: item.subject_color ?? '#6673d9' }} />{item.subject_name ?? 'Ohne Fach'}</span>
      <strong>{item.title}</strong><span className="note-index-preview">{note.content || 'Noch kein Inhalt …'}</span>
      <small>{timestamp.format(new Date(note.updated_at))}</small>
    </button>
    <div className="note-index-actions"><button className="icon-button" aria-label={`${item.title} öffnen`} title="Notiz öffnen" onClick={onOpen}><ArrowUpRight size={14} /></button><button className="icon-button" aria-label={`${item.title} bearbeiten`} onClick={onEdit}><Pencil size={14} /></button><button className="icon-button danger-hover" aria-label={`${item.title} löschen`} onClick={onDelete}><Trash2 size={14} /></button></div>
  </article>
  if (kind === 'assignments') return <article className={`work-row ${assignment.completed ? 'work-row-complete' : ''}`}>
    <button className={`work-check ${assignment.completed ? 'work-check-done' : ''}`} aria-label={assignment.completed ? 'Als offen markieren' : 'Als erledigt markieren'} title={assignment.completed ? 'Wieder öffnen' : 'Als erledigt markieren'} onClick={onToggle}><Check size={16} /></button>
    <div className={`work-deadline ${!assignment.completed && isOverdue(assignment.due_date) ? 'work-deadline-late' : ''}`}><strong>{formatCalendarDate(assignment.due_date, dayOfMonth)}</strong><span>{formatCalendarDate(assignment.due_date, monthName)}</span></div>
    <div className="work-copy"><h2 className={assignment.completed ? 'strikethrough' : ''}><button className="content-open-title" onClick={onOpen}>{item.title}</button></h2><p>{assignment.description || 'Keine Beschreibung hinzugefügt.'}</p><span className="work-subject"><span className="subject-dot" style={{ backgroundColor: item.subject_color ?? '#6673d9' }} />{item.subject_name ?? 'Ohne Fach'}</span></div>
    <div className="work-status"><span className={`priority-pill priority-${assignment.priority}`}>{priorityLabel[assignment.priority]}</span><span className={`work-due-label ${!assignment.completed && isOverdue(assignment.due_date) ? 'overdue-text' : ''}`}>{dueLabel(assignment.due_date)}</span></div>
    <div className="card-actions"><button className="icon-button" aria-label={`${item.title} bearbeiten`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`${item.title} löschen`} onClick={onDelete}><Trash2 size={15} /></button></div>
  </article>
  if (kind === 'presentations') return <article className="presentation-event">
    <div className="event-date"><span>{formatCalendarDate(presentation.presentation_date, monthName)}</span><strong>{formatCalendarDate(presentation.presentation_date, dayOfMonth)}</strong><small>{formatCalendarDate(presentation.presentation_date, weekdayName)}</small></div>
    <div className="event-content"><div className="event-heading"><span className="work-subject"><span className="subject-dot" style={{ backgroundColor: item.subject_color ?? '#6673d9' }} />{item.subject_name ?? 'Ohne Fach'}</span><div className="card-actions"><button className="icon-button" aria-label={`${item.title} bearbeiten`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`${item.title} löschen`} onClick={onDelete}><Trash2 size={15} /></button></div></div>
      <h2><button className="content-open-title" onClick={onOpen}>{item.title}</button></h2><p className="event-description">{presentation.description || 'Keine Beschreibung hinzugefügt.'}</p>
      {presentation.notes && <div className="event-notes"><span>VORBEREITUNGSNOTIZ</span><p>{presentation.notes}</p></div>}
      <div className="event-footer"><span className={`prep-badge prep-badge-${presentation.prep_status}`}><span className={`prep-dot prep-${presentation.prep_status}`} />{prepLabel[presentation.prep_status]}</span><span className="event-date-full">{formatCalendarDate(presentation.presentation_date, timestamp)}</span></div>
    </div>
  </article>
  return (
    <article className={`resource-card resource-${kind} ${kind === 'assignments' && assignment.completed ? 'resource-completed' : ''}`}>
      <div className="resource-card-top"><span className="subject-tag"><span className="subject-dot" style={{ backgroundColor: item.subject_color ?? '#b8a4ff' }} />{item.subject_name ?? 'Fach'}</span><div className="card-actions">
        {kind === 'assignments' && <button className={`icon-button complete-button ${assignment.completed ? 'is-completed' : ''}`} aria-label={assignment.completed ? 'Als offen markieren' : 'Als erledigt markieren'} title={assignment.completed ? 'Wieder öffnen' : 'Erledigt'} onClick={onToggle}><Check size={16} /></button>}
        <button className="icon-button" aria-label={`${item.title} bearbeiten`} title="Bearbeiten" onClick={onEdit}><Pencil size={15} /></button>
        <button className="icon-button danger-hover" aria-label={`${item.title} löschen`} title="Löschen" onClick={onDelete}><Trash2 size={15} /></button>
      </div></div>
      <h2 className={kind === 'assignments' && assignment.completed ? 'strikethrough' : ''}><button className="content-open-title" onClick={onOpen}>{item.title}</button></h2>
      {kind !== 'notes' && <p className="resource-description">{'description' in item && item.description ? item.description : 'Keine Beschreibung hinzugefügt.'}</p>}
      {kind === 'notes' && <p className="note-preview">{note.content}</p>}
      <div className="resource-card-bottom">
        {kind === 'assignments' && <><span className={`resource-date ${!assignment.completed && isOverdue(assignment.due_date) ? 'overdue-text' : ''}`}><CalendarDays size={14} />{dueLabel(assignment.due_date)}</span><span className={`priority-pill priority-${assignment.priority}`}>{priorityLabel[assignment.priority]}</span>{assignment.completed && <span className="completed-label"><CheckCircle2 size={13} />Erledigt</span>}</>}
        {kind === 'presentations' && <><span className="resource-date"><CalendarDays size={14} />{formatCalendarDate(presentation.presentation_date, timestamp)}</span><span className={`prep-badge prep-badge-${presentation.prep_status}`}>{prepLabel[presentation.prep_status]}</span></>}
        {kind === 'notes' && <><span className="resource-date"><Clock3 size={14} />Bearbeitet {timestamp.format(new Date(note.updated_at))}</span><span className="note-word-count">{note.content.trim().split(/\s+/).filter(Boolean).length} Wörter</span></>}
      </div>
      {kind === 'presentations' && presentation.notes && <div className="presentation-notes"><strong>Notizen</strong><span>{presentation.notes}</span></div>}
    </article>
  )
}

function ResourceModal({ kind, subjects, files, item, onClose, onSave }: { kind: ResourceKind; subjects: Subject[]; files: StoredFile[]; item: EntityRecord | null; onClose: () => void; onSave: (values: FormFields, id?: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const today = todayIso
  const defaults: FormFields = item ? {
    title: item.title,
    subject_id: item.subject_id,
    description: 'description' in item ? item.description : '',
    ...('due_date' in item ? { due_date: dateOnly(item.due_date), priority: item.priority, completed: item.completed } : {}),
    ...('presentation_date' in item ? { presentation_date: dateOnly(item.presentation_date), prep_status: item.prep_status, notes: item.notes, slides: Array.isArray(item.slides) && item.slides.length ? item.slides : [{ title: item.title, content: [item.description, item.notes].filter(Boolean).join('\n\n'), image_file_id: null }] } : {}),
    ...('content' in item ? { content: item.content } : {}),
  } : {
    title: '', subject_id: subjects[0]?.id ?? '', description: '',
    ...(kind === 'assignments' ? { due_date: today, priority: 'medium', completed: false } : {}),
    ...(kind === 'presentations' ? { presentation_date: today, prep_status: 'not_started', notes: '', slides: [{ title: '', content: '', image_file_id: null }] } : {}),
    ...(kind === 'notes' ? { content: '' } : {}),
  }
  const [values, setValues] = useState<FormFields>(defaults)
  const set = (key: string, value: FormValue) => setValues((current) => ({ ...current, [key]: value }))
  const meta = resourceMeta[kind]
  const modalRef = useModalFocus(onClose, saving)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try { await onSave(values, item?.id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.') } finally { savingRef.current = false; setSaving(false) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section ref={modalRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
      <div className="modal-heading"><div><span className="eyebrow">{item ? 'BEARBEITEN' : 'NEU ANLEGEN'}</span><h2 id="modal-heading">{item ? `${meta.singular} bearbeiten` : `Neue ${meta.singular.toLocaleLowerCase('de-DE')}`}</h2></div><button className="icon-button" aria-label="Schließen" onClick={onClose} disabled={saving}><X size={18} /></button></div>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <FormField label="Titel" required><input autoFocus required maxLength={160} value={String(values.title ?? '')} onChange={(event) => set('title', event.target.value)} placeholder="Worum geht es?" /></FormField>
        <FormField label="Fach" required><select required value={String(values.subject_id ?? '')} onChange={(event) => {
          const subjectId = event.target.value
          set('subject_id', subjectId)
          if (kind === 'presentations' && Array.isArray(values.slides)) {
            const subjectFiles = new Set(files.filter((file) => file.subject_id === subjectId).map((file) => file.id))
            set('slides', values.slides.map((slide) => slide.image_file_id && !subjectFiles.has(slide.image_file_id) ? { ...slide, image_file_id: null } : slide))
          }
        }}><option value="" disabled>Fach auswählen</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></FormField>
        {kind !== 'notes' && <FormField label="Beschreibung"><textarea rows={3} maxLength={5000} value={String(values.description ?? '')} onChange={(event) => set('description', event.target.value)} placeholder="Ein paar hilfreiche Details …" /></FormField>}
        {kind === 'assignments' && <>
          <div className="form-row"><FormField label="Abgabe bis" required><input type="date" required value={String(values.due_date)} onChange={(event) => set('due_date', event.target.value)} /></FormField>
            <FormField label="Priorität" required><select value={String(values.priority)} onChange={(event) => set('priority', event.target.value)}><option value="low">Niedrig</option><option value="medium">Mittel</option><option value="high">Hoch</option></select></FormField></div>
          {item && <label className="checkbox-field"><input type="checkbox" checked={Boolean(values.completed)} onChange={(event) => set('completed', event.target.checked)} /> Als erledigt markieren</label>}
        </>}
        {kind === 'presentations' && <>
          <div className="form-row"><FormField label="Präsentation am" required><input type="date" required value={String(values.presentation_date)} onChange={(event) => set('presentation_date', event.target.value)} /></FormField>
            <FormField label="Vorbereitung"><select value={String(values.prep_status)} onChange={(event) => set('prep_status', event.target.value)}><option value="not_started">Nicht begonnen</option><option value="in_progress">In Arbeit</option><option value="ready">Bereit</option></select></FormField></div>
          <FormField label="Vorbereitungsnotizen"><textarea rows={3} maxLength={5000} value={String(values.notes)} onChange={(event) => set('notes', event.target.value)} placeholder="Ideen, Quellen oder nächste Schritte …" /></FormField>
          <PresentationSlideEditor
            slides={Array.isArray(values.slides) ? values.slides : []}
            files={files.filter((file) => file.subject_id === String(values.subject_id) && file.content_type.startsWith('image/'))}
            onChange={(slides) => set('slides', slides)}
          />
        </>}
        {kind === 'notes' && <FormField label="Inhalt" required><textarea rows={9} required maxLength={20000} value={String(values.content)} onChange={(event) => set('content', event.target.value)} placeholder="Schreib deine Notiz …" /></FormField>}
        {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
        <div className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose} disabled={saving}>Abbrechen</button><button type="submit" className="button button-primary" disabled={saving || subjects.length === 0}>{saving && <LoaderCircle size={16} className="spin" />}{saving ? 'Wird gespeichert …' : item ? 'Änderungen speichern' : `${meta.singular} speichern`}</button></div>
      </form>
    </section>
  </div>
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="form-field"><span>{label}{required && <span className="required-mark"> *</span>}</span>{children}</label>
}

function PresentationSlideEditor({ slides, files, onChange }: { slides: PresentationSlide[]; files: StoredFile[]; onChange: (slides: PresentationSlide[]) => void }) {
  const update = (index: number, patch: Partial<PresentationSlide>) => {
    onChange(slides.map((slide, slideIndex) => slideIndex === index ? { ...slide, ...patch } : slide))
  }
  return <section className="slide-editor" aria-label="Folien bearbeiten">
    <div className="slide-editor-heading"><div><strong>Folien</strong><span>Inhalte für deine Präsentation</span></div>
      <button type="button" className="button button-quiet button-small" onClick={() => onChange([...slides, { title: '', content: '', image_file_id: null }])}><Plus size={14} /> Folie</button>
    </div>
    {slides.map((slide, index) => <fieldset className="slide-editor-item" key={index}>
      <legend>Folie {index + 1}</legend>
      <FormField label="Folientitel"><input maxLength={160} value={slide.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Überschrift der Folie" /></FormField>
      <FormField label="Inhalt"><textarea rows={4} maxLength={5000} value={slide.content} onChange={(event) => update(index, { content: event.target.value })} placeholder="Text, Absätze, Listen oder Markdown …" /></FormField>
      <FormField label="Bild aus Dateien"><select value={slide.image_file_id ?? ''} onChange={(event) => update(index, { image_file_id: event.target.value || null })}>
        <option value="">Kein Bild</option>{files.map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}
      </select></FormField>
      {slides.length > 1 && <button type="button" className="text-button slide-remove" onClick={() => onChange(slides.filter((_, slideIndex) => slideIndex !== index))}><Trash2 size={14} /> Folie entfernen</button>}
    </fieldset>)}
  </section>
}

function useModalFocus(onClose: () => void, disabled: boolean) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const disabledRef = useRef(disabled)
  useEffect(() => {
    closeRef.current = onClose
    disabledRef.current = disabled
  }, [onClose, disabled])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    const initialFocus = dialog.querySelector<HTMLElement>('[autofocus]') ?? focusable()[0]
    initialFocus?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !disabledRef.current) {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) return
      if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault()
        elements.at(-1)?.focus()
      } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
        event.preventDefault()
        elements[0]?.focus()
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [])

  return dialogRef
}

function SubjectsPage() {
  const subjectsRemote = useRemote<Subject[]>('/subjects')
  const assignmentsRemote = useRemote<Assignment[]>('/assignments')
  const presentationsRemote = useRemote<Presentation[]>('/presentations')
  const notesRemote = useRemote<Note[]>('/notes')
  const filesRemote = useRemote<StoredFile[]>('/files')
  const navigate = useNavigate()
  const notify = useNotify()
  const [editing, setEditing] = useState<Subject | null>(null)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const save = async (values: FormFields, id?: string) => {
    await saveData('/subjects', values, id)
    setCreating(false)
    setEditing(null)
    subjectsRemote.reload()
    notify(id ? 'Fach aktualisiert.' : 'Fach hinzugefügt.')
  }
  const remove = async (subject: Subject) => {
    if (!window.confirm(`Möchtest du „${subject.name}“ wirklich löschen? Zugeordnete Inhalte verhindern das Löschen.`)) return
    try {
      await deleteData('/subjects', subject.id)
      subjectsRemote.reload()
      notify('Fach gelöscht.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Fach konnte nicht gelöscht werden.', 'error') }
  }
  const error = [subjectsRemote.error, assignmentsRemote.error, presentationsRemote.error, notesRemote.error, filesRemote.error].find(Boolean)

  return <>
    <PageHeading eyebrow="DEIN LERNBEREICH · FÄCHER" title="Deine Fächer" description="Ein guter Lernplan beginnt mit einer klaren Sortierung." action={<button className="button button-primary" onClick={() => setCreating(true)}><Plus size={17} /> Fach hinzufügen</button>} />
    {subjectsRemote.loading ? <LoadingState /> : error ? <ErrorState message={error} retry={() => { subjectsRemote.reload(); assignmentsRemote.reload(); presentationsRemote.reload(); notesRemote.reload(); filesRemote.reload() }} /> : subjectsRemote.data?.length ? <section className="subject-directory">
      {subjectsRemote.data.map((subject, index) => {
        const subjectAssignments = assignmentsRemote.data?.filter((item) => item.subject_id === subject.id) ?? []
        const subjectPresentations = presentationsRemote.data?.filter((item) => item.subject_id === subject.id) ?? []
        const subjectNotes = notesRemote.data?.filter((item) => item.subject_id === subject.id) ?? []
        const subjectFiles = filesRemote.data?.filter((item) => item.subject_id === subject.id) ?? []
        const open = expanded === subject.id
        return <article className={`subject-entry ${open ? 'subject-entry-open' : ''}`} key={subject.id}>
          <div className="subject-entry-main">
            <span className="subject-entry-number">{String(index + 1).padStart(2, '0')}</span><span className="subject-entry-color" style={{ backgroundColor: subject.color }} />
            <div className="subject-entry-title"><h2><button className="subject-title-button" onClick={() => navigate(`/subjects/${subject.id}`)}>{subject.name}</button></h2><p>{subject.description || 'Noch keine Beschreibung.'}</p></div>
            <div className="subject-counts"><span><ClipboardList size={14} />{subjectAssignments.length} Aufgaben</span><span><PresentationIcon size={14} />{subjectPresentations.length} Vorträge</span><span><NotebookPen size={14} />{subjectNotes.length} Notizen</span><span><FolderOpen size={14} />{subjectFiles.length} Dateien</span></div>
            <div className="card-actions"><button className="icon-button" aria-label={`${subject.name} bearbeiten`} onClick={() => setEditing(subject)}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`${subject.name} löschen`} onClick={() => void remove(subject)}><Trash2 size={15} /></button></div>
          </div>
          <div className="subject-entry-lower">
            <button className="subject-details-toggle" onClick={() => setExpanded(open ? null : subject.id)}>{open ? 'Details ausblenden' : 'Inhalte ansehen'}<ChevronDown size={15} className={open ? 'chevron-open' : ''} /></button>
            {open && <div className="subject-details">
              <RelatedList title="Aufgaben" items={subjectAssignments.map((item) => ({ id: item.id, title: item.title, meta: item.completed ? 'Erledigt' : dueLabel(item.due_date) }))} onSelect={(id) => navigate(`/assignments/${id}`)} />
              <RelatedList title="Präsentationen" items={subjectPresentations.map((item) => ({ id: item.id, title: item.title, meta: formatCalendarDate(item.presentation_date, timestamp) }))} onSelect={(id) => navigate(`/presentations/${id}`)} />
              <RelatedList title="Notizen" items={subjectNotes.map((item) => ({ id: item.id, title: item.title, meta: timestamp.format(new Date(item.updated_at)) }))} onSelect={(id) => navigate(`/notes/${id}`)} />
              <RelatedList title="Dateien" items={subjectFiles.map((item) => ({ id: item.id, title: item.filename, meta: formatSize(item.size_bytes) }))} onSelect={(id) => navigate(`/files/${id}`)} />
            </div>}
          </div>
        </article>
      })}
    </section> : <EmptyState icon={BookOpen} title="Dein Lernplan beginnt hier" text="Erstelle ein Fach und ordne ihm anschließend Aufgaben, Notizen und Dateien zu." action={<button className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} /> Erstes Fach anlegen</button>} />}
    {(creating || editing) && <SubjectModal subject={editing} onClose={() => { setCreating(false); setEditing(null) }} onSave={save} />}
  </>
}

function RelatedList({ title, items, onSelect }: { title: string; items: Array<{ id: string; title: string; meta: string }>; onSelect: (id: string) => void }) {
  return <section className="related-list"><div className="related-list-title"><h2>{title}</h2><span>{items.length}</span></div>{items.length ? <div className="related-items">{items.map((item) => <button key={item.id} onClick={() => onSelect(item.id)}><span title={item.title}>{item.title}</span><small>{item.meta}</small><ArrowUpRight size={14} /></button>)}</div> : <p>Noch keine Einträge.</p>}</section>
}

function SubjectModal({ subject, onClose, onSave }: { subject: Subject | null; onClose: () => void; onSave: (values: FormFields, id?: string) => Promise<void> }) {
  const [values, setValues] = useState<FormFields>({ name: subject?.name ?? '', description: subject?.description ?? '', color: subject?.color ?? '#5D67D4' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const modalRef = useModalFocus(onClose, saving)
  const set = (key: string, value: string) => setValues((old) => ({ ...old, [key]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true); setError('')
    try { await onSave(values, subject?.id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.') } finally { savingRef.current = false; setSaving(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><section ref={modalRef} className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="subject-modal-title">
    <div className="modal-heading"><div><span className="eyebrow">{subject ? 'BEARBEITEN' : 'NEU ANLEGEN'}</span><h2 id="subject-modal-title">{subject ? 'Fach bearbeiten' : 'Neues Fach'}</h2></div><button className="icon-button" aria-label="Schließen" onClick={onClose} disabled={saving}><X size={18} /></button></div>
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <FormField label="Fachname" required><input autoFocus required maxLength={100} value={String(values.name)} onChange={(event) => set('name', event.target.value)} placeholder="z. B. Biologie" /></FormField>
      <FormField label="Beschreibung"><textarea rows={3} maxLength={1000} value={String(values.description)} onChange={(event) => set('description', event.target.value)} placeholder="Was lernst du in diesem Fach?" /></FormField>
      <FormField label="Farbe"><div className="color-field"><input type="color" value={String(values.color)} onChange={(event) => set('color', event.target.value)} /><span>{String(values.color).toUpperCase()}</span></div></FormField>
      {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
      <div className="modal-footer"><button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>Abbrechen</button><button className="button button-primary" type="submit" disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}{saving ? 'Wird gespeichert …' : subject ? 'Änderungen speichern' : 'Fach hinzufügen'}</button></div>
    </form>
  </section></div>
}

function ResourceDetailPage({ kind }: { kind: ResourceKind }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const notify = useNotify()
  const remote = useRemote<EntityRecord>(`/${kind}/${id}`)
  const subjectsRemote = useRemote<Subject[]>('/subjects')
  const filesRemote = useRemote<StoredFile[]>('/files')
  const item = remote.data
  const [editing, setEditing] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const presentationStage = useRef<HTMLElement>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)

  const slides = kind === 'presentations' && item && 'slides' in item && item.slides.length
    ? item.slides
    : kind === 'presentations' && item
      ? [{ title: item.title, content: 'description' in item ? [item.description, 'notes' in item ? item.notes : ''].filter(Boolean).join('\n\n') : '', image_file_id: null }]
      : []

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === presentationStage.current)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    if (kind !== 'presentations') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault()
        setSlideIndex((current) => Math.min(Math.max(current, 0) + 1, Math.max(slides.length - 1, 0)))
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        setSlideIndex((current) => Math.max(Math.min(current, Math.max(slides.length - 1, 0)) - 1, 0))
      } else if (event.key === 'Home') {
        setSlideIndex(0)
      } else if (event.key === 'End') {
        setSlideIndex(Math.max(slides.length - 1, 0))
      } else if (event.key === 'Escape' && document.fullscreenElement) {
        void document.exitFullscreen().catch((reason: unknown) => console.error('Fullscreen could not be closed:', reason))
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [kind, slides.length])

  const save = async (values: FormFields, recordId?: string) => {
    const payload = kind === 'notes'
      ? { subject_id: values.subject_id, title: values.title, content: values.content }
      : kind === 'assignments'
        ? { subject_id: values.subject_id, title: values.title, description: values.description, due_date: values.due_date, priority: values.priority, completed: values.completed }
        : { subject_id: values.subject_id, title: values.title, description: values.description, presentation_date: values.presentation_date, prep_status: values.prep_status, notes: values.notes, slides: Array.isArray(values.slides) ? values.slides : [] }
    await saveData(`/${kind}`, payload, recordId)
    setEditing(false)
    remote.reload()
    notify(`${resourceMeta[kind].singular} aktualisiert.`)
  }

  const remove = async () => {
    if (!item || !window.confirm(`Möchtest du „${item.title}“ wirklich löschen?`)) return
    try {
      await deleteData(`/${kind}`, item.id)
      notify(`${resourceMeta[kind].singular} gelöscht.`)
      navigate(`/${kind}`)
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Eintrag konnte nicht gelöscht werden.', 'error')
    }
  }

  const toggleComplete = async () => {
    if (!item || kind !== 'assignments') return
    const assignment = item as Assignment
    try {
      await saveData('/assignments', {
        subject_id: assignment.subject_id,
        title: assignment.title,
        description: assignment.description,
        due_date: assignment.due_date,
        priority: assignment.priority,
        completed: !assignment.completed,
      }, assignment.id)
      remote.reload()
      notify(assignment.completed ? 'Aufgabe wieder geöffnet.' : 'Aufgabe erledigt. Gut gemacht!')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Status konnte nicht geändert werden.', 'error')
    }
  }

  const uploadAttachment = async (file: File) => {
    if (!item || kind !== 'assignments') return
    const assignment = item as Assignment
    const validationError = validateUploadFile(file)
    if (validationError) {
      setUploadError(validationError)
      return
    }
    setUploading(true)
    setUploadProgress(0)
    setUploadError('')
    try {
      await uploadData(file, assignment.subject_id, {
        assignmentId: assignment.id,
        onProgress: setUploadProgress,
      })
      await filesRemote.reload()
      notify('Datei an die Aufgabe angehängt.')
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'Datei konnte nicht hochgeladen werden.')
    } finally {
      setUploading(false)
    }
  }

  const changeFullscreen = async () => {
    if (!presentationStage.current) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await presentationStage.current.requestFullscreen()
    } catch (reason) {
      notify(reason instanceof Error ? `Vollbild konnte nicht geöffnet werden: ${reason.message}` : 'Vollbild konnte nicht geöffnet werden.', 'error')
    }
  }

  if (remote.loading) return <LoadingState label={`${resourceMeta[kind].singular} wird geladen …`} />
  if (remote.error) return <ErrorState message={remote.error} retry={remote.reload} />
  if (!item) return null
  const subject = subjectsRemote.data?.find((entry) => entry.id === item.subject_id)
  const attachmentFiles = kind === 'assignments' ? (filesRemote.data ?? []).filter((file) => file.assignment_id === item.id) : []
  const currentSlideIndex = Math.min(slideIndex, Math.max(slides.length - 1, 0))
  const activeSlide = slides[currentSlideIndex]

  return <>
    <div className="detail-back-row"><button className="text-button" onClick={() => navigate(`/${kind}`)}><ArrowRight className="back-arrow" size={15} /> Zurück zu {resourceMeta[kind].label}</button></div>
    <header className="content-detail-heading">
      <div><div className="eyebrow"><span className="eyebrow-line" />{resourceMeta[kind].label.toLocaleUpperCase('de-DE')} · {subject?.name ?? 'Fach'}</div>
        <h1>{item.title}</h1>
        <p>{kind === 'assignments' ? `Abgabe ${formatCalendarDate((item as Assignment).due_date, germanDate)}`
          : kind === 'presentations' ? `Präsentation am ${formatCalendarDate((item as Presentation).presentation_date, germanDate)}`
            : `Zuletzt geändert am ${timestamp.format(new Date(item.updated_at))}`}</p>
      </div>
      <div className="detail-actions">
        {kind === 'assignments' && <button className={`button ${(item as Assignment).completed ? 'button-secondary' : 'button-primary'}`} onClick={() => void toggleComplete()}><Check size={16} />{(item as Assignment).completed ? 'Wieder öffnen' : 'Erledigt'}</button>}
        <button className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={15} /> Bearbeiten</button>
        <button className="icon-button danger-hover" aria-label={`${resourceMeta[kind].singular} löschen`} onClick={() => void remove()}><Trash2 size={16} /></button>
      </div>
    </header>

    {kind === 'assignments' && (() => {
      const assignment = item as Assignment
      return <div className="detail-content-grid">
        <article className="detail-paper"><div className="detail-kicker">AUFGABENBESCHREIBUNG</div>
          <div className="detail-status-line"><span className={`priority-pill priority-${assignment.priority}`}>{priorityLabel[assignment.priority]} Priorität</span><span className={assignment.completed ? 'completed-label' : isOverdue(assignment.due_date) ? 'overdue-text' : 'resource-date'}>{assignment.completed ? 'Erledigt' : isOverdue(assignment.due_date) ? 'Überfällig' : dueLabel(assignment.due_date)}</span></div>
          {assignment.description ? <RichText content={assignment.description} /> : <p className="note-placeholder">Keine Beschreibung hinzugefügt.</p>}
        </article>
        <aside className="detail-side-panel"><h2>Fach</h2><NavLink className="detail-subject-link" to={`/subjects/${assignment.subject_id}`}><span className="subject-dot" style={{ backgroundColor: subject?.color ?? '#68776b' }} />{subject?.name ?? assignment.subject_name ?? 'Fach öffnen'}<ArrowUpRight size={15} /></NavLink>
          <section className="detail-attachments"><div className="detail-panel-heading"><h2>Anhänge</h2><span>{attachmentFiles.length}</span></div>
            {filesRemote.loading ? <LoadingState label="Anhänge werden geladen …" /> : filesRemote.error ? <ErrorState message={filesRemote.error} retry={filesRemote.reload} /> : attachmentFiles.length ? <div className="detail-file-links">{attachmentFiles.map((file) => <NavLink key={file.id} to={`/files/${file.id}`}><FileText size={16} /><span><strong>{file.filename}</strong><small>{formatSize(file.size_bytes)}</small></span><ArrowUpRight size={14} /></NavLink>)}</div> : <p className="note-placeholder">Noch keine Dateien angehängt.</p>}
            <input ref={attachmentInput} className="sr-only" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={(event) => { const selected = event.currentTarget.files?.[0]; if (selected) void uploadAttachment(selected); event.currentTarget.value = '' }} />
            <button type="button" className="button button-secondary button-small" disabled={uploading} onClick={() => attachmentInput.current?.click()}><Plus size={14} />{uploading ? `Wird hochgeladen … ${uploadProgress}%` : 'Datei anhängen'}</button>
            {uploadError && <p className="upload-item-error" role="alert">{uploadError}</p>}
            {uploading && <progress className="detail-upload-progress" value={uploadProgress} max="100" aria-label={`Upload: ${uploadProgress}%`} />}
          </section>
        </aside>
      </div>
    })()}

    {kind === 'notes' && <article className="note-detail-paper"><div className="note-detail-meta"><span>{subject?.name ?? 'Ohne Fach'}</span><span>Erstellt am {timestamp.format(new Date(item.created_at))}</span><span>Zuletzt geändert am {timestamp.format(new Date(item.updated_at))}</span></div>
      {(item as Note).content ? <RichText content={(item as Note).content} /> : <p className="note-placeholder">Diese Notiz ist noch leer.</p>}
    </article>}

    {kind === 'presentations' && <div className="presentation-viewer-layout">
      <aside className="presentation-outline"><div className="detail-kicker">FOLIEN</div><strong>{slides.length} {slides.length === 1 ? 'Folie' : 'Folien'}</strong>
        <ol>{slides.map((slide, index) => <li key={index}><button className={index === currentSlideIndex ? 'outline-active' : ''} onClick={() => setSlideIndex(index)}><span>{String(index + 1).padStart(2, '0')}</span>{slide.title || `Folie ${index + 1}`}</button></li>)}</ol>
        <div className={`prep-badge prep-badge-${(item as Presentation).prep_status}`}>{prepLabel[(item as Presentation).prep_status]}</div>
      </aside>
      <section ref={presentationStage} className={`presentation-stage ${fullscreen ? 'presentation-stage-fullscreen' : ''}`} tabIndex={0} aria-label="Präsentationsansicht">
        <div className="presentation-stage-top"><span>{subject?.name ?? 'Präsentation'} · {item.title}</span><button className="icon-button" aria-label={fullscreen ? 'Vollbild schließen' : 'Vollbild öffnen'} onClick={() => void changeFullscreen()}>{fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</button></div>
        <div className="presentation-stage-content">{activeSlide ? <SlideContent slide={activeSlide} /> : <EmptyState icon={PresentationIcon} title="Noch keine Folien" text="Bearbeite die Präsentation, um Inhalte hinzuzufügen." />}</div>
        <div className="presentation-stage-controls"><button className="button button-secondary button-small" disabled={currentSlideIndex === 0} onClick={() => setSlideIndex((index) => Math.max(0, Math.min(index, slides.length - 1) - 1))}><ChevronLeft size={15} /> Zurück</button><span>Folie {slides.length ? currentSlideIndex + 1 : 0} von {slides.length}</span><button className="button button-secondary button-small" disabled={currentSlideIndex >= slides.length - 1} onClick={() => setSlideIndex((index) => Math.min(slides.length - 1, Math.min(index, slides.length - 1) + 1))}>Weiter <ChevronRight size={15} /></button></div>
      </section>
      <aside className="presentation-description"><h2>Zum Vortrag</h2><p>{(item as Presentation).description || 'Keine zusätzliche Beschreibung.'}</p>{(item as Presentation).notes && <><h3>Vorbereitungsnotizen</h3><RichText content={(item as Presentation).notes} /></>}</aside>
    </div>}
    {editing && <ResourceModal kind={kind} subjects={subjectsRemote.data ?? []} files={filesRemote.data ?? []} item={item} onClose={() => setEditing(false)} onSave={save} />}
  </>
}

function SubjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const subjectRemote = useRemote<Subject>(`/subjects/${id}`)
  const assignmentsRemote = useRemote<Assignment[]>('/assignments')
  const presentationsRemote = useRemote<Presentation[]>('/presentations')
  const notesRemote = useRemote<Note[]>('/notes')
  const filesRemote = useRemote<StoredFile[]>('/files')
  const subject = subjectRemote.data
  if ([subjectRemote, assignmentsRemote, presentationsRemote, notesRemote, filesRemote].some((remote) => remote.loading)) return <LoadingState label="Fach und zugehörige Inhalte werden geladen …" />
  const error = subjectRemote.error || assignmentsRemote.error || presentationsRemote.error || notesRemote.error || filesRemote.error
  if (error) return <ErrorState message={error} retry={() => { subjectRemote.reload(); assignmentsRemote.reload(); presentationsRemote.reload(); notesRemote.reload(); filesRemote.reload() }} />
  if (!subject) return null
  const assignments = (assignmentsRemote.data ?? []).filter((item) => item.subject_id === subject.id)
  const presentations = (presentationsRemote.data ?? []).filter((item) => item.subject_id === subject.id)
  const notes = (notesRemote.data ?? []).filter((item) => item.subject_id === subject.id)
  const files = (filesRemote.data ?? []).filter((item) => item.subject_id === subject.id)
  return <>
    <div className="detail-back-row"><button className="text-button" onClick={() => navigate('/subjects')}><ArrowRight className="back-arrow" size={15} /> Zurück zu Fächern</button></div>
    <header className="subject-detail-heading"><span className="subject-detail-color" style={{ backgroundColor: subject.color }} /><div><div className="eyebrow"><span className="eyebrow-line" />DEIN FACH</div><h1>{subject.name}</h1><p>{subject.description || 'Hier findest du alle Materialien und Aufgaben zu diesem Fach.'}</p></div></header>
    <div className="subject-detail-sections">
      <RelatedList title="Aufgaben" items={assignments.map((item) => ({ id: item.id, title: item.title, meta: item.completed ? 'Erledigt' : dueLabel(item.due_date) }))} onSelect={(resourceId) => navigate(`/assignments/${resourceId}`)} />
      <RelatedList title="Präsentationen" items={presentations.map((item) => ({ id: item.id, title: item.title, meta: formatCalendarDate(item.presentation_date, timestamp) }))} onSelect={(resourceId) => navigate(`/presentations/${resourceId}`)} />
      <RelatedList title="Notizen" items={notes.map((item) => ({ id: item.id, title: item.title, meta: timestamp.format(new Date(item.updated_at)) }))} onSelect={(resourceId) => navigate(`/notes/${resourceId}`)} />
      <RelatedList title="Dateien" items={files.map((item) => ({ id: item.id, title: item.filename, meta: `${formatSize(item.size_bytes)} · ${timestamp.format(new Date(item.created_at))}` }))} onSelect={(resourceId) => navigate(`/files/${resourceId}`)} />
    </div>
  </>
}

function FileDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const notify = useNotify()
  const fileRemote = useRemote<StoredFile>(`/files/${id}`)
  const subjectsRemote = useRemote<Subject[]>('/subjects')
  const [content, setContent] = useState<{ id: string; blob: Blob; contentType: string } | null>(null)
  const [contentResult, setContentResult] = useState<{ key: string; error: string }>({ key: '', error: '' })
  const [retry, setRetry] = useState(0)
  const [renaming, setRenaming] = useState(false)
  const file = fileRemote.data
  const subject = subjectsRemote.data?.find((item) => item.id === file?.subject_id)
  const contentKey = `${id}:${retry}`
  const contentLoading = contentResult.key !== contentKey
  const contentError = contentLoading ? '' : contentResult.error

  useEffect(() => {
    let active = true
    getFileContent(id).then((result) => {
      if (active) {
        setContent({ id, blob: result.blob, contentType: result.contentType })
        setContentResult({ key: contentKey, error: '' })
      }
    }).catch((reason: unknown) => {
      if (active) {
        setContent(null)
        setContentResult({ key: contentKey, error: reason instanceof Error ? reason.message : 'Datei konnte nicht geladen werden.' })
      }
    })
    return () => { active = false }
  }, [contentKey, id])

  const download = async () => {
    try { await downloadFile(id) } catch (reason) { notify(reason instanceof Error ? reason.message : 'Download fehlgeschlagen.', 'error') }
  }
  const rename = async (target: StoredFile, filename: string) => {
    await renameFile(target.id, filename)
    setRenaming(false)
    fileRemote.reload()
    notify('Dateiname geändert.')
  }
  const remove = async () => {
    if (!file || !window.confirm(`Möchtest du „${file.filename}“ wirklich löschen?`)) return
    try {
      await deleteData('/files', file.id)
      notify('Datei gelöscht.')
      navigate('/files')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Datei konnte nicht gelöscht werden.', 'error')
    }
  }

  if (fileRemote.loading) return <LoadingState label="Dateiinformationen werden geladen …" />
  if (fileRemote.error) return <ErrorState message={fileRemote.error} retry={fileRemote.reload} />
  if (!file) return null
  return <>
    <div className="detail-back-row"><button className="text-button" onClick={() => navigate('/files')}><ArrowRight className="back-arrow" size={15} /> Zurück zu Dateien</button></div>
    <header className="file-detail-heading">
      <div className={`file-type-icon file-type-${fileTypeLabel(file.filename).toLocaleLowerCase('de-DE')}`}><FileText size={22} /><span>{fileTypeLabel(file.filename)}</span></div>
      <div className="file-detail-title"><div className="eyebrow"><span className="eyebrow-line" />DATEI · {subject?.name ?? 'Fach'}</div><h1>{file.filename}</h1>
        <p>{file.content_type} · {formatSize(file.size_bytes)} · Hochgeladen am {timestamp.format(new Date(file.created_at))}</p>
      </div>
      <div className="detail-actions"><button className="button button-primary" onClick={() => void download()}><Download size={15} /> Herunterladen</button><button className="button button-secondary" onClick={() => setRenaming(true)}><Pencil size={15} /> Umbenennen</button><button className="icon-button danger-hover" aria-label="Datei löschen" onClick={() => void remove()}><Trash2 size={16} /></button></div>
    </header>
    {subject && <NavLink className="file-subject-link" to={`/subjects/${subject.id}`}><span className="subject-dot" style={{ backgroundColor: subject.color }} />Fach: {subject.name}<ArrowUpRight size={14} /></NavLink>}
    <section className="file-detail-viewer" aria-label="Dateivorschau">
      {contentLoading ? <LoadingState label="Datei wird sicher aus dem privaten Speicher geladen …" />
        : contentError ? <ErrorState message={contentError} retry={() => setRetry((current) => current + 1)} />
          : content?.id === file.id ? <FileContentViewer file={file} blob={content.blob} contentType={content.contentType} onDownload={() => void download()} />
            : <EmptyState icon={FileText} title="Vorschau nicht verfügbar" text="Der Dateiinhalt konnte nicht bereitgestellt werden." action={<button className="button button-primary" onClick={() => void download()}><Download size={15} /> Herunterladen</button>} />}
    </section>
    {renaming && <RenameFileDialog file={file} onClose={() => setRenaming(false)} onSave={rename} />}
  </>
}

function FilesPage() {
  const filesRemote = useRemote<StoredFile[]>('/files')
  const subjectsRemote = useRemote<Subject[]>('/subjects')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [subjectId, setSubjectId] = useState('')
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState(searchParams.get('subject_id') ?? 'all')
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [renaming, setRenaming] = useState<StoredFile | null>(null)
  const queueRef = useRef<UploadItem[]>([])
  const uploadLock = useRef(false)
  const controllers = useRef(new Map<string, AbortController>())
  const fileInput = useRef<HTMLInputElement>(null)
  const notify = useNotify()
  const subjects = subjectsRemote.data ?? []

  useEffect(() => () => {
    for (const controller of controllers.current.values()) controller.abort()
    controllers.current.clear()
  }, [])

  const visibleFiles = useMemo(() => (filesRemote.data ?? []).filter((item) => {
    const matchesSubject = subjectFilter === 'all' || item.subject_id === subjectFilter
    const matchesSearch = `${item.filename} ${item.subject_name ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    return matchesSubject && matchesSearch
  }), [filesRemote.data, search, subjectFilter])

  const selectedSubjectId = subjectId || subjects[0]?.id || ''

  const updateQueue = (update: (items: UploadItem[]) => UploadItem[]) => {
    const updated = update(queueRef.current)
    queueRef.current = updated
    setUploadQueue(updated)
  }

  const addFiles = (selectedFiles: FileList | File[]) => {
    const names = new Set([
      ...(filesRemote.data ?? []).map((item) => item.filename.toLocaleLowerCase()),
      ...queueRef.current.map((item) => item.file.name.toLocaleLowerCase()),
    ])
    const entries = Array.from(selectedFiles).map((file) => {
      const error = validateUploadFile(file)
      const duplicate = names.has(file.name.toLocaleLowerCase())
      names.add(file.name.toLocaleLowerCase())
      return {
        id: crypto.randomUUID(),
        file,
        status: error ? 'failed' as const : 'queued' as const,
        progress: 0,
        error,
        duplicate,
        retryable: !error,
      }
    })
    updateQueue((items) => [...items, ...entries])
    setUploadError('')
  }

  const uploadOne = async (item: UploadItem, targetSubjectId: string) => {
    const controller = new AbortController()
    controllers.current.set(item.id, controller)
    updateQueue((items) => items.map((current) => current.id === item.id
      ? { ...current, status: 'uploading', progress: 0, error: '' }
      : current))
    try {
      await uploadData(item.file, targetSubjectId, {
        signal: controller.signal,
        onProgress: (progress) => updateQueue((items) => items.map((current) => current.id === item.id
          ? { ...current, progress }
          : current)),
      })
      updateQueue((items) => items.map((current) => current.id === item.id
        ? { ...current, status: 'uploaded', progress: 100, error: '', retryable: false }
        : current))
      notify(`${item.file.name} wurde sicher hochgeladen.`)
      return true
    } catch (reason) {
      const cancelled = reason instanceof DOMException && reason.name === 'AbortError'
      const message = cancelled ? 'Upload abgebrochen.' : reason instanceof Error ? reason.message : 'Upload fehlgeschlagen.'
      updateQueue((items) => items.map((current) => current.id === item.id
        ? { ...current, status: cancelled ? 'cancelled' : 'failed', error: message, retryable: true }
        : current))
      if (!cancelled) notify(`${item.file.name}: ${message}`, 'error')
      return false
    } finally {
      controllers.current.delete(item.id)
    }
  }

  const uploadAll = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (uploadLock.current) return
    if (!selectedSubjectId) {
      setUploadError('Bitte wähle zuerst ein Fach aus.')
      return
    }
    const pending = queueRef.current.filter((item) => item.status === 'queued')
    if (pending.length === 0) return

    uploadLock.current = true
    setIsUploading(true)
    setUploadError('')
    let uploadedAny = false
    try {
      for (const item of pending) {
        const latest = queueRef.current.find((entry) => entry.id === item.id)
        if (latest?.status !== 'queued') continue
        uploadedAny = await uploadOne(latest, selectedSubjectId) || uploadedAny
      }
      if (uploadedAny) filesRemote.reload()
    } finally {
      uploadLock.current = false
      setIsUploading(false)
    }
  }

  const retryUpload = async (item: UploadItem) => {
    if (uploadLock.current || !selectedSubjectId) return
    uploadLock.current = true
    setIsUploading(true)
    updateQueue((items) => items.map((current) => current.id === item.id
      ? { ...current, status: 'queued', progress: 0, error: '', retryable: true }
      : current))
    try {
      if (await uploadOne({ ...item, status: 'queued', progress: 0, error: '', retryable: true }, selectedSubjectId)) filesRemote.reload()
    } finally {
      uploadLock.current = false
      setIsUploading(false)
    }
  }

  const cancelUpload = (item: UploadItem) => {
    const controller = controllers.current.get(item.id)
    if (controller) controller.abort()
    else updateQueue((items) => items.map((current) => current.id === item.id
      ? { ...current, status: 'cancelled', error: 'Upload abgebrochen.' }
      : current))
  }

  const removeFromQueue = (id: string) => updateQueue((items) => items.filter((item) => item.id !== id))

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files)
  }

  const remove = async (item: StoredFile) => {
    if (!window.confirm(`Möchtest du „${item.filename}“ wirklich löschen?`)) return
    try { await deleteData('/files', item.id); filesRemote.reload(); notify('Datei gelöscht.') } catch (reason) { notify(reason instanceof Error ? reason.message : 'Datei konnte nicht gelöscht werden.', 'error') }
  }

  const download = async (item: StoredFile) => {
    try { await downloadFile(item.id) } catch (reason) { notify(reason instanceof Error ? reason.message : 'Download fehlgeschlagen.', 'error') }
  }

  const rename = async (item: StoredFile, filename: string) => {
    await renameFile(item.id, filename)
    setRenaming(null)
    filesRemote.reload()
    notify('Dateiname geändert.')
  }

  const fileNameCounts = new Map<string, number>()
  for (const item of filesRemote.data ?? []) {
    const key = item.filename.toLocaleLowerCase()
    fileNameCounts.set(key, (fileNameCounts.get(key) ?? 0) + 1)
  }

  return <>
    <PageHeading eyebrow="DEIN LERNBEREICH · DATEIEN" title="Deine Dateien" description="Arbeitsblätter, Zusammenfassungen und alles Wichtige an einem Ort." />
    {subjectsRemote.error && <ErrorState message={subjectsRemote.error} retry={subjectsRemote.reload} />}
    {!subjectsRemote.loading && subjects.length === 0 ? <EmptyState icon={BookOpen} title="Erst ein Fach anlegen" text="Dateien können einem Fach zugeordnet werden. Lege zuerst dein erstes Fach an." action={<NavLink className="button button-primary" to="/subjects"><Plus size={16} /> Fach hinzufügen</NavLink>} /> : <form className="upload-workspace" onSubmit={(event) => void uploadAll(event)}>
      <div className={`upload-dropzone ${dragOver ? 'upload-dropzone-active' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragOver(true) }} onDragOver={(event) => { event.preventDefault(); setDragOver(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false) }} onDrop={onDrop}>
        <div className="upload-icon"><UploadCloud size={22} /></div>
        <div className="upload-copy"><strong>Dateien hier ablegen</strong><span>oder vom Gerät auswählen · PDF, DOCX, XLSX, TXT, PNG, JPG oder WEBP · max. 4 MB je Datei</span></div>
        <label className="button button-secondary file-picker" htmlFor="file-input"><Plus size={16} /> Dateien auswählen<input ref={fileInput} id="file-input" type="file" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={(event) => { if (event.currentTarget.files) addFiles(event.currentTarget.files); event.currentTarget.value = '' }} /></label>
      </div>
      <div className="upload-controls">
        <label className="select-field upload-subject"><span className="sr-only">Fach auswählen</span><select required value={selectedSubjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="" disabled>Fach auswählen</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><ChevronDown size={14} /></label>
        <span className="upload-policy">Dateien bleiben privat in deinem Lernbereich.</span>
        <button className="button button-primary upload-submit" type="submit" disabled={isUploading || !uploadQueue.some((item) => item.status === 'queued')}>
          {isUploading ? <><LoaderCircle size={16} className="spin" /> Wird hochgeladen …</> : <><UploadCloud size={16} /> {uploadQueue.filter((item) => item.status === 'queued').length} Dateien hochladen</>}
        </button>
      </div>
      {uploadError && <div className="form-error upload-error"><AlertCircle size={16} />{uploadError}</div>}
      {uploadQueue.length > 0 && <section className="upload-queue" aria-label="Upload-Warteschlange">
        <div className="upload-queue-heading"><strong>Upload-Warteschlange</strong><button className="text-button" type="button" onClick={() => updateQueue((items) => items.filter((item) => item.status === 'uploading'))}>Abgeschlossene entfernen</button></div>
        {uploadQueue.map((item) => <article className={`upload-queue-item upload-${item.status}`} key={item.id}>
          <div className="file-type-icon"><FileText size={17} /><span>{fileTypeLabel(item.file.name)}</span></div>
          <div className="upload-queue-info"><strong title={item.file.name}>{item.file.name}</strong><span>{formatSize(item.file.size)}{item.duplicate && <em>Gleicher Name vorhanden – wird separat gespeichert.</em>}</span>
            {item.status === 'uploading' && <div className="upload-item-progress" role="progressbar" aria-label={`${item.file.name}: ${item.progress}%`} aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${item.progress}%` }} /></div>}
            {item.error && <small className="upload-item-error">{item.error}</small>}
          </div>
          <div className="upload-queue-status">{item.status === 'queued' ? 'Wartet' : item.status === 'uploading' ? `${item.progress}%` : item.status === 'uploaded' ? 'Hochgeladen' : item.status === 'cancelled' ? 'Abgebrochen' : 'Fehlgeschlagen'}</div>
          {item.status === 'uploading' ? <button className="icon-button danger-hover" type="button" aria-label={`${item.file.name} abbrechen`} onClick={() => cancelUpload(item)}><X size={16} /></button>
            : (item.status === 'failed' && item.retryable) || item.status === 'cancelled' ? <button className="icon-button" type="button" aria-label={`${item.file.name} erneut versuchen`} title="Erneut versuchen" disabled={isUploading} onClick={() => void retryUpload(item)}><RotateCcw size={16} /></button>
              : <button className="icon-button" type="button" aria-label={`${item.file.name} aus der Warteschlange entfernen`} onClick={() => removeFromQueue(item.id)}><X size={16} /></button>}
        </article>)}
      </section>}
    </form>}
    {!filesRemote.loading && !filesRemote.error && (filesRemote.data?.length ?? 0) > 0 && <div className="toolbar file-toolbar">
      <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Dateien durchsuchen …" aria-label="Dateien durchsuchen" />{search && <button type="button" aria-label="Suche löschen" onClick={() => setSearch('')}><X size={15} /></button>}</label>
      <label className="select-field"><span className="sr-only">Dateien nach Fach filtern</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">Alle Fächer</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><ChevronDown size={14} /></label>
    </div>}
    <div className="section-heading-row"><div><h2>Alle Dateien</h2><p>{visibleFiles.length} {visibleFiles.length === 1 ? 'Datei' : 'Dateien'} in deinem Lernbereich</p></div></div>
    {filesRemote.loading ? <LoadingState label="Dateien werden geladen …" /> : filesRemote.error ? <ErrorState message={filesRemote.error} retry={filesRemote.reload} /> : visibleFiles.length ? <div className="file-list">{visibleFiles.map((item) => <article className="file-row" key={item.id}>
      <div className={`file-type-icon file-type-${fileTypeLabel(item.filename).toLocaleLowerCase('de-DE')}`}><FileText size={19} /><span>{fileTypeLabel(item.filename)}</span></div><div className="file-info"><strong><button className="file-open-title" onClick={() => navigate(`/files/${item.id}`)}>{item.filename}</button></strong><span><span className="file-subject-dot" />{item.subject_name ?? 'Ohne Fach'} <span>·</span> {formatSize(item.size_bytes)} <span>·</span> {timestamp.format(new Date(item.created_at))}{(fileNameCounts.get(item.filename.toLocaleLowerCase()) ?? 0) > 1 && <em> · mehrfach vorhanden</em>}</span></div>
      <div className="file-actions"><button className="button button-quiet button-small" aria-label={`${item.filename} ansehen`} onClick={() => navigate(`/files/${item.id}`)}><Eye size={15} /> Ansehen</button><button className="button button-quiet button-small" aria-label={`${item.filename} herunterladen`} onClick={() => void download(item)}><Download size={15} /> Herunterladen</button><button className="icon-button" aria-label={`${item.filename} umbenennen`} title="Umbenennen" onClick={() => setRenaming(item)}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`${item.filename} löschen`} onClick={() => void remove(item)}><Trash2 size={16} /></button></div>
    </article>)}</div> : filesRemote.data?.length ? <EmptyState icon={Search} title="Keine passenden Dateien" text="Ändere deine Suche oder wähle ein anderes Fach." action={<button className="text-button" onClick={() => { setSearch(''); setSubjectFilter('all') }}>Filter zurücksetzen</button>} /> : <EmptyState icon={FolderOpen} title="Noch keine Dateien" text="Lade deine erste Datei hoch. Sie wird sicher in deinem Dateispeicher abgelegt." />}
    {renaming && <RenameFileDialog file={renaming} onClose={() => setRenaming(null)} onSave={rename} />}
  </>
}

function validateUploadFile(file: File) {
  const allowed: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  const extension = `.${file.name.split('.').pop()?.toLocaleLowerCase('de-DE') ?? ''}`
  if (!allowed[extension] || file.type !== allowed[extension]) return 'Dieser Dateityp wird nicht unterstützt.'
  if (file.size === 0) return 'Leere Dateien können nicht hochgeladen werden.'
  if (file.size > 4 * 1024 * 1024) return 'Dateien dürfen höchstens 4 MB groß sein.'
  return ''
}

function RenameFileDialog({ file, onClose, onSave }: { file: StoredFile; onClose: () => void; onSave: (file: StoredFile, filename: string) => Promise<void> }) {
  const [filename, setFilename] = useState(file.filename)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const modalRef = useModalFocus(onClose, saving)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(file, filename)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Datei konnte nicht umbenannt werden.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section ref={modalRef} className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="rename-file-title">
      <div className="modal-heading"><div><span className="eyebrow">DATEI ORGANISIEREN</span><h2 id="rename-file-title">Datei umbenennen</h2></div><button className="icon-button" aria-label="Dialog schließen" onClick={onClose} disabled={saving}><X size={18} /></button></div>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <FormField label="Dateiname" required><input autoFocus required maxLength={160} value={filename} onChange={(event) => setFilename(event.target.value)} /></FormField>
        <p className="helper-note">Die Dateiendung muss zum gespeicherten Dateityp passen.</p>
        {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
        <div className="modal-footer"><button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>Abbrechen</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Namen speichern'}</button></div>
      </form>
    </section>
  </div>
}

function fileTypeLabel(filename: string) {
  const extension = filename.split('.').pop()?.toLocaleLowerCase('de-DE') ?? ''
  return extension === 'jpeg' ? 'JPG' : extension.slice(0, 4).toUpperCase() || 'DATEI'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function NotFound() {
  const navigate = useNavigate()
  return <EmptyState icon={Search} title="Diese Seite gibt es nicht" text="Der gesuchte Bereich wurde nicht gefunden." action={<button className="button button-primary" onClick={() => navigate('/')}>Zur Übersicht <ArrowRight size={15} /></button>} />
}

export default App
