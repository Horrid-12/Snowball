# Models Directory

Database schemas are managed via Supabase SQL migrations, not model files.

Migration SQL files live in `backend/*_migration.sql` and are applied via the Supabase SQL editor.

Runtime database access uses:
- `req.anonDb` — RLS-scoped Supabase client (user's JWT + anon key)
- `supabase` (service role) via `backend/db.js` — bypasses RLS

See `backend/db.js` for client setup and `backend/middleware/auth.js` for the `requireAuth` middleware.
