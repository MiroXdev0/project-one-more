import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { query } from './connection.js'

const migrations = ['001_initial.sql']

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  const applied = await query<{ version: string }>('SELECT version FROM schema_migrations')
  const appliedVersions = new Set(applied.map((row) => row.version))

  for (const migration of migrations) {
    if (appliedVersions.has(migration)) {
      console.log(`Skipping already applied migration ${migration}`)
      continue
    }

    const contents = await readFile(join(process.cwd(), 'src', 'database', 'migrations', migration), 'utf8')
    const statements = contents.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean)
    for (const statement of statements) await query(statement)
    await query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration])
    console.log(`Applied migration ${migration}`)
  }
}

migrate().catch((error: unknown) => {
  console.error('Database migration failed:', error)
  process.exitCode = 1
})
