import { AppError, query } from '../database/connection.js'
import type { ResourceName } from '../validation/schemas.js'

const resourceTables: Record<ResourceName, { table: string; columns: Record<string, string>; joins: boolean }> = {
  subjects: {
    table: 'subjects',
    columns: { name: 'name', description: 'description', color: 'color' },
    joins: false,
  },
  assignments: {
    table: 'assignments',
    columns: {
      subject_id: 'subject_id', title: 'title', description: 'description',
      due_date: 'due_date', priority: 'priority', completed: 'completed',
    },
    joins: true,
  },
  presentations: {
    table: 'presentations',
    columns: {
      subject_id: 'subject_id', title: 'title', description: 'description',
      presentation_date: 'presentation_date', prep_status: 'prep_status', notes: 'notes',
    },
    joins: true,
  },
  notes: {
    table: 'notes',
    columns: { subject_id: 'subject_id', title: 'title', content: 'content' },
    joins: true,
  },
}

function configFor(resource: ResourceName) {
  return resourceTables[resource]
}

export async function listResource(resource: ResourceName) {
  const config = configFor(resource)
  const join = config.joins ? ' LEFT JOIN subjects s ON s.id = r.subject_id' : ''
  const subjectColumn = config.joins ? ', s.name AS subject_name, s.color AS subject_color' : ''
  const dateColumn = resource === 'assignments' ? 'r.due_date'
    : resource === 'presentations' ? 'r.presentation_date'
      : resource === 'notes' ? 'r.updated_at'
        : 'r.name'
  return query(
    `SELECT r.*${subjectColumn} FROM ${config.table} r${join} ORDER BY ${dateColumn} ASC`,
  )
}

export async function createResource(resource: ResourceName, data: Record<string, unknown>) {
  const config = configFor(resource)
  const entries = Object.entries(data).filter(([key]) => key in config.columns)
  const columns = entries.map(([key]) => config.columns[key])
  const values = entries.map(([, value]) => value)
  const placeholders = values.map((_, index) => `$${index + 1}`)
  const rows = await query(
    `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values,
  )
  return rows[0]
}

export async function updateResource(resource: ResourceName, id: string, data: Record<string, unknown>) {
  const config = configFor(resource)
  const entries = Object.entries(data).filter(([key]) => key in config.columns)
  const values = entries.map(([, value]) => value)
  const assignments = entries.map(([key], index) => `${config.columns[key]} = $${index + 1}`)
  values.push(id)
  const rows = await query(
    `UPDATE ${config.table} SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values,
  )
  if (!rows[0]) throw new AppError('Eintrag nicht gefunden.', 404)
  return rows[0]
}

export async function deleteResource(resource: ResourceName, id: string) {
  const rows = await query(
    `DELETE FROM ${configFor(resource).table} WHERE id = $1 RETURNING id`,
    [id],
  )
  if (!rows[0]) throw new AppError('Eintrag nicht gefunden.', 404)
}

export async function getDashboard() {
  const [stats, assignments, presentations, notes, subjects] = await Promise.all([
    query(`SELECT
      COUNT(*) FILTER (WHERE completed = FALSE)::int AS open_assignments,
      COUNT(*) FILTER (WHERE completed = FALSE AND due_date < CURRENT_DATE)::int AS overdue_assignments,
      COUNT(*) FILTER (WHERE completed = TRUE)::int AS completed_assignments,
      COUNT(*) FILTER (WHERE completed = FALSE AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2)::int AS due_soon_assignments,
      (SELECT COUNT(*)::int FROM presentations WHERE presentation_date >= CURRENT_DATE) AS upcoming_presentations
      FROM assignments`),
    query(`SELECT a.id, a.title, a.due_date, a.priority, a.completed, s.name AS subject_name, s.color AS subject_color
      FROM assignments a LEFT JOIN subjects s ON s.id = a.subject_id
      WHERE a.completed = FALSE ORDER BY a.due_date ASC LIMIT 5`),
    query(`SELECT p.id, p.title, p.presentation_date, p.prep_status, s.name AS subject_name, s.color AS subject_color
      FROM presentations p LEFT JOIN subjects s ON s.id = p.subject_id
      WHERE p.presentation_date >= CURRENT_DATE ORDER BY p.presentation_date ASC LIMIT 4`),
    query(`SELECT n.id, n.title, LEFT(n.content, 180) AS preview, n.updated_at, s.name AS subject_name, s.color AS subject_color
      FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id ORDER BY n.updated_at DESC LIMIT 4`),
    query(`SELECT s.id, s.name, s.color,
      (SELECT COUNT(*)::int FROM assignments a WHERE a.subject_id = s.id AND a.completed = FALSE) AS assignment_count,
      (SELECT COUNT(*)::int FROM presentations p WHERE p.subject_id = s.id) AS presentation_count
      FROM subjects s ORDER BY s.name ASC`),
  ])
  return { stats: stats[0], assignments, presentations, notes, subjects }
}
