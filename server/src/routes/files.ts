import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { AppError } from '../database/connection.js'
import { deleteFile, downloadFile, listFiles, uploadFile } from '../services/files.js'

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

filesRouter.get('/:id/download', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  response.json(await downloadFile(request.params.id!))
})

filesRouter.delete('/:id', async (request, response) => {
  if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Datei-ID ist ungültig.', 400)
  await deleteFile(request.params.id!)
  response.status(204).end()
})
