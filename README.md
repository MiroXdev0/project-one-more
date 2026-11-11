# Lernzeit — school organizer

Lernzeit is a responsive, shared-workspace organizer for school assignments, presentations, notes, subjects, and files. It uses React, TypeScript, Vite, Express, and Neon Postgres. The workspace is intentionally shared without accounts, as selected for this project; anyone who can reach the API can read and change its data. Deploy it only where that shared access is intended.

## Run locally

Requirements: Node.js 20.19+ and npm.

1. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` to a Neon Postgres connection string.
2. From the repository root, install each app's dependencies if needed:

   ```sh
   npm --prefix server install
   npm --prefix client install
   ```

3. Apply the versioned schema migration (safe to rerun):

   ```sh
   npm --prefix server run migrate
   ```

4. Start the API and frontend in separate terminals:

   ```sh
   npm --prefix server run dev
   npm --prefix client run dev
   ```

Vite proxies `/api` to `http://localhost:3000`. Set `API_PROXY_TARGET` if your local API uses another address. For a separately hosted frontend, set `VITE_API_URL` to the API's origin in `client/.env`.

The app starts with empty states instead of sample data. Create a subject first; assignments, presentations, notes, and files are associated with a subject.

## Configuration

| Variable | App | Required | Purpose |
|---|---|---:|---|
| `DATABASE_URL` | server | Yes | Neon Postgres connection string |
| `PORT` | server | No | API port (default `3000`) |
| `CLIENT_ORIGIN` | server | No | Allowed browser origin for CORS (default `http://localhost:5173`) |
| `S3_ENDPOINT` | server | For files | S3-compatible object-storage endpoint |
| `S3_REGION` | server | For files | Object-storage region |
| `S3_BUCKET` | server | For files | Private bucket name |
| `S3_ACCESS_KEY_ID` | server | For files | Bucket credentials |
| `S3_SECRET_ACCESS_KEY` | server | For files | Bucket credentials |
| `VITE_API_URL` | client | Separate deployment only | Public API origin; leave empty for same-origin hosting |

File uploads use S3-compatible object storage; binary contents are not stored in Postgres. Uploads are limited to 10 MB and checked against supported extensions, MIME types, and file signatures. Download links are short-lived. Configure the storage bucket as private and restrict its credentials to the app's required bucket operations. The API reports a clear configuration error until all storage variables are set.

## Database and API

`server/src/database/migrations/001_initial.sql` creates the normalized schema and indexes. `npm --prefix server run migrate` records applied migration versions in `schema_migrations`; the DDL is idempotent and existing records are not dropped. Subject foreign keys use `ON DELETE RESTRICT` so a subject with related work cannot be deleted accidentally.

The Express API validates payloads and returns `{ "error": "..." }` for failures:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Database health check |
| `GET` | `/api/dashboard` | Live summary, upcoming work, recent notes, and subjects |
| `GET`, `POST` | `/api/subjects` | List and create subjects |
| `PUT`, `DELETE` | `/api/subjects/:id` | Update or delete a subject |
| `GET`, `POST` | `/api/assignments` | List and create assignments |
| `PUT`, `DELETE` | `/api/assignments/:id` | Update or delete an assignment |
| `GET`, `POST` | `/api/presentations` | List and create presentations |
| `PUT`, `DELETE` | `/api/presentations/:id` | Update or delete a presentation |
| `GET`, `POST` | `/api/notes` | List and create notes |
| `PUT`, `DELETE` | `/api/notes/:id` | Update or delete a note |
| `GET`, `POST` | `/api/files` | List files or upload multipart field `file` with `subject_id` |
| `GET`, `DELETE` | `/api/files/:id/download`, `/api/files/:id` | Download or delete a stored file |

## Deployment

Deploy `client/` as a Vercel Vite project and `server/` as a separate Vercel Node project. The server includes a catch-all Express function in `server/api/[...path].ts`. Configure `DATABASE_URL` and `CLIENT_ORIGIN` in the server project's environment; configure the five S3 settings to enable uploads. Set the frontend's `VITE_API_URL` to the deployed server origin, or route both apps through a same-origin API proxy. Run the migration command once against the target Neon branch before opening the app.

Because this is a shared, unauthenticated workspace, CORS is not an access-control mechanism. Do not expose the API publicly if its data must be private or restricted to a particular group; choose an authenticated deployment before using it for sensitive student records.

## Checks

```sh
npm --prefix client run build
npm --prefix client run lint
npm --prefix server run build
npm --prefix server test
```

The API tests cover validation, unsupported uploads, and unknown routes without external credentials. Database CRUD integration tests run when `DATABASE_URL` is set and the migration has been applied. File upload/download against object storage requires the S3 settings and a configured bucket.
