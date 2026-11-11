import { z } from 'zod'

const subjectId = z.string().uuid({ error: 'Bitte wähle ein gültiges Fach aus.' })
const title = z.string().trim().min(1, { error: 'Bitte gib einen Titel ein.' }).max(160, { error: 'Der Titel darf höchstens 160 Zeichen lang sein.' })
const description = z.string().trim().max(5000, { error: 'Die Beschreibung darf höchstens 5000 Zeichen lang sein.' }).default('')
const presentationSlideSchema = z.object({
  title: z.string().trim().max(160).default(''),
  content: z.string().max(5000).default(''),
  image_file_id: z.uuid().nullable().default(null),
}).strict()

export const subjectSchema = z.object({
  name: z.string().trim().min(1, { error: 'Bitte gib einen Fachnamen ein.' }).max(100, { error: 'Der Fachname darf höchstens 100 Zeichen lang sein.' }),
  description: z.string().trim().max(1000, { error: 'Die Beschreibung darf höchstens 1000 Zeichen lang sein.' }).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Bitte wähle eine gültige Fachfarbe aus.' }),
}).strict()

export const assignmentSchema = z.object({
  subject_id: subjectId,
  title,
  description,
  due_date: z.iso.date({ error: 'Bitte gib ein gültiges Abgabedatum an.' }),
  priority: z.enum(['low', 'medium', 'high']),
  completed: z.boolean().default(false),
}).strict()

export const presentationSchema = z.object({
  subject_id: subjectId,
  title,
  description,
  presentation_date: z.iso.date({ error: 'Bitte gib ein gültiges Präsentationsdatum an.' }),
  prep_status: z.enum(['not_started', 'in_progress', 'ready']),
  notes: z.string().trim().max(5000, { error: 'Die Notizen dürfen höchstens 5000 Zeichen lang sein.' }).default(''),
  slides: z.array(presentationSlideSchema).max(80, { error: 'Eine Präsentation darf höchstens 80 Folien enthalten.' }).default([]),
}).strict()

export const noteSchema = z.object({
  subject_id: subjectId,
  title,
  content: z.string().trim().min(1, { error: 'Bitte gib einen Inhalt für die Notiz ein.' }).max(20000, { error: 'Notizen dürfen höchstens 20000 Zeichen lang sein.' }),
}).strict()

export type ResourceName = 'subjects' | 'assignments' | 'presentations' | 'notes'
