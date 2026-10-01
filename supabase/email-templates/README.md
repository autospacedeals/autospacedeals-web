# Supabase auth email templates

Branded versions of the emails Supabase Auth sends for Drive. Paste each into
Supabase → **Authentication → Emails → Templates** (Message body, "Source"
view), with the subject line below. `{{ .SiteURL }}`, `{{ .TokenHash }}` and
`{{ .Email }}` are Supabase placeholders filled in when the email is sent.

The links go to our own `/auth/confirm` route (app/auth/confirm/route.ts)
rather than Supabase's `{{ .ConfirmationURL }}`, so every link in the email is
on idriveus.com (a link to another domain is a spam signal) and it works when
opened on a different device. This needs **Site URL** in Supabase →
Authentication → URL Configuration set to `https://www.idriveus.com`.

| Template in Supabase | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirm your email for Drive |
| Reset password | `reset-password.html` | Reset your Drive password |

The logo is served from `public/brand/drive-wordmark-email.png` (a PNG, since
Gmail and Outlook don't show SVG). Sent from `noreply@idriveus.com` once
custom SMTP (Resend) is set up — see TOOLS-AND-SERVICES.md.
