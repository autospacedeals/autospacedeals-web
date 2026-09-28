# Drive (idriveus.com)

A California car-lease marketplace: dealers and brokers post lease deals, and shoppers browse, filter, compare and contact the seller directly.

- **Stack:** Next.js 16 (App Router) + Tailwind CSS v4, Supabase (Postgres, Auth, Storage), deployed on Vercel. Pushing to `main` deploys to production.
- **Services and credentials:** see [`TOOLS-AND-SERVICES.md`](TOOLS-AND-SERVICES.md) for every external service, the environment variables each one needs, and the scheduled jobs.
- **Database changes:** `supabase/migrations/*.sql`, run by hand in order in the Supabase SQL editor.

## Local development

```bash
npm ci
npm run dev
```

Then open http://localhost:3000. You need a `.env.local` with the Supabase keys (and optionally the other keys listed in `TOOLS-AND-SERVICES.md`).

Before committing: `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
