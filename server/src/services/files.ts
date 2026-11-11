import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { Files } from 'files-sdk'
import { neon } from 'files-sdk/neon'
import { AppError, query } from '../database/connection.js'
import type { StoredFile } from '../types/domain.js'

const maxFileSize = 4 * 1024 * 1024
const storageBucket = 'uploads'
const allowedTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function hasExpectedSignature(file: Express.Multer.File, extension: string) {
  const bytes = file.buffer
  if (extension === '.pdf') return bytes.subarray(0, 5).toString() === '%PDF-'
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (extension === '.jpg' || extension === '.jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (extension === '.webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
  if (extension === '.docx' || extension === '.xlsx') return bytes.subarray(0, 2).toString() === 'PK'
  if (extension === '.txt') return !bytes.includes(0)
  return false
}

function getStorage() {
  const { AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env
  if (!AWS_ENDPOINT_URL_S3 || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new AppError('Der Dateispeicher ist nicht konfiguriert. Hinterlege die von Neon Object Storage generierten AWS_* Umgebungsvariablen.', 503)
  }
  return new Files({ adapter: neon({ bucket: storageBucket }) })
}

export async function listFiles(assignmentId?: string) {
  const filter = assignmentId ? 'WHERE f.assignment_id = $1' : ''
  return query<StoredFile & Record<string, unknown>>(
    `SELECT f.id, f.subject_id, s.name AS subject_name, f.filename, f.content_type, f.size_bytes::int AS size_bytes,
      f.assignment_id, f.created_at
      FROM stored_files f LEFT JOIN subjects s ON s.id = f.subject_id
      ${filter} ORDER BY f.created_at DESC`,
    assignmentId ? [assignmentId] : [],
  )
}

async function findFile(id: string) {
  const records = await query<StoredFile & Record<string, unknown>>(
    'SELECT * FROM stored_files WHERE id = $1',
    [id],
  )
  const file = records[0]
  if (!file) throw new AppError('Datei nicht gefunden.', 404)
  return file
}

function publicMetadata(file: StoredFile & Record<string, unknown>) {
  const { object_key: _objectKey, ...metadata } = file
  return metadata
}

export async function getFileMetadata(id: string) {
  const rows = await query<StoredFile & Record<string, unknown>>(
    `SELECT f.id, f.subject_id, s.name AS subject_name, f.assignment_id, f.filename,
      f.content_type, f.size_bytes::int AS size_bytes, f.created_at
      FROM stored_files f LEFT JOIN subjects s ON s.id = f.subject_id
      WHERE f.id = $1`,
    [id],
  )
  const file = rows[0]
  if (!file) throw new AppError('Datei nicht gefunden.', 404)
  return publicMetadata(file)
}

export async function getFileContent(id: string) {
  const file = await findFile(id)
  try {
    const stored = await getStorage().download(file.object_key)
    return {
      filename: file.filename,
      content_type: file.content_type,
      bytes: new Uint8Array(await stored.arrayBuffer()),
    }
  } catch (error) {
    console.error('Neon Object Storage content retrieval failed:', error)
    throw new AppError('Der Dateiinhalt ist derzeit nicht verfügbar. Bitte lade die Datei herunter oder versuche es später erneut.', 502)
  }
}

export async function uploadFile(file: Express.Multer.File | undefined, subjectId: string, assignmentId?: string) {
  if (!file) throw new AppError('Bitte wähle eine Datei zum Hochladen aus.', 400)
  if (file.size > maxFileSize) throw new AppError('Dateien dürfen höchstens 4 MB groß sein.', 413)
  const extension = extname(file.originalname).toLowerCase()
  if (allowedTypes[extension] !== file.mimetype || !hasExpectedSignature(file, extension)) {
    throw new AppError('Dieser Dateityp wird nicht unterstützt oder der Inhalt passt nicht zur Dateiendung.', 415)
  }
  if (assignmentId) {
    const assignments = await query<{ subject_id: string }>(
      'SELECT subject_id FROM assignments WHERE id = $1',
      [assignmentId],
    )
    if (!assignments[0] || assignments[0].subject_id !== subjectId) {
      throw new AppError('Die Datei muss derselben Aufgabe und demselben Fach zugeordnet sein.', 400)
    }
  }

  const storage = getStorage()
  const objectKey = `${randomUUID()}`
  await storage.upload(objectKey, file.buffer, { contentType: file.mimetype })

  try {
    const records = await query<StoredFile & Record<string, unknown>>(
      `INSERT INTO stored_files (subject_id, assignment_id, filename, content_type, size_bytes, object_key)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, subject_id, assignment_id, filename, content_type, size_bytes::int AS size_bytes, object_key, created_at`,
      [subjectId, assignmentId ?? null, file.originalname, file.mimetype, file.size, objectKey],
    )
    return publicMetadata(records[0] as StoredFile & Record<string, unknown>)
  } catch (error) {
    await storage.delete(objectKey)
    throw error
  }
}

export async function renameFile(id: string, filename: string) {
  return updateFileMetadata(id, { filename })
}

export async function updateFileMetadata(id: string, changes: { filename?: string; assignment_id?: string | null }) {
  const file = await findFile(id)
  if (changes.filename && allowedTypes[extname(changes.filename).toLowerCase()] !== file.content_type) {
    throw new AppError('Die Dateiendung muss zum ursprünglichen Dateityp passen.', 400)
  }
  if (changes.assignment_id) {
    const assignments = await query<{ subject_id: string }>(
      'SELECT subject_id FROM assignments WHERE id = $1',
      [changes.assignment_id],
    )
    if (!assignments[0] || assignments[0].subject_id !== file.subject_id) {
      throw new AppError('Die Datei muss derselben Aufgabe und demselben Fach zugeordnet sein.', 400)
    }
  }
  const fields = Object.entries(changes).filter(([, value]) => value !== undefined)
  const assignments = fields.map(([key], index) => `${key === 'filename' ? 'filename' : 'assignment_id'} = $${index + 1}`)
  const values = fields.map(([, value]) => value)
  assignments.push('updated_at = NOW()')
  values.push(id)
  const records = await query<StoredFile & Record<string, unknown>>(
    `UPDATE stored_files SET ${assignments.join(', ')} WHERE id = $${values.length}
      RETURNING id, subject_id, assignment_id, filename, content_type, size_bytes::int AS size_bytes, created_at`,
    values,
  )
  return publicMetadata(records[0] as StoredFile & Record<string, unknown>)
}

export async function downloadFile(id: string) {
  const file = await findFile(id)
  const storage = getStorage()
  const url = await storage.url(file.object_key, {
    expiresIn: 60,
    responseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
  })
  return { url }
}

export async function previewFile(id: string) {
  const file = await findFile(id)
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.content_type)) {
    throw new AppError('Für diesen Dateityp ist keine Vorschau verfügbar.', 415)
  }
  const storage = getStorage()
  const url = await storage.url(file.object_key, {
    expiresIn: 300,
    responseContentDisposition: 'inline',
  })
  return { url, content_type: file.content_type }
}

export async function deleteFile(id: string) {
  const file = await findFile(id)
  const storage = getStorage()
  await storage.delete(file.object_key)
  await query(
    `UPDATE presentations p
      SET slides = (
        SELECT jsonb_agg(
          CASE WHEN item.slide->>'image_file_id' = $1
            THEN jsonb_set(item.slide, '{image_file_id}', 'null'::jsonb)
            ELSE item.slide
          END ORDER BY item.ordinality
        )
        FROM jsonb_array_elements(p.slides) WITH ORDINALITY AS item(slide, ordinality)
      ), updated_at = NOW()
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.slides) AS item(slide)
        WHERE item.slide->>'image_file_id' = $1
      )`,
    [id],
  )
  await query('DELETE FROM stored_files WHERE id = $1', [id])
}
