import 'dotenv/config'
import { app } from './app.js'

export default app

if (process.env.VERCEL !== '1') {
  const port = Number(process.env.PORT ?? 3000)
  app.listen(port, () => {
    console.log(`School Organizer API listening on port ${port}`)
  })
}
