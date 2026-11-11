export type Priority = 'low' | 'medium' | 'high'
export type PreparationStatus = 'not_started' | 'in_progress' | 'ready'

export interface Subject {
  id: string
  name: string
  description: string
  color: string
  created_at: string
  updated_at: string
}

export interface Assignment {
  id: string
  subject_id: string
  subject_name?: string
  subject_color?: string
  title: string
  description: string
  due_date: string
  priority: Priority
  completed: boolean
  created_at: string
  updated_at: string
}

export interface Presentation {
  id: string
  subject_id: string
  subject_name?: string
  subject_color?: string
  title: string
  description: string
  presentation_date: string
  prep_status: PreparationStatus
  notes: string
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  subject_id: string
  subject_name?: string
  subject_color?: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface StoredFile {
  id: string
  subject_id: string
  subject_name?: string
  filename: string
  content_type: string
  size_bytes: number
  created_at: string
}

export interface DashboardData {
  stats: { open_assignments: number; overdue_assignments: number; completed_assignments: number; due_soon_assignments: number; upcoming_presentations: number }
  assignments: Assignment[]
  presentations: Presentation[]
  notes: Array<Note & { preview: string }>
  subjects: Array<Subject & { assignment_count: number; presentation_count: number }>
}

export type Resource = Assignment | Presentation | Note | Subject
