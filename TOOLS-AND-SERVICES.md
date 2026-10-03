# Drive — Tools & Services

A single reference for every external tool/service this project depends on. Update this file whenever a new one gets added.

## Hosting & deployment

- **Vercel** — hosts and deploys the site (idriveus.com). Auto-deploys on push to `main` on GitHub. Environment variables (API keys below) are configured in Vercel's project settings, separate from the local `.env.local` file.

## Source control

- **GitHub** — `github.com/autospacedeals/autospacedeals-web` (repo not yet renamed — see domain switch guidance). Vercel deploys from the `main` branch.

## Database, auth & storage

- **Supabase** — Postgres database (deals, brokers, submissions tables), user auth (broker/admin login), and file storage (broker-uploaded Excel files and screenshots). Console: supabase.com/dashboard. Credentials: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## AI

- **Anthropic API (Claude)** — powers the AI inventory parsing (screenshots, free-text paste, spreadsheet rows) and the incentive suggestions on the public lease calculator. Console: console.anthropic.com — this is also where you buy/monitor API credits. Credential: `ANTHROPIC_API_KEY`.

## Vehicle photos

- **CarsXE** — vehicle image lookup API, used as the fallback stock photo when a broker doesn't upload their own. Console: carsxe.com. Credential: `CARSXE_API_KEY`.

## Incentive data

- **MarketCheck** — OEM Incentive Search API, used only by the public lease calculator (`/calculator`) to look up current lease structures and named incentive programs. Listings don't use it: a listing's incentives come only from what the broker's own sheet/screenshot/text states (or what they type in). Sign up (free tier: 500 calls/mo) at developers.marketcheck.com/sign-up. Credential: `MARKETCHECK_API_KEY`. If this key isn't set, the calculator falls back to its built-in estimates — nothing breaks.

## Transactional email

- **Resend** — sends the site's own emails (the saved-search alert digests and the "Get matched with similar deals" emails — see "Saved-search alerts" and "Get matched emails" below). Called straight from `lib/email.ts` through Resend's REST API, so there's no extra npm package. Console: resend.com. Credentials: `RESEND_API_KEY` (required) and `RESEND_FROM_EMAIL` (optional — the "from" line, defaults to `Drive <alerts@idriveus.com>`; it must be an address on a domain verified in Resend). If `RESEND_API_KEY` isn't set, nothing breaks — the alert job just reports "email not configured" and sends nothing, and "Get matched" tells the shopper email isn't set up yet.
- **Setup required** (one-time):
  1. Create a Resend account and **verify idriveus.com** (Resend → Domains → Add domain). Resend shows a few DNS records (SPF/DKIM, usually `TXT` and `MX` records on a `send` subdomain) — add those at your DNS provider and wait for the domain to show as verified. Until it is, Resend refuses to send from `@idriveus.com`.
  2. Resend → API Keys → create a key with "Sending access".
  3. Vercel → Project → Settings → Environment Variables → add `RESEND_API_KEY` (and `RESEND_FROM_EMAIL` if you want a different sender), then redeploy.
- The free tier (3,000 emails/month, 100/day at the time of writing) is plenty to start; keep an eye on it as saved searches grow.

## Recurring Google Sheet sync

A broker can opt a linked Google Sheet into recurring auto-sync (checked every 30 minutes), which adds new cars it finds, updates repriced ones in place, and soft-removes ones that are deleted or crossed out on the sheet. See `lib/sheet-sync.ts`, `lib/google-sheet.ts` and `app/api/cron/sync-sheets/route.ts`.

- **Trigger**: Supabase's scheduler (pg_cron + pg_net), set up by `supabase/migrations/0019_schedule_cron_jobs.sql`. Not Vercel Cron (the free Hobby plan only allows once-a-day schedules) and no longer GitHub Actions (its free scheduler delayed and skipped runs — "every 30 minutes" was really every 3-6 hours). The GitHub workflows (`.github/workflows/sync-broker-sheets.yml`, `send-search-alerts.yml`) are kept as manual "Run workflow" buttons for testing.
- **Setup required** (one-time): a random secret string, stored with the *same* value in:
  1. Vercel → Project → Settings → Environment Variables → `CRON_SYNC_SECRET` (Production).
  2. Supabase Vault, as `cron_sync_secret` — see the header of `0019_schedule_cron_jobs.sql` for the one-line command, then run the rest of that file.
  3. (Only for the manual GitHub buttons) GitHub repo → Settings → Secrets and variables → Actions → `CRON_SYNC_SECRET`.
  Without a matching secret, the endpoint refuses every request (including the scheduled ones) rather than running unauthenticated.
- The scheduled jobs call `https://www.idriveus.com/api/cron/sync-sheets` and `/api/cron/search-alerts` — if the domain ever changes, update the URLs in `0019_schedule_cron_jobs.sql` and re-run it.

## Saved-search alerts

