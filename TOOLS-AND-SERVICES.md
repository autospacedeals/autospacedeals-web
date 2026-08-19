# Drive — Tools & Services

A single reference for every external tool/service this project depends on. Update this file whenever a new one gets added.

## Hosting & deployment

- **Vercel** — hosts and deploys the site (idriveus.com). Auto-deploys on push to `main` on GitHub. Environment variables (API keys below) are configured in Vercel's project settings, separate from the local `.env.local` file.

## Source control

- **GitHub** — `github.com/autospacedeals/autospacedeals-web` (repo not yet renamed — see domain switch guidance). Vercel deploys from the `main` branch.

## Database, auth & storage

- **Supabase** — Postgres database (deals, brokers, submissions tables), user auth (broker/admin login), and file storage (broker-uploaded Excel files and screenshots). Console: supabase.com/dashboard. Credentials: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## AI

- **Anthropic API (Claude)** — powers the AI inventory parsing (screenshots, free-text paste, spreadsheet rows) and the incentive-suggestion feature in the broker dashboard. Console: console.anthropic.com — this is also where you buy/monitor API credits. Credential: `ANTHROPIC_API_KEY`.

## Vehicle photos

- **CarsXE** — vehicle image lookup API, used as the fallback stock photo when a broker doesn't upload their own. Console: carsxe.com. Credential: `CARSXE_API_KEY`.

## Recurring Google Sheet sync

A broker can opt a linked Google Sheet into recurring auto-sync (checked every ~30 minutes), which adds new cars it finds and soft-removes ones that disappear from the sheet. See `lib/sheet-sync.ts` and `app/api/cron/sync-sheets/route.ts`.

- **Trigger**: a GitHub Actions workflow (`.github/workflows/sync-broker-sheets.yml`), not Vercel Cron — Vercel's free Hobby plan only allows once-a-day cron schedules, so GitHub's free scheduler is used instead regardless of which Vercel plan you're on.
- **Setup required** (one-time): generate a random secret string, then add it in two places with the *same* value:
  1. Vercel → Project → Settings → Environment Variables → add `CRON_SYNC_SECRET` (Production).
  2. GitHub repo → Settings → Secrets and variables → Actions → New repository secret → name it `CRON_SYNC_SECRET`.
  Without this secret configured in both places, the endpoint refuses every request (including the scheduled ones) rather than running unauthenticated.
- The workflow calls `https://www.idriveus.com/api/cron/sync-sheets` — update that URL in the workflow file if the domain ever changes.

## Domain

- **idriveus.com** — registrar: *(not sure — let me know where this is registered so I can fill this in)*. Formerly deployed at autospacedeals.com.

## Domain switch checklist (autospacedeals.com → idriveus.com)

Codebase side is done (`SITE_URL`, `SITE_NAME`, all on-page copy, `package.json`, schema comments). What's left happens outside the repo:

1. **Buy/confirm idriveus.com** is registered and you control DNS for it.
2. **Vercel → Project → Settings → Domains** — add `idriveus.com` and `www.idriveus.com`. Vercel will show DNS records (usually an `A` record to `76.76.21.21` and a `CNAME` for `www`) — add those at your registrar/DNS provider.
3. **Vercel → Project → Settings → Environment Variables** — add/update `NEXT_PUBLIC_SITE_URL=https://www.idriveus.com` for the Production environment, then redeploy (env var changes don't apply until the next deploy).
4. **Keep autospacedeals.com pointed at Vercel too**, but set it to redirect to idriveus.com (Vercel → Domains → set autospacedeals.com's redirect target to idriveus.com, 308 permanent). This preserves any existing SEO/links instead of just letting the old domain 404.
5. **Google Search Console** — add idriveus.com as a new property, submit the sitemap (`idriveus.com/sitemap.xml`), and use the "Change of Address" tool if autospacedeals.com was already verified there.
6. Optional cleanup once the above is live: rename the GitHub repo (`autospacedeals-web` → `idriveus-web`) and update the remote URL locally; update the "GitHub" line above.

## Where credentials live

- **Locally**: `.env.local` in the project root (not committed to GitHub — it's in `.gitignore`).
- **In production**: Vercel project → Settings → Environment Variables. Any key added/changed locally also needs to be added there and redeployed.

## Notes on what might need attention over time

- Anthropic API credits can run low — check usage/balance at console.anthropic.com.
- CarsXE likely has a monthly request cap depending on the plan — worth checking if photo lookups start silently failing.
- Supabase and Vercel are both free-tier-friendly at this scale; keep an eye on usage as listing/broker volume grows.
