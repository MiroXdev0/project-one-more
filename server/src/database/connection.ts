import { neon } from '@neondatabase/serverless'

const connectionString = process.env.DATABASE_URL
const sql = connectionString ? neon(connectionString) : null

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export async function query<Row extends Record<string, unknown> = Record<string, unknown>>(
  statement: string,
  parameters: unknown[] = [],
): Promise<Row[]> {
  if (!sql) {
    throw new AppError('Die Datenbank ist nicht konfiguriert. Hinterlege DATABASE_URL mit einer Neon-Verbindungszeichenfolge.', 503)
  }

  try {
    return await sql.query(statement, parameters) as Row[]
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      throw new AppError('Das Fach fehlt oder enthält noch verknüpfte Inhalte. Ordne diese neu zu oder lösche sie, bevor du das Fach entfernst.', 409)
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new AppError('Ein Eintrag mit diesen Angaben existiert bereits.', 409)
    }
    throw error
  }
}