A signed-in customer can save their homepage filters ("Save this search", under the filters) and get one email per saved search when new matching deals are posted. They see and delete their saved searches on their dashboard (`/customer/dashboard#alerts`), and every alert email has a "Stop these alerts" link (`/alerts/unsubscribe?token=…`) that works without logging in. Only deals first published after the search was saved are included, and each deal is only ever emailed once per saved search. See `app/api/cron/search-alerts/route.ts` and `supabase/migrations/0017_saved_searches.sql` (run it in the Supabase SQL editor — until then the feature stays hidden).

- **Trigger**: Supabase's scheduler, hourly at :17 past — same setup as the sheet sync above (`0019_schedule_cron_jobs.sql`).
- **Setup required**: nothing new — it reuses the **same `CRON_SYNC_SECRET`** as the sheet sync (already in Vercel and in GitHub's Actions secrets), plus the Resend setup under "Transactional email" above. Without `RESEND_API_KEY` the job runs but skips sending.
- The scheduled job calls `https://www.idriveus.com/api/cron/search-alerts` (see the sheet-sync notes above for changing it). Links inside the emails use `NEXT_PUBLIC_SITE_URL`.

## Get matched emails

"Get matched with similar deals" on a deal page opens a small form that emails the shopper the similar deals shown under that listing (a one-time email, sent through Resend). Anyone signed in gets it at their account email without typing it; customers can also tick "Email me when new matching deals are posted", which saves an alert (a saved search named "Deals like …") on their dashboard. Signed-out visitors type an email address. See `app/deals/[slug]/actions.ts` and `supabase/migrations/0018_match_email_log.sql`.

- **Setup required**: run `0018_match_email_log.sql` in the Supabase SQL editor, plus the Resend setup under "Transactional email" above. Until 0018 is run, only signed-in customers can use it — signed-out visitors are told to log in or try later.
- **Limits**: at most 3 emails to the same address and 10 from the same IP address in any 24 hours, tracked in `match_email_log` (only the site's server can read it). The site deletes rows older than a week now and then; you can also clear the table by hand at any time.

## Messaging

Shoppers and brokers talk only through Drive: "Message seller" on a listing (shopper account required) starts a conversation per shopper + broker + listing; inboxes are at `/customer/messages`, `/broker/dashboard/messages`, and (read-only, everything) `/admin/messages`. New messages show up live (Supabase Realtime) and, if the recipient leaves "Email me when I get a new message" on (each dashboard), are emailed through Resend — at most one email per conversation until they've read it, or once an hour. Phone numbers and emails aren't shown anywhere public. See `lib/messages.ts`, `app/messages/actions.ts` and `supabase/migrations/0024_messaging.sql`.

- **Setup required**: run `0024_messaging.sql` in the Supabase SQL editor *before* deploying the messaging code (the site reads its new columns). It also enables Realtime for the `messages` table.
- **Records**: messages can't be edited or deleted by users; clear them by hand in Supabase only if you need to.

## Google sign-in ("Continue with Google")

Customers can sign in or sign up with their Google account (brokers still use email). The button on `/customer/login` and `/customer/signup` stays **hidden until `NEXT_PUBLIC_GOOGLE_SIGN_IN=true`** is set in Vercel. A first-time Google user is sent to `/customer/complete-profile` to add the zip code Google doesn't provide (that creates their `customers` row). If someone already has an email account with the same address, Supabase links Google to that same account. See `components/GoogleSignInButton.tsx` and `app/auth/callback/route.ts`.

**One-time setup:**
1. **Google Cloud** (console.cloud.google.com) → create a project (e.g. "Drive"). The same project can later hold the service account for private Google Sheets.
2. **APIs & Services → OAuth consent screen**: External, app name "Drive", support email, logo, app domain `idriveus.com`, privacy policy `https://www.idriveus.com/privacy`, terms `https://www.idriveus.com/terms`. Scopes: just the defaults (email, profile, openid). Publish the app.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Web application. Authorized redirect URI: `https://sdouwmylejkrnhdqdthh.supabase.co/auth/v1/callback`. Copy the client ID and secret.
4. **Supabase → Authentication → Sign In / Providers → Google**: enable, paste the client ID and secret, save.
5. **Supabase → Authentication → URL Configuration**: Site URL `https://www.idriveus.com`; add `https://www.idriveus.com/auth/callback` to Redirect URLs.
6. **Vercel → Environment Variables**: add `NEXT_PUBLIC_GOOGLE_SIGN_IN` = `true` (Production), then redeploy (it's read at build time).

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
- Resend's free tier has a daily and monthly send cap — if alert emails stop arriving, check Resend → Logs / usage first.
- To stay inside Resend's limits, each run sends at most about 2 emails a second and stops early if Resend says it's rate limited, and a customer gets at most 3 alert emails per run (and alerts for at most 10 of their saved searches per day). Anything held back isn't lost — it goes out on a later run.
- Supabase and Vercel are both free-tier-friendly at this scale; keep an eye on usage as listing/broker volume grows.
