import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../database/connection.js'
import { createResource, deleteResource, listResource, updateResource } from '../services/resources.js'
import {
  assignmentSchema,
  noteSchema,
  presentationSchema,
  subjectSchema,
  type ResourceName,
} from '../validation/schemas.js'

const schemas = {
  subjects: subjectSchema,
  assignments: assignmentSchema,
  presentations: presentationSchema,
  notes: noteSchema,
} satisfies Record<ResourceName, z.ZodType>

export const resourceRouter = Router()

for (const resource of Object.keys(schemas) as ResourceName[]) {
  const schema = schemas[resource]
  const path = `/${resource}`

  resourceRouter.get(path, async (_request, response) => {
    response.json({ data: await listResource(resource) })
  })

  resourceRouter.post(path, async (request, response) => {
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.', 400)
    response.status(201).json({ data: await createResource(resource, parsed.data) })
  })

  resourceRouter.put(`${path}/:id`, async (request, response) => {
    if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Eintrags-ID ist ungültig.', 400)
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.', 400)
    response.json({ data: await updateResource(resource, request.params.id!, parsed.data) })
  })

  resourceRouter.delete(`${path}/:id`, async (request, response) => {
    if (!z.uuid().safeParse(request.params.id).success) throw new AppError('Die Eintrags-ID ist ungültig.', 400)
    await deleteResource(resource, request.params.id!)
    response.status(204).end()
  })
}
