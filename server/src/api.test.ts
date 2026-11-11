import 'dotenv/config'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import { app } from './app.js'

let server: ReturnType<typeof app.listen>
let baseUrl: string

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

test('reports missing Neon configuration explicitly', { skip: Boolean(process.env.DATABASE_URL) }, async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /DATABASE_URL/)
})

test('persists and isolates all shared-workspace resources', { skip: !process.env.DATABASE_URL }, async () => {
  const subjectResponse = await fetch(`${baseUrl}/api/subjects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `API test ${crypto.randomUUID()}`, description: '', color: '#7568D9' }),
  })
  assert.equal(subjectResponse.status, 201)
  const subject = (await subjectResponse.json()).data as { id: string }

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

    const blockedDelete = await json(`/subjects/${subject.id}`, 'DELETE')
    assert.equal(blockedDelete.status, 409)

    for (const record of createdIds) {
      const response = await json(`${record.path}/${record.id}`, 'DELETE')
      assert.equal(response.status, 204)
    }
  } finally {
    for (const record of createdIds) await json(`${record.path}/${record.id}`, 'DELETE')
    await json(`/subjects/${subject.id}`, 'DELETE')
  }
})

const storageConfigured = Boolean(
  process.env.DATABASE_URL && process.env.S3_ENDPOINT && process.env.S3_REGION
  && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
)

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
    assert.match((await download.json()).url, /^https?:\/\//)

    const deleted = await fetch(`${baseUrl}/api/files/${fileId}`, { method: 'DELETE' })
    assert.equal(deleted.status, 204)
    fileId = ''
  } finally {
    if (fileId) await fetch(`${baseUrl}/api/files/${fileId}`, { method: 'DELETE' })
    await fetch(`${baseUrl}/api/subjects/${subject.id}`, { method: 'DELETE' })
  }
})
