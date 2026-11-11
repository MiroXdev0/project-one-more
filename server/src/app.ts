import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import multer from 'multer'
import { AppError, query } from './database/connection.js'
import { filesRouter } from './routes/files.js'
import { resourceRouter } from './routes/resources.js'
import { getDashboard } from './services/resources.js'

export const app = express()

const configuredOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : process.env.VERCEL === '1'
    ? ['https://schulplan.vercel.app']
    : ['https://schulplan.vercel.app', 'http://localhost:5173']
const allowedOrigins = configuredOrigins.map((value) => {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
    throw new Error(`CLIENT_ORIGIN must contain exact HTTP(S) origins without paths: ${value}`)
  }
  return url.origin
})

app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', async (_request, response) => {
  await query('SELECT 1')
  response.json({ status: 'ok' })
})

app.get('/api/dashboard', async (_request, response) => {
  response.json({ data: await getDashboard() })
})

app.use('/api', resourceRouter)
app.use('/api/files', filesRouter)

app.use((_request, _response, next) => next(new AppError('Diese API-Route wurde nicht gefunden.', 404)))

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({ error: error.message })
    return
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Dateien dürfen höchstens 4 MB groß sein.' : 'Der Upload konnte nicht verarbeitet werden.'
    response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message })
    return
  }
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'Der Anfrageinhalt enthält ungültiges JSON.' })
    return
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    response.status(413).json({ error: 'Der Anfrageinhalt ist zu groß.' })
    return
  }
  console.error('Unhandled API error:', error)
  response.status(500).json({ error: 'Ein unerwarteter Serverfehler ist aufgetreten.' })
}

app.use(errorHandler)
