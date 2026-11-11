import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import dotenv from 'dotenv'

dotenv.config({ quiet: true })
dotenv.config({ path: '../.env.local', quiet: true })

const { app } = await import('./app.js')
const { query } = await import('./database/connection.js')

let server: ReturnType<typeof app.listen>
let baseUrl: string
const storageConfigured = Boolean(
  process.env.DATABASE_URL && process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_REGION
  && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
)

before(async () => {
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('rejects invalid resource input before database access', async () => {
  const response = await fetch(`${baseUrl}/api/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '', subject_id: 'not-a-uuid' }),
  })
  assert.equal(response.status, 400)
  assert.equal(typeof (await response.json()).error, 'string')
})

test('rejects unsupported uploads with a client error', async () => {
  const body = new FormData()
  body.append('subject_id', '65cbe0ac-55fa-4dfb-9344-1ff4f22b9453')
  body.append('file', new Blob(['not an allowed file type'], { type: 'application/x-unknown' }), 'payload.bin')
  const response = await fetch(`${baseUrl}/api/files`, { method: 'POST', body })
  assert.equal(response.status, 415)
})

test('rejects file data that does not match an allowed type', async () => {
  const body = new FormData()
  body.append('subject_id', '65cbe0ac-55fa-4dfb-9344-1ff4f22b9453')
  body.append('file', new Blob([new Uint8Array([0, 1, 2])], { type: 'text/plain' }), 'notes.txt')
  const response = await fetch(`${baseUrl}/api/files`, { method: 'POST', body })
  assert.equal(response.status, 415)
})

test('returns a consistent not-found response', async () => {
  const response = await fetch(`${baseUrl}/api/unknown`)
  assert.equal(response.status, 404)
  assert.equal((await response.json()).error, 'Diese API-Route wurde nicht gefunden.')
})

test('allows CORS preflight from the production frontend origin', async () => {
  const response = await fetch(`${baseUrl}/api/assignments`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://schulplan.vercel.app',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://schulplan.vercel.app')
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /Content-Type/i)
})

test('does not grant CORS access to an untrusted browser origin', async () => {
  const response = await fetch(`${baseUrl}/api/assignments`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://untrusted.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('exports the Express app as the Vercel serverless entrypoint', async () => {
  const original = process.env.VERCEL
  process.env.VERCEL = '1'
  try {
    const entrypoint = await import('./index.js')
    assert.equal(entrypoint.default, app)
  } finally {
    if (original === undefined) delete process.env.VERCEL
    else process.env.VERCEL = original
  }
})

test('reports missing Neon configuration explicitly', { skip: Boolean(process.env.DATABASE_URL) }, async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /DATABASE_URL/)
})

test('reports missing Neon Object Storage configuration explicitly', async () => {
  const keys = ['AWS_ENDPOINT_URL_S3', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] as const
  const previous = new Map(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  try {
    const body = new FormData()
    body.append('subject_id', '65cbe0ac-55fa-4dfb-9344-1ff4f22b9453')
    body.append('assignment_id', '')
    body.append('file', new Blob(['school notes'], { type: 'text/plain' }), 'notes.txt')
    const response = await fetch(`${baseUrl}/api/files`, { method: 'POST', body })
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /Neon Object Storage/)
  } finally {
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('rejects uploads larger than the serverless-safe file limit', async () => {
  const body = new FormData()
  body.append('subject_id', '65cbe0ac-55fa-4dfb-9344-1ff4f22b9453')
  body.append('file', new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'text/plain' }), 'large.txt')
  const response = await fetch(`${baseUrl}/api/files`, { method: 'POST', body })
  assert.equal(response.status, 413)
  assert.match((await response.json()).error, /4 MB/)
})

test('persists and isolates all shared-workspace resources', { skip: !process.env.DATABASE_URL }, async () => {
  const healthResponse = await fetch(`${baseUrl}/api/health`)
  assert.equal(healthResponse.status, 200)
  assert.deepEqual(await healthResponse.json(), { status: 'ok' })

  const subjectResponse = await fetch(`${baseUrl}/api/subjects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `API test ${crypto.randomUUID()}`, description: '', color: '#7568D9' }),
  })
  assert.equal(subjectResponse.status, 201)
  const subject = (await subjectResponse.json()).data as { id: string }
  const listedSubjects = await fetch(`${baseUrl}/api/subjects`)
  assert.ok(((await listedSubjects.json()).data as Array<{ id: string }>).some((item) => item.id === subject.id))

  const json = (url: string, method: string, data?: object) => fetch(`${baseUrl}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  const assignment = { subject_id: subject.id, title: 'API test assignment', description: 'Initial', due_date: '2099-12-30', priority: 'medium', completed: false }
  const presentation = {
    subject_id: subject.id,
    title: 'API test presentation',
    description: '',
    presentation_date: '2099-12-30',
    prep_status: 'not_started',
    notes: '',
    slides: [{ title: 'Erste Folie', content: 'Gespeicherter Folieninhalt', image_file_id: null }],
  }
  const note = { subject_id: subject.id, title: 'API test note', content: 'Initial note' }
  const createdIds: Array<{ path: string; id: string }> = []
  try {
    const updatedSubject = await json(`/subjects/${subject.id}`, 'PUT', {
      name: `API test updated ${crypto.randomUUID()}`, description: 'Updated', color: '#7568D9',
    })
    assert.equal(updatedSubject.status, 200)

    for (const [path, record] of [['/assignments', assignment], ['/presentations', presentation], ['/notes', note]] as const) {
      const createdResponse = await json(path, 'POST', record)
      assert.equal(createdResponse.status, 201)
      const created = (await createdResponse.json()).data as { id: string }
      createdIds.push({ path, id: created.id })
      const updatedResponse = await json(`${path}/${created.id}`, 'PUT', { ...record, title: `${record.title} updated` })
      assert.equal(updatedResponse.status, 200)
      const listResponse = await json(path, 'GET')
      assert.ok(((await listResponse.json()).data as Array<{ id: string }>).some((item) => item.id === created.id))
      const detailResponse = await json(`${path}/${created.id}`, 'GET')
      assert.equal(detailResponse.status, 200)
      const details = (await detailResponse.json()).data as { id: string; title: string; slides?: Array<{ content: string }> }
      assert.equal(details.id, created.id)
      assert.equal(details.title, `${record.title} updated`)
      if (path === '/presentations') assert.equal(details.slides?.[0]?.content, 'Gespeicherter Folieninhalt')
    }

    const dashboardResponse = await json('/dashboard', 'GET')
    assert.equal(dashboardResponse.status, 200)
    const dashboard = (await dashboardResponse.json()).data as {
      assignments: Array<{ id: string }>
      presentations: Array<{ id: string }>
      notes: Array<{ id: string }>
      subjects: Array<{ id: string }>
    }
    assert.ok(dashboard.assignments.some((item) => item.id === createdIds[0]?.id))
    assert.ok(dashboard.presentations.some((item) => item.id === createdIds[1]?.id))
    assert.ok(dashboard.notes.some((item) => item.id === createdIds[2]?.id))
    assert.ok(dashboard.subjects.some((item) => item.id === subject.id))

    const blockedDelete = await json(`/subjects/${subject.id}`, 'DELETE')
    assert.equal(blockedDelete.status, 409)

    for (const record of createdIds) {
      const response = await json(`${record.path}/${record.id}`, 'DELETE')
      assert.equal(response.status, 204)
    }
    const deletedSubject = await json(`/subjects/${subject.id}`, 'DELETE')
    assert.equal(deletedSubject.status, 204)
  } finally {
    for (const record of createdIds) await json(`${record.path}/${record.id}`, 'DELETE')
    await json(`/subjects/${subject.id}`, 'DELETE')
  }
})

test('persists and returns file metadata from Neon without storing file bytes', { skip: !process.env.DATABASE_URL }, async () => {
  const subjectResponse = await fetch(`${baseUrl}/api/subjects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `File metadata test ${crypto.randomUUID()}`, description: '', color: '#7568D9' }),
  })
  assert.equal(subjectResponse.status, 201)
  const subject = (await subjectResponse.json()).data as { id: string }
  const objectKey = `api-test-${crypto.randomUUID()}`
  let fileId = ''
  try {
    const records = await query<{ id: string }>(
      `INSERT INTO stored_files (subject_id, filename, content_type, size_bytes, object_key)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [subject.id, 'metadata-test.txt', 'text/plain', 12, objectKey],
    )
    fileId = records[0]!.id

    const listing = await fetch(`${baseUrl}/api/files`)
    assert.equal(listing.status, 200)
    const files = (await listing.json()).data as Array<{
        id: string; subject_id: string; filename: string; size_bytes: number; subject_name: string; object_key?: string
      }>
      const metadata = files.find((item) => item.id === fileId)
      assert.ok(metadata)
      assert.equal(metadata.filename, 'metadata-test.txt')
      assert.equal(metadata.size_bytes, 12)
      assert.equal(metadata.subject_id, subject.id)
      assert.equal(typeof metadata.subject_name, 'string')
      assert.equal(metadata.object_key, undefined)
  } finally {
    if (fileId) await query('DELETE FROM stored_files WHERE id = $1', [fileId])
    await fetch(`${baseUrl}/api/subjects/${subject.id}`, { method: 'DELETE' })
  }
})

test('uploads, lists, downloads, and deletes files with configured storage', { skip: !storageConfigured }, async () => {
  const subjectResponse = await fetch(`${baseUrl}/api/subjects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `File test ${crypto.randomUUID()}`, description: '', color: '#7568D9' }),
  })
  assert.equal(subjectResponse.status, 201)
  const subject = (await subjectResponse.json()).data as { id: string }
  let fileId = ''
  let previewFileId = ''
  let imageFileId = ''
  let imagePresentationId = ''
  let assignmentId = ''
  try {
    const assignmentResponse = await fetch(`${baseUrl}/api/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: subject.id,
        title: 'File attachment integration',
        description: '',
        due_date: '2099-12-30',
        priority: 'medium',
        completed: false,
      }),
    })
    assert.equal(assignmentResponse.status, 201)
    assignmentId = ((await assignmentResponse.json()).data as { id: string }).id

    const body = new FormData()
    body.append('subject_id', subject.id)
    body.append('assignment_id', assignmentId)
    body.append('file', new Blob(['school notes'], { type: 'text/plain' }), 'notes.txt')
    const uploaded = await fetch(`${baseUrl}/api/files`, { method: 'POST', body })
    assert.equal(uploaded.status, 201)
    const file = (await uploaded.json()).data as { id: string; filename: string; assignment_id: string }
    fileId = file.id
    assert.equal(file.filename, 'notes.txt')
    assert.equal(file.assignment_id, assignmentId)

    const metadataResponse = await fetch(`${baseUrl}/api/files/${fileId}`)
    assert.equal(metadataResponse.status, 200)
    const metadata = (await metadataResponse.json()).data as { filename: string; object_key?: string }
    assert.equal(metadata.filename, 'notes.txt')
    assert.equal(metadata.object_key, undefined)

    const contentResponse = await fetch(`${baseUrl}/api/files/${fileId}/content`)
    assert.equal(contentResponse.status, 200)
    assert.equal(contentResponse.headers.get('content-type'), 'text/plain')
    assert.equal(await contentResponse.text(), 'school notes')

    const attachmentListing = await fetch(`${baseUrl}/api/files?assignment_id=${assignmentId}`)
    assert.equal(attachmentListing.status, 200)
    assert.ok(((await attachmentListing.json()).data as Array<{ id: string }>).some((item) => item.id === fileId))

    const unsupportedPreview = await fetch(`${baseUrl}/api/files/${fileId}/preview`)
    assert.equal(unsupportedPreview.status, 415)

    const renamed = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'notes-renamed.txt' }),
    })
    assert.equal(renamed.status, 200)
    assert.equal(((await renamed.json()).data as { filename: string }).filename, 'notes-renamed.txt')

    const invalidRename = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'notes-renamed.pdf' }),
    })
    assert.equal(invalidRename.status, 400)

    const listing = await fetch(`${baseUrl}/api/files`)
    assert.equal(listing.status, 200)
    assert.ok(((await listing.json()).data as Array<{ id: string }>).some((item) => item.id === fileId))

    const download = await fetch(`${baseUrl}/api/files/${fileId}/download`)
    assert.equal(download.status, 200)
    const { url } = await download.json() as { url: string }
    assert.match(url, /^https?:\/\//)
    const downloaded = await fetch(url)
    assert.equal(downloaded.status, 200)
    assert.equal(await downloaded.text(), 'school notes')

    const pdfBody = new FormData()
    pdfBody.append('subject_id', subject.id)
    pdfBody.append('file', new Blob(['%PDF-1.4\nSchulplan preview test'], { type: 'application/pdf' }), 'preview.pdf')
    const pdfUpload = await fetch(`${baseUrl}/api/files`, { method: 'POST', body: pdfBody })
    assert.equal(pdfUpload.status, 201)
    previewFileId = ((await pdfUpload.json()).data as { id: string }).id

    const previewResponse = await fetch(`${baseUrl}/api/files/${previewFileId}/preview`)
    assert.equal(previewResponse.status, 200)
    const preview = await previewResponse.json() as { url: string; content_type: string }
    assert.equal(preview.content_type, 'application/pdf')
    const previewDownload = await fetch(preview.url)
    assert.equal(previewDownload.status, 200)
    assert.match(await previewDownload.text(), /^%PDF-1\.4/)
    const pdfContent = await fetch(`${baseUrl}/api/files/${previewFileId}/content`)
    assert.equal(pdfContent.status, 200)
    assert.match(await pdfContent.text(), /^%PDF-1\.4/)

    const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/8xoAAAAASUVORK5CYII=', 'base64')
    const imageBody = new FormData()
    imageBody.append('subject_id', subject.id)
    imageBody.append('file', new Blob([new Uint8Array(imageBytes)], { type: 'image/png' }), 'pixel.png')
    const imageUpload = await fetch(`${baseUrl}/api/files`, { method: 'POST', body: imageBody })
    assert.equal(imageUpload.status, 201)
    imageFileId = ((await imageUpload.json()).data as { id: string }).id
    const imageContent = await fetch(`${baseUrl}/api/files/${imageFileId}/content`)
    assert.equal(imageContent.status, 200)
    assert.equal(imageContent.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await imageContent.arrayBuffer()), imageBytes)

    const imagePresentation = await fetch(`${baseUrl}/api/presentations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: subject.id,
        title: 'Image reference integration',
        description: '',
        presentation_date: '2099-12-30',
        prep_status: 'in_progress',
        notes: '',
        slides: [{ title: 'Bildfolie', content: '', image_file_id: imageFileId }],
      }),
    })
    assert.equal(imagePresentation.status, 201)
    imagePresentationId = ((await imagePresentation.json()).data as { id: string }).id

    const deletedPreview = await fetch(`${baseUrl}/api/files/${previewFileId}`, { method: 'DELETE' })
    assert.equal(deletedPreview.status, 204)
    previewFileId = ''
    const deletedImage = await fetch(`${baseUrl}/api/files/${imageFileId}`, { method: 'DELETE' })
    assert.equal(deletedImage.status, 204)
    imageFileId = ''
    const presentationDetails = await fetch(`${baseUrl}/api/presentations/${imagePresentationId}`)
    assert.equal(presentationDetails.status, 200)
    const presentationData = (await presentationDetails.json()).data as { slides: Array<{ image_file_id: string | null }> }
    assert.equal(presentationData.slides[0]?.image_file_id, null)
    const deletedPresentation = await fetch(`${baseUrl}/api/presentations/${imagePresentationId}`, { method: 'DELETE' })
    assert.equal(deletedPresentation.status, 204)
    imagePresentationId = ''

    const deleted = await fetch(`${baseUrl}/api/files/${fileId}`, { method: 'DELETE' })
    assert.equal(deleted.status, 204)
    fileId = ''

    const invalidSubjectBody = new FormData()
    invalidSubjectBody.append('subject_id', crypto.randomUUID())
    invalidSubjectBody.append('file', new Blob(['school notes'], { type: 'text/plain' }), 'orphan-check.txt')
    const failedUpload = await fetch(`${baseUrl}/api/files`, { method: 'POST', body: invalidSubjectBody })
    assert.equal(failedUpload.status, 409)
    assert.match((await failedUpload.json()).error, /Fach fehlt/)
  } finally {
    if (fileId) await fetch(`${baseUrl}/api/files/${fileId}`, { method: 'DELETE' })
    if (previewFileId) await fetch(`${baseUrl}/api/files/${previewFileId}`, { method: 'DELETE' })
    if (imageFileId) await fetch(`${baseUrl}/api/files/${imageFileId}`, { method: 'DELETE' })
    if (imagePresentationId) await fetch(`${baseUrl}/api/presentations/${imagePresentationId}`, { method: 'DELETE' })
    if (assignmentId) await fetch(`${baseUrl}/api/assignments/${assignmentId}`, { method: 'DELETE' })
    await fetch(`${baseUrl}/api/subjects/${subject.id}`, { method: 'DELETE' })
  }
})
