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
    const code = error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
    if (code === '23503' || code === '23001') {
      throw new AppError('Das Fach fehlt oder enthält noch verknüpfte Inhalte. Ordne diese neu zu oder lösche sie, bevor du das Fach entfernst.', 409)
    }
    if (code === '23505') {
      throw new AppError('Ein Eintrag mit diesen Angaben existiert bereits.', 409)
    }
    if (['08000', '08001', '08003', '08006', '57P01', '57P03', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code)) {
      throw new AppError('Die Datenbank ist vorübergehend nicht erreichbar. Bitte versuche es erneut.', 503)
    }
    throw error
  }
}
