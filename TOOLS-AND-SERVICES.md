# AutoSpace Deals — Tools & Services

A single reference for every external tool/service this project depends on. Update this file whenever a new one gets added.

## Hosting & deployment

- **Vercel** — hosts and deploys the site (autospacedeals.com). Auto-deploys on push to `main` on GitHub. Environment variables (API keys below) are configured in Vercel's project settings, separate from the local `.env.local` file.

## Source control

- **GitHub** — `github.com/autospacedeals/autospacedeals-web`. Vercel deploys from the `main` branch.

## Database, auth & storage

- **Supabase** — Postgres database (deals, brokers, submissions tables), user auth (broker/admin login), and file storage (broker-uploaded Excel files and screenshots). Console: supabase.com/dashboard. Credentials: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## AI

- **Anthropic API (Claude)** — powers the AI inventory parsing (screenshots, free-text paste, spreadsheet rows) and the incentive-suggestion feature in the broker dashboard. Console: console.anthropic.com — this is also where you buy/monitor API credits. Credential: `ANTHROPIC_API_KEY`.

## Vehicle photos

- **CarsXE** — vehicle image lookup API, used as the fallback stock photo when a broker doesn't upload their own. Console: carsxe.com. Credential: `CARSXE_API_KEY`.

## Domain

- **autospacedeals.com** — registrar: *(not sure — let me know where this is registered so I can fill this in)*.

## Where credentials live

- **Locally**: `.env.local` in the project root (not committed to GitHub — it's in `.gitignore`).
- **In production**: Vercel project → Settings → Environment Variables. Any key added/changed locally also needs to be added there and redeployed.

## Notes on what might need attention over time

- Anthropic API credits can run low — check usage/balance at console.anthropic.com.
- CarsXE likely has a monthly request cap depending on the plan — worth checking if photo lookups start silently failing.
- Supabase and Vercel are both free-tier-friendly at this scale; keep an eye on usage as listing/broker volume grows.
