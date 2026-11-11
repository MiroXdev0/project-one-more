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
  object_key: string
  created_at: string
}
