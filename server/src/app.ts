import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import multer from 'multer'
import { AppError, query } from './database/connection.js'
import { filesRouter } from './routes/files.js'
import { resourceRouter } from './routes/resources.js'
import { getDashboard } from './services/resources.js'

export const app = express()

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
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
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Dateien dürfen höchstens 10 MB groß sein.' : 'Der Upload konnte nicht verarbeitet werden.'
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
