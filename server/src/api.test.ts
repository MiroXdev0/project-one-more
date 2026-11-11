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
  const presentation = { subject_id: subject.id, title: 'API test presentation', description: '', presentation_date: '2099-12-30', prep_status: 'not_started', notes: '' }
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
      id: string; subject_id: string; filename: string; size_bytes: number; subject_name: string
    }>
    const metadata = files.find((item) => item.id === fileId)
    assert.ok(metadata)
    assert.equal(metadata.filename, 'metadata-test.txt')
    assert.equal(metadata.size_bytes, 12)
    assert.equal(metadata.subject_id, subject.id)
    assert.equal(typeof metadata.subject_name, 'string')
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
  try {
    const body = new FormData()
    body.append('subject_id', subject.id)
    body.append('file', new Blob(['school notes'], { type: 'text/plain' }), 'notes.txt')
    const uploaded = await fetch(`${baseUrl}/api/files`, { method: 'POST', body })
    assert.equal(uploaded.status, 201)
    const file = (await uploaded.json()).data as { id: string; filename: string }
    fileId = file.id
    assert.equal(file.filename, 'notes.txt')

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
    await fetch(`${baseUrl}/api/subjects/${subject.id}`, { method: 'DELETE' })
  }
})
