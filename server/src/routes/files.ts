import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { AppError } from '../database/connection.js'
import { deleteFile, downloadFile, listFiles, previewFile, renameFile, uploadFile } from '../services/files.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024,
    files: 1,
    fields: 1,
    parts: 2,
    fieldNameSize: 100,
    fieldSize: 100,
  },
})

export const filesRouter = Router()

filesRouter.get('/', async (_request, response) => {
  response.json({ data: await listFiles() })
})

filesRouter.post('/', upload.single('file'), async (request, response) => {
  const subjectId = z.uuid().safeParse(request.body.subject_id)
  if (!subjectId.success) throw new AppError('Bitte wähle ein gültiges Fach aus.', 400)
  response.status(201).json({ data: await uploadFile(request.file, subjectId.data) })
})

filesRouter.patch('/:id', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  const parsed = z.object({
    filename: z.string()
      .trim()
      .min(1, 'Bitte gib einen Dateinamen ein.')
      .max(160, 'Der Dateiname darf höchstens 160 Zeichen lang sein.')
      .refine((filename) => !/[\\/\u0000-\u001f\u007f]/.test(filename), 'Der Dateiname darf keine Pfade oder Steuerzeichen enthalten.'),
  }).strict().safeParse(request.body)
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Bitte prüfe den Dateinamen.', 400)
  response.json({ data: await renameFile(request.params.id!, parsed.data.filename) })
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
