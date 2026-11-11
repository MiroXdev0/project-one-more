import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { AppError } from '../database/connection.js'
import { deleteFile, downloadFile, getFileContent, getFileMetadata, listFiles, previewFile, updateFileMetadata, uploadFile } from '../services/files.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
    fieldNameSize: 100,
    fieldSize: 100,
  },
})

export const filesRouter = Router()

filesRouter.get('/', async (_request, response) => {
  const assignmentId = _request.query.assignment_id
  if (assignmentId !== undefined && (typeof assignmentId !== 'string' || !z.uuid().safeParse(assignmentId).success)) {
    throw new AppError('Die Aufgaben-ID ist ungültig.', 400)
  }
  response.json({ data: await listFiles(typeof assignmentId === 'string' ? assignmentId : undefined) })
})

filesRouter.post('/', upload.single('file'), async (request, response) => {
  const subjectId = z.uuid().safeParse(request.body.subject_id)
  if (!subjectId.success) throw new AppError('Bitte wähle ein gültiges Fach aus.', 400)
  const assignmentId = request.body.assignment_id === undefined || request.body.assignment_id === ''
    ? undefined
    : z.uuid().safeParse(request.body.assignment_id)
  if (assignmentId && assignmentId.success === false) throw new AppError('Die Aufgaben-ID ist ungültig.', 400)
  response.status(201).json({ data: await uploadFile(request.file, subjectId.data, assignmentId?.data) })
})

filesRouter.patch('/:id', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  const parsed = z.object({
    filename: z.string()
      .trim()
      .min(1, 'Bitte gib einen Dateinamen ein.')
      .max(160, 'Der Dateiname darf höchstens 160 Zeichen lang sein.')
      .refine((filename) => !/[\\/\u0000-\u001f\u007f]/.test(filename), 'Der Dateiname darf keine Pfade oder Steuerzeichen enthalten.')
      .optional(),
    assignment_id: z.uuid().nullable().optional(),
  }).strict().refine((data) => data.filename !== undefined || data.assignment_id !== undefined).safeParse(request.body)
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Bitte prüfe den Dateinamen.', 400)
  const changes: { filename?: string; assignment_id?: string | null } = {}
  if (parsed.data.filename !== undefined) changes.filename = parsed.data.filename
  if (parsed.data.assignment_id !== undefined) changes.assignment_id = parsed.data.assignment_id
  response.json({ data: await updateFileMetadata(request.params.id!, changes) })
})

filesRouter.get('/:id', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  response.json({ data: await getFileMetadata(request.params.id!) })
})

filesRouter.get('/:id/content', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  const file = await getFileContent(request.params.id!)
  response.set({
    'Content-Type': file.content_type,
    'Content-Length': String(file.bytes.byteLength),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }).send(file.bytes)
})

filesRouter.get('/:id/preview', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  response.json(await previewFile(request.params.id!))
})

filesRouter.get('/:id/download', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  response.json(await downloadFile(request.params.id!))
})

filesRouter.delete('/:id', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  await deleteFile(request.params.id!)
  response.status(204).end()
})
