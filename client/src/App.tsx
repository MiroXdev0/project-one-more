import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check,
  CheckCircle2, ChevronDown, ClipboardList, Clock3, Download, FileText,
  FolderOpen, GraduationCap, LayoutDashboard, LoaderCircle, Menu, NotebookPen,
  Pencil, Plus, Presentation as PresentationIcon, Search, Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react'
import { ApiError, deleteData, downloadFile, getData, saveData, uploadData } from './services/api'
import type {
  Assignment, DashboardData, Note, PreparationStatus, Presentation, Priority,
  StoredFile, Subject,
} from './types'
import './App.css'

type Toast = { id: number; message: string; tone: 'success' | 'error' }
type ResourcePath = '/subjects' | '/assignments' | '/presentations' | '/notes'
type FormValue = string | boolean
type FormFields = Record<string, FormValue>

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const active = pageDetails[location.pathname] ?? pageDetails['/']!

  return (
    <>
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <NavLink className="brand" to="/" aria-label="Lernzeit Startseite">
          <span className="brand-mark"><GraduationCap size={21} strokeWidth={2.2} /></span>
          <span>lernzeit<span className="brand-dot">.</span></span>
        </NavLink>
        <div className="workspace-label">DEIN LERNBEREICH</div>
        <nav className="side-nav" aria-label="Hauptnavigation">
          {Object.entries(pageDetails).map(([path, page]) => {
            const Icon = page.icon
            return (
              <NavLink key={path} to={path} end={path === '/'} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>
                <Icon size={18} strokeWidth={1.8} /><span>{page.label}</span>
                {path === '/assignments' && <span className="nav-shortcut">↵</span>}
              </NavLink>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="study-card">
            <div className="study-icon"><Sparkles size={16} /></div>
            <strong>Schritt für Schritt.</strong>
            <p>Du machst das richtig gut. Bleib dran!</p>
            <span className="study-decoration">✳</span>
          </div>
          <div className="workspace-profile">
            <div className="avatar">L</div>
            <div><strong>Dein Lernbereich</strong><span>Gemeinsam organisiert</span></div>
            <span className="profile-dot" aria-label="Aktiv" />
          </div>
        </div>
      </aside>
      {mobileMenuOpen && <button className="mobile-backdrop" aria-label="Menü schließen" onClick={() => setMobileMenuOpen(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" aria-label="Menü öffnen" onClick={() => setMobileMenuOpen((open) => !open)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Mein Bereich</span><span className="breadcrumb-slash">/</span><strong>{active.label}</strong></div>
          <div className="topbar-meta"><span className="today-label">{germanDate.format(currentDate)}</span><span className="topbar-divider" /><span className="profile-mini">L</span></div>
        </header>
        <main className="page-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/assignments" element={<ResourcePage kind="assignments" />} />
            <Route path="/presentations" element={<ResourcePage kind="presentations" />} />
            <Route path="/notes" element={<ResourcePage kind="notes" />} />
            <Route path="/subjects" element={<SubjectsPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobilnavigation">
        {Object.entries(pageDetails).slice(0, 5).map(([path, page]) => {
          const Icon = page.icon
          return <NavLink key={path} to={path} end={path === '/'} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `mobile-nav-link ${isActive ? 'mobile-nav-active' : ''}`}><Icon size={19} /><span>{page.label}</span></NavLink>
        })}
      </nav>
    </>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
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
  return (
    <>
      <PageHeading eyebrow={new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(currentDate)} title="Schön, dass du da bist." description="Ein klarer Kopf fängt mit einem guten Überblick an." action={<button className="button button-primary" onClick={() => navigate('/assignments')}><Plus size={17} /> Aufgabe hinzufügen</button>} />
      {loading ? <LoadingState label="Dein Lernbereich wird vorbereitet …" /> : error ? <ErrorState message={error} retry={reload} /> : data ? (
        <>
          <section className="stats-grid" aria-label="Aufgabenstatistik">
            <StatCard label="Offene Aufgaben" value={data.stats.open_assignments} detail={`${data.stats.due_soon_assignments} bald fällig`} icon={ClipboardList} tone="violet" />
            <StatCard label="Überfällig" value={data.stats.overdue_assignments} detail={data.stats.overdue_assignments ? 'Ein guter Moment, anzufangen' : 'Alles im grünen Bereich'} icon={Clock3} tone="rose" />
            <StatCard label="Erledigt" value={data.stats.completed_assignments} detail="Aufgaben abgeschlossen" icon={CheckCircle2} tone="mint" />
            <StatCard label="Präsentationen" value={data.stats.upcoming_presentations} detail="Als Nächstes geplant" icon={PresentationIcon} tone="amber" />
          </section>

          <section className="dashboard-grid">
            <div className="panel assignments-panel">
              <PanelTitle icon={ClipboardList} title="Als Nächstes" subtitle="Deine anstehenden Aufgaben" action={<button className="panel-link" onClick={() => navigate('/assignments')}>Alle ansehen <ArrowRight size={14} /></button>} />
              {data.assignments.length ? <div className="agenda-list">{data.assignments.map((item) => (
                <div className="agenda-row" key={item.id}>
                  <span className="subject-dot" style={{ backgroundColor: item.subject_color ?? '#c4b5fd' }} />
                  <div className="agenda-copy"><strong>{item.title}</strong><span>{item.subject_name ?? 'Ohne Fach'} <span className="meta-separator">·</span> <span className={isOverdue(item.due_date) ? 'overdue-text' : ''}>{dueLabel(item.due_date)}</span></span></div>
                  <span className={`priority-pill priority-${item.priority}`}>{priorityLabel[item.priority]}</span>
                </div>
              ))}</div> : <EmptyState icon={ClipboardList} title="Noch nichts auf der Liste" text="Füge eine Aufgabe hinzu, damit du den Überblick behältst." action={<button className="text-button" onClick={() => navigate('/assignments')}>Aufgabe erstellen <ArrowRight size={14} /></button>} />}
            </div>

            <div className="panel presentations-panel">
              <PanelTitle icon={PresentationIcon} title="Termine im Blick" subtitle="Deine nächsten Präsentationen" action={<button className="panel-link" onClick={() => navigate('/presentations')}>Alle ansehen <ArrowRight size={14} /></button>} />
              {data.presentations.length ? <div className="presentation-list">{data.presentations.map((item) => (
                <div className="presentation-row" key={item.id}>
                  <div className="calendar-tile"><span>{new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(`${item.presentation_date}T12:00:00`))}</span><strong>{new Intl.DateTimeFormat('de-DE', { day: '2-digit' }).format(new Date(`${item.presentation_date}T12:00:00`))}</strong></div>
                  <div className="agenda-copy"><strong>{item.title}</strong><span>{item.subject_name ?? 'Ohne Fach'}</span></div>
                  <span className={`prep-dot prep-${item.prep_status}`} title={prepLabel[item.prep_status]} />
                </div>
              ))}</div> : <EmptyState icon={PresentationIcon} title="Keine Termine geplant" text="Deine Präsentationen werden hier gesammelt." action={<button className="text-button" onClick={() => navigate('/presentations')}>Termin eintragen <ArrowRight size={14} /></button>} />}
            </div>
          </section>

          <section className="dashboard-grid dashboard-grid-lower">
            <div className="panel subjects-panel">
              <PanelTitle icon={BookOpen} title="Deine Fächer" subtitle="Alles an seinem Platz" action={<button className="panel-link" onClick={() => navigate('/subjects')}>Fächer verwalten <ArrowRight size={14} /></button>} />
              {data.subjects.length ? <div className="subject-chip-list">{data.subjects.slice(0, 6).map((subject) => (
                <button className="subject-chip-card" key={subject.id} onClick={() => navigate('/subjects')}>
                  <span className="subject-chip-color" style={{ backgroundColor: subject.color }} />
                  <span className="subject-chip-name">{subject.name}</span>
                  <span className="subject-chip-count">{subject.assignment_count} offen</span>
                  <ArrowUpRight size={14} className="subject-chip-arrow" />
                </button>
              ))}</div> : <EmptyState icon={BookOpen} title="Noch keine Fächer" text="Lege zuerst deine Fächer an und ordne ihnen deine Arbeit zu." action={<button className="text-button" onClick={() => navigate('/subjects')}>Fach hinzufügen <ArrowRight size={14} /></button>} />}
            </div>
            <div className="panel notes-panel">
              <PanelTitle icon={NotebookPen} title="Zuletzt notiert" subtitle="Deine neuesten Gedanken" action={<button className="panel-link" onClick={() => navigate('/notes')}>Alle Notizen <ArrowRight size={14} /></button>} />
              {data.notes.length ? <div className="recent-notes">{data.notes.map((note) => (
                <button key={note.id} className="recent-note" onClick={() => navigate('/notes')}>
                  <span className="recent-note-title">{note.title}</span><span className="recent-note-preview">{note.preview}</span><span className="recent-note-meta"><span className="subject-dot" style={{ backgroundColor: note.subject_color ?? '#c4b5fd' }} />{note.subject_name ?? 'Ohne Fach'}<span>·</span>{timestamp.format(new Date(note.updated_at))}</span>
                </button>
              ))}</div> : <EmptyState icon={NotebookPen} title="Deine Notizen warten" text="Halte wichtige Gedanken und Lerninhalte fest." action={<button className="text-button" onClick={() => navigate('/notes')}>Notiz schreiben <ArrowRight size={14} /></button>} />}
            </div>
          </section>
          <section className="nudge-banner"><div className="nudge-star"><Sparkles size={18} /></div><div><strong>Ein kleiner Schritt zählt auch.</strong><p>Du hast schon {data.stats.completed_assignments} {data.stats.completed_assignments === 1 ? 'Aufgabe' : 'Aufgaben'} erledigt. Mach weiter in deinem Tempo.</p></div><button className="nudge-action" onClick={() => navigate('/assignments')}>Weiterlernen <ArrowRight size={15} /></button></section>
        </>
      ) : null}
    </>
  )
}

function StatCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof FileText; tone: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${tone}`}><Icon size={17} /></span></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></article>
}

function PanelTitle({ icon: Icon, title, subtitle, action }: { icon: typeof FileText; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="panel-title"><span className="panel-title-icon"><Icon size={17} /></span><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>
}

const priorityLabel: Record<Priority, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' }
const prepLabel: Record<PreparationStatus, string> = { not_started: 'Nicht begonnen', in_progress: 'In Arbeit', ready: 'Bereit' }

function isOverdue(date: string) {
  return date < todayIso
}

function dueLabel(date: string) {
  if (date === todayIso) return 'Heute fällig'
  if (isOverdue(date)) return `Überfällig · ${shortDate.format(new Date(`${date}T12:00:00`))}`
  return shortDate.format(new Date(`${date}T12:00:00`))
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
  const subjects = subjectsRemote.data ?? []
  const notify = useNotify()
  const [editing, setEditing] = useState<EntityRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState(kind === 'notes' ? 'newest' : 'date')
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
      result.sort((a, b) => (a as Presentation).presentation_date.localeCompare((b as Presentation).presentation_date))
    } else {
      result.sort((a, b) => sortBy === 'oldest'
        ? a.updated_at.localeCompare(b.updated_at)
        : b.updated_at.localeCompare(a.updated_at))
    }
    return result
  }, [data, kind, search, sortBy, statusFilter, subjectFilter])

  const save = async (values: FormFields, id?: string) => {
    await saveData(path, values, id)
    setCreating(false)
    setEditing(null)
    reload()
    notify(`${meta.singular} ${id ? 'aktualisiert' : 'hinzugefügt'}.`)
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
    <>
      <PageHeading eyebrow={`DEIN LERNBEREICH · ${meta.label.toLocaleUpperCase('de-DE')}`} title={meta.label} description={meta.description} action={<button className="button button-primary" onClick={() => setCreating(true)} disabled={kind !== 'assignments' && subjects.length === 0 || kind === 'assignments' && subjects.length === 0}><Plus size={17} /> {meta.singular} erstellen</button>} />
      {subjectsRemote.error && <div className="inline-warning"><AlertCircle size={16} /> Fächer konnten nicht geladen werden: {subjectsRemote.error}</div>}
      {kind !== 'notes' || (data?.length ?? 0) > 0 ? <div className="toolbar">
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${meta.label} durchsuchen …`} aria-label={`${meta.label} durchsuchen`} />{search && <button aria-label="Suche löschen" onClick={() => setSearch('')}><X size={15} /></button>}</label>
        <div className="filter-fields">
          {subjects.length > 0 && <label className="select-field"><span className="sr-only">Nach Fach filtern</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">Alle Fächer</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><ChevronDown size={14} /></label>}
          {kind === 'assignments' && <label className="select-field"><span className="sr-only">Nach Status filtern</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Alle Status</option><option value="open">Offen</option><option value="overdue">Überfällig</option><option value="completed">Erledigt</option></select><ChevronDown size={14} /></label>}
          {kind === 'presentations' && <label className="select-field"><span className="sr-only">Nach Vorbereitungsstatus filtern</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Alle Stände</option><option value="not_started">Nicht begonnen</option><option value="in_progress">In Arbeit</option><option value="ready">Bereit</option></select><ChevronDown size={14} /></label>}
          {kind !== 'presentations' && <label className="select-field"><span className="sr-only">Sortieren</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{kind === 'assignments' ? <><option value="date">Nach Abgabedatum</option><option value="priority">Nach Priorität</option></> : <><option value="newest">Zuletzt geändert</option><option value="oldest">Älteste zuerst</option></>}</select><ChevronDown size={14} /></label>}
        </div>
      </div> : null}

      {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : filtered.length ? (
        <section className="resource-grid" aria-label={meta.label}>
          {filtered.map((item) => <ResourceCard key={item.id} kind={kind} item={item} onEdit={() => setEditing(item)} onDelete={() => void remove(item)} onToggle={() => void toggleComplete(item)} />)}
        </section>
      ) : (
        <EmptyState icon={Icon} title={data?.length ? 'Nichts gefunden' : `Noch keine ${meta.label.toLocaleLowerCase('de-DE')}`} text={data?.length ? 'Passe deine Suche oder Filter an.' : `${meta.singular} hinzufügen und den Kopf frei bekommen.`} action={data?.length ? <button className="text-button" onClick={() => { setSearch(''); setSubjectFilter('all'); setStatusFilter('all') }}>Filter zurücksetzen</button> : <button className="button button-primary button-small" disabled={subjects.length === 0} onClick={() => subjects.length ? setCreating(true) : navigate('/subjects')}><Plus size={15} />{subjects.length ? `${meta.singular} erstellen` : 'Zuerst ein Fach anlegen'}</button>} />
      )}
      {subjects.length === 0 && kind !== 'assignments' && <p className="helper-note"><BookOpen size={15} /> <button className="text-button" onClick={() => navigate('/subjects')}>Lege zuerst ein Fach an</button>, damit deine {meta.label.toLocaleLowerCase('de-DE')} zugeordnet werden können.</p>}
      {(creating || editing) && <ResourceModal kind={kind} subjects={subjects} item={editing} onClose={() => { setCreating(false); setEditing(null) }} onSave={save} />}
    </>
  )
}

const priorityOrder: Record<Priority, number> = { low: 0, medium: 1, high: 2 }

function ResourceCard({ kind, item, onEdit, onDelete, onToggle }: { kind: ResourceKind; item: EntityRecord; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const assignment = item as Assignment
  const presentation = item as Presentation
  const note = item as Note
  return (
    <article className={`resource-card ${kind === 'assignments' && assignment.completed ? 'resource-completed' : ''}`}>
      <div className="resource-card-top"><span className="subject-tag"><span className="subject-dot" style={{ backgroundColor: item.subject_color ?? '#b8a4ff' }} />{item.subject_name ?? 'Fach'}</span><div className="card-actions">
        {kind === 'assignments' && <button className={`icon-button complete-button ${assignment.completed ? 'is-completed' : ''}`} aria-label={assignment.completed ? 'Als offen markieren' : 'Als erledigt markieren'} title={assignment.completed ? 'Wieder öffnen' : 'Erledigt'} onClick={onToggle}><Check size={16} /></button>}
        <button className="icon-button" aria-label={`${item.title} bearbeiten`} title="Bearbeiten" onClick={onEdit}><Pencil size={15} /></button>
        <button className="icon-button danger-hover" aria-label={`${item.title} löschen`} title="Löschen" onClick={onDelete}><Trash2 size={15} /></button>
      </div></div>
      <h2 className={kind === 'assignments' && assignment.completed ? 'strikethrough' : ''}>{item.title}</h2>
      {kind !== 'notes' && <p className="resource-description">{'description' in item && item.description ? item.description : 'Keine Beschreibung hinzugefügt.'}</p>}
      {kind === 'notes' && <p className="note-preview">{note.content}</p>}
      <div className="resource-card-bottom">
        {kind === 'assignments' && <><span className={`resource-date ${!assignment.completed && isOverdue(assignment.due_date) ? 'overdue-text' : ''}`}><CalendarDays size={14} />{dueLabel(assignment.due_date)}</span><span className={`priority-pill priority-${assignment.priority}`}>{priorityLabel[assignment.priority]}</span>{assignment.completed && <span className="completed-label"><CheckCircle2 size={13} />Erledigt</span>}</>}
        {kind === 'presentations' && <><span className="resource-date"><CalendarDays size={14} />{timestamp.format(new Date(`${presentation.presentation_date}T12:00:00`))}</span><span className={`prep-badge prep-badge-${presentation.prep_status}`}>{prepLabel[presentation.prep_status]}</span></>}
        {kind === 'notes' && <><span className="resource-date"><Clock3 size={14} />Bearbeitet {timestamp.format(new Date(note.updated_at))}</span><span className="note-word-count">{note.content.trim().split(/\s+/).filter(Boolean).length} Wörter</span></>}
      </div>
      {kind === 'presentations' && presentation.notes && <div className="presentation-notes"><strong>Notizen</strong><span>{presentation.notes}</span></div>}
    </article>
  )
}

function ResourceModal({ kind, subjects, item, onClose, onSave }: { kind: ResourceKind; subjects: Subject[]; item: EntityRecord | null; onClose: () => void; onSave: (values: FormFields, id?: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const today = todayIso
  const defaults: FormFields = item ? {
    title: item.title,
    subject_id: item.subject_id,
    description: 'description' in item ? item.description : '',
    ...('due_date' in item ? { due_date: item.due_date, priority: item.priority, completed: item.completed } : {}),
    ...('presentation_date' in item ? { presentation_date: item.presentation_date, prep_status: item.prep_status, notes: item.notes } : {}),
    ...('content' in item ? { content: item.content } : {}),
  } : {
    title: '', subject_id: subjects[0]?.id ?? '', description: '',
    ...(kind === 'assignments' ? { due_date: today, priority: 'medium', completed: false } : {}),
    ...(kind === 'presentations' ? { presentation_date: today, prep_status: 'not_started', notes: '' } : {}),
    ...(kind === 'notes' ? { content: '' } : {}),
  }
  const [values, setValues] = useState<FormFields>(defaults)
  const set = (key: string, value: FormValue) => setValues((current) => ({ ...current, [key]: value }))
  const meta = resourceMeta[kind]
  const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose() }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try { await onSave(values, item?.id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.') } finally { setSaving(false) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }} onKeyDown={closeOnEscape}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
      <div className="modal-heading"><div><span className="eyebrow">{item ? 'BEARBEITEN' : 'NEU ANLEGEN'}</span><h2 id="modal-heading">{item ? `${meta.singular} bearbeiten` : `Neue ${meta.singular.toLocaleLowerCase('de-DE')}`}</h2></div><button className="icon-button" aria-label="Schließen" onClick={onClose}><X size={18} /></button></div>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <FormField label="Titel" required><input autoFocus required maxLength={160} value={String(values.title ?? '')} onChange={(event) => set('title', event.target.value)} placeholder="Worum geht es?" /></FormField>
        <FormField label="Fach" required><select required value={String(values.subject_id ?? '')} onChange={(event) => set('subject_id', event.target.value)}><option value="" disabled>Fach auswählen</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></FormField>
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

function SubjectsPage() {
  const subjectsRemote = useRemote<Subject[]>('/subjects')
  const assignmentsRemote = useRemote<Assignment[]>('/assignments')
  const presentationsRemote = useRemote<Presentation[]>('/presentations')
  const notesRemote = useRemote<Note[]>('/notes')
  const filesRemote = useRemote<StoredFile[]>('/files')
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
    {subjectsRemote.loading ? <LoadingState /> : error ? <ErrorState message={error} retry={() => { subjectsRemote.reload(); assignmentsRemote.reload(); presentationsRemote.reload(); notesRemote.reload(); filesRemote.reload() }} /> : subjectsRemote.data?.length ? <section className="subject-grid">
      {subjectsRemote.data.map((subject) => {
        const subjectAssignments = assignmentsRemote.data?.filter((item) => item.subject_id === subject.id) ?? []
        const subjectPresentations = presentationsRemote.data?.filter((item) => item.subject_id === subject.id) ?? []
        const subjectNotes = notesRemote.data?.filter((item) => item.subject_id === subject.id) ?? []
        const subjectFiles = filesRemote.data?.filter((item) => item.subject_id === subject.id) ?? []
        const open = expanded === subject.id
        return <article className={`subject-card ${open ? 'subject-card-expanded' : ''}`} key={subject.id}>
          <div className="subject-card-accent" style={{ backgroundColor: subject.color }} />
          <div className="subject-card-content">
            <div className="subject-card-top"><span className="subject-large-dot" style={{ backgroundColor: subject.color }} /><div className="card-actions"><button className="icon-button" aria-label={`${subject.name} bearbeiten`} onClick={() => setEditing(subject)}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`${subject.name} löschen`} onClick={() => void remove(subject)}><Trash2 size={15} /></button></div></div>
            <h2>{subject.name}</h2><p className="subject-description">{subject.description || 'Noch keine Beschreibung.'}</p>
            <div className="subject-counts"><span><ClipboardList size={14} />{subjectAssignments.length} Aufgaben</span><span><PresentationIcon size={14} />{subjectPresentations.length} Vorträge</span></div>
            <button className="subject-details-toggle" onClick={() => setExpanded(open ? null : subject.id)}>{open ? 'Details ausblenden' : 'Inhalte ansehen'}<ChevronDown size={15} className={open ? 'chevron-open' : ''} /></button>
            {open && <div className="subject-details">
              <RelatedList title="Aufgaben" items={subjectAssignments.map((item) => ({ id: item.id, title: item.title, meta: item.completed ? 'Erledigt' : dueLabel(item.due_date) }))} />
              <RelatedList title="Präsentationen" items={subjectPresentations.map((item) => ({ id: item.id, title: item.title, meta: timestamp.format(new Date(`${item.presentation_date}T12:00:00`)) }))} />
              <RelatedList title="Notizen" items={subjectNotes.map((item) => ({ id: item.id, title: item.title, meta: timestamp.format(new Date(item.updated_at)) }))} />
              <RelatedList title="Dateien" items={subjectFiles.map((item) => ({ id: item.id, title: item.filename, meta: formatSize(item.size_bytes) }))} />
            </div>}
          </div>
        </article>
      })}
    </section> : <EmptyState icon={BookOpen} title="Dein Lernplan beginnt hier" text="Erstelle ein Fach und ordne ihm anschließend Aufgaben, Notizen und Dateien zu." action={<button className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} /> Erstes Fach anlegen</button>} />}
    {(creating || editing) && <SubjectModal subject={editing} onClose={() => { setCreating(false); setEditing(null) }} onSave={save} />}
  </>
}

function RelatedList({ title, items }: { title: string; items: Array<{ id: string; title: string; meta: string }> }) {
  return <div className="related-list"><strong>{title} <span>{items.length}</span></strong>{items.length ? items.slice(0, 5).map((item) => <div key={item.id}><span>{item.title}</span><small>{item.meta}</small></div>) : <p>Noch keine Einträge.</p>}</div>
}

function SubjectModal({ subject, onClose, onSave }: { subject: Subject | null; onClose: () => void; onSave: (values: FormFields, id?: string) => Promise<void> }) {
  const [values, setValues] = useState<FormFields>({ name: subject?.name ?? '', description: subject?.description ?? '', color: subject?.color ?? '#7568D9' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: string, value: string) => setValues((old) => ({ ...old, [key]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('')
    try { await onSave(values, subject?.id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.') } finally { setSaving(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="subject-modal-title">
    <div className="modal-heading"><div><span className="eyebrow">{subject ? 'BEARBEITEN' : 'NEU ANLEGEN'}</span><h2 id="subject-modal-title">{subject ? 'Fach bearbeiten' : 'Neues Fach'}</h2></div><button className="icon-button" aria-label="Schließen" onClick={onClose}><X size={18} /></button></div>
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <FormField label="Fachname" required><input autoFocus required maxLength={100} value={String(values.name)} onChange={(event) => set('name', event.target.value)} placeholder="z. B. Biologie" /></FormField>
      <FormField label="Beschreibung"><textarea rows={3} maxLength={1000} value={String(values.description)} onChange={(event) => set('description', event.target.value)} placeholder="Was lernst du in diesem Fach?" /></FormField>
      <FormField label="Farbe"><div className="color-field"><input type="color" value={String(values.color)} onChange={(event) => set('color', event.target.value)} /><span>{String(values.color).toUpperCase()}</span></div></FormField>
      {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
      <div className="modal-footer"><button className="button button-quiet" type="button" onClick={onClose}>Abbrechen</button><button className="button button-primary" type="submit" disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}{subject ? 'Änderungen speichern' : 'Fach hinzufügen'}</button></div>
    </form>
  </section></div>
}

function FilesPage() {
  const filesRemote = useRemote<StoredFile[]>('/files')
  const subjectsRemote = useRemote<Subject[]>('/subjects')
  const [subjectId, setSubjectId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const notify = useNotify()
  const subjects = subjectsRemote.data ?? []

  const selectedSubjectId = subjectId || subjects[0]?.id || ''

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file || !selectedSubjectId) return
    setUploading(true); setError('')
    try {
      await uploadData(file, selectedSubjectId)
      setFile(null)
      const input = document.getElementById('file-input') as HTMLInputElement | null
      if (input) input.value = ''
      filesRemote.reload()
      notify('Datei sicher hochgeladen.')
    } catch (reason) {
      const message = reason instanceof ApiError && reason.status === 0 ? reason.message : reason instanceof Error ? reason.message : 'Upload fehlgeschlagen.'
      setError(message)
      notify(message, 'error')
    } finally { setUploading(false) }
  }

  const remove = async (item: StoredFile) => {
    if (!window.confirm(`Möchtest du „${item.filename}“ wirklich löschen?`)) return
    try { await deleteData('/files', item.id); filesRemote.reload(); notify('Datei gelöscht.') } catch (reason) { notify(reason instanceof Error ? reason.message : 'Datei konnte nicht gelöscht werden.', 'error') }
  }

  const download = async (item: StoredFile) => {
    try { await downloadFile(item.id) } catch (reason) { notify(reason instanceof Error ? reason.message : 'Download fehlgeschlagen.', 'error') }
  }

  return <>
    <PageHeading eyebrow="DEIN LERNBEREICH · DATEIEN" title="Deine Dateien" description="Arbeitsblätter, Zusammenfassungen und alles Wichtige an einem Ort." />
    {subjectsRemote.error && <ErrorState message={subjectsRemote.error} retry={subjectsRemote.reload} />}
    {!subjectsRemote.loading && subjects.length === 0 ? <EmptyState icon={BookOpen} title="Erst ein Fach anlegen" text="Dateien können einem Fach zugeordnet werden. Lege zuerst dein erstes Fach an." action={<a className="button button-primary" href="/subjects"><Plus size={16} /> Fach hinzufügen</a>} /> : <form className="upload-panel" onSubmit={(event) => void upload(event)}>
      <div className="upload-icon"><UploadCloud size={21} /></div><div className="upload-copy"><strong>Datei hochladen</strong><span>PDF, DOCX, XLSX, TXT, PNG, JPG oder WEBP · max. 10 MB</span></div>
      <label className="select-field upload-subject"><span className="sr-only">Fach auswählen</span><select required value={selectedSubjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="" disabled>Fach auswählen</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><ChevronDown size={14} /></label>
      <label className="button button-secondary file-picker" htmlFor="file-input"><Plus size={16} /> Datei auswählen<input id="file-input" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      {file && <div className="selected-file"><span>{file.name} <small>{formatSize(file.size)}</small></span><button type="button" className="icon-button" onClick={() => { setFile(null); const input = document.getElementById('file-input') as HTMLInputElement | null; if (input) input.value = '' }} aria-label="Ausgewählte Datei entfernen"><X size={15} /></button></div>}
      {error && <div className="form-error upload-error"><AlertCircle size={16} />{error}</div>}
      {file && <button className="button button-primary upload-submit" type="submit" disabled={uploading || !subjectId}>{uploading ? <><LoaderCircle size={16} className="spin" /> Wird hochgeladen …</> : <><UploadCloud size={16} /> Hochladen</>}</button>}
    </form>}
    <div className="section-heading-row"><div><h2>Alle Dateien</h2><p>{filesRemote.data?.length ?? 0} Dateien in deinem Lernbereich</p></div></div>
    {filesRemote.loading ? <LoadingState label="Dateien werden geladen …" /> : filesRemote.error ? <ErrorState message={filesRemote.error} retry={filesRemote.reload} /> : filesRemote.data?.length ? <div className="file-list">{filesRemote.data.map((item) => <article className="file-row" key={item.id}>
      <div className="file-type-icon"><FileText size={19} /></div><div className="file-info"><strong>{item.filename}</strong><span><span className="file-subject-dot" />{item.subject_name ?? 'Ohne Fach'} <span>·</span> {formatSize(item.size_bytes)} <span>·</span> {timestamp.format(new Date(item.created_at))}</span></div>
      <div className="file-actions"><button className="button button-quiet button-small" onClick={() => void download(item)}><Download size={15} /> Herunterladen</button><button className="icon-button danger-hover" aria-label={`${item.filename} löschen`} onClick={() => void remove(item)}><Trash2 size={16} /></button></div>
    </article>)}</div> : <EmptyState icon={FolderOpen} title="Noch keine Dateien" text="Lade deine erste Datei hoch. Sie wird sicher in deinem Dateispeicher abgelegt." />}
  </>
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
