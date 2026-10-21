# Go-live checklist

Ordered steps to put this branch into production. Each step says who runs it and what proves it
worked. Do not reorder: the application expects migrations `00022`–`00035` to be applied before it
serves a request.

**Status on 2026-09-16.** Steps 3, 4, 5, 7, 8 (public part) and 9 are done: the branch is pushed,
migrations `00022`–`00035` are applied to the school's Supabase project, the six environment
variables are set in Vercel, and the production deployment at
https://maktabi-miyona-7.vercel.app serves the public site from that database. A JSON backup of the
database as it was before the migrations is at `Desktop/MTMU7/backup-supabase-2026-09-16`
(40 tables, 377 rows).

Still open: step 2 (key rotation), step 6 (Auth URLs and email template), step 10 (official
content), step 11, and the authenticated half of step 8 — signing in, storage and realtime have not
been exercised.

---

## 0. Decide the target database (owner)

The existing production Supabase project still holds the legacy schema (`00001`–`00021`). Two safe
options:

- **Recommended — a fresh Supabase project** for the new platform. Nothing in production changes
  until you switch the domain.
- **Upgrade in place.** Only after a verified backup, and accept a maintenance window: the new
  migrations add tables, policies and functions the old application does not know about.

Never point the new application at the old schema without applying the migrations: pages will error
because the tables, RPCs and policies they rely on do not exist.

## 1. Back up (owner)

Supabase dashboard → Database → Backups → create/download a backup, and note who can restore it.

## 2. Rotate keys (owner)

The legacy anon and service-role keys were distributed in archives. Create new ones (Supabase →
Project Settings → API) before the first deployment. See `docs/security/SECRETS.md`.

## 3. Apply migrations in order (owner or operator)

Either with the Supabase CLI:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

or by pasting each file from `supabase/migrations/` into the SQL editor **in ascending order**
(`00001` … `00035`). Stop at the first error and report it; do not skip a file.

Proof: `select count(*) from public.permissions;` returns the permission catalogue, and
`select public.list_public_schools();` answers without error.

## 4. Regenerate and compare types (operator)

```bash
npm run db:types -- --check
```

Proof: "Database types are up to date."

## 5. Configure environment variables (owner)

In Vercel → Project → Settings → Environment Variables, for Production (and Preview if used):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | new project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | new anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | new service-role key (server only) |
| `NEXT_PUBLIC_APP_URL` | the public https address |
| `DEFAULT_SCHOOL_SLUG` | slug of the school shown at "/" |
| `CRON_SECRET` | random string, at least 32 characters |

## 6. Configure Supabase Auth (owner)

- Site URL and redirect URLs must match `NEXT_PUBLIC_APP_URL` (including `/auth/callback`,
  `/auth/confirm`, `/verify`).
- Email: the built-in sender only reaches project members and allows a couple of
  messages per hour, so registration codes and password recovery will fail for
  everyone else. Configure SMTP as described in `docs/operations/EMAIL.md`.
- Email templates: the OTP template must contain `{{ .Token }}`.
- Confirm the Storage buckets created by migration `00028` exist.

## 7. Push the branch (owner, then operator)

GitHub authentication is not available in the assistant's environment, so the first push is yours:

```bash
git push -u origin platform/government-grade
```

This creates a **preview** deployment on Vercel, not production, as long as the production branch
is still the old one. Check the preview URL before promoting anything.

## 8. Smoke test the preview (owner + operator)

- `/` and `/schools` render; `/s/<slug>` shows the school with placeholders where official content
  is still missing.
- Sign in with a real account; the portal loads the correct role.
- Create a test student, publish a test announcement, upload and download a document.
- A second school's administrator cannot see the first school's data.
- `/admin/system` shows every check green.
- Scheduler: `curl -i <preview-url>/api/cron/dispatch-notifications` returns 401 without the secret;
  with `Authorization: Bearer $CRON_SECRET` it returns counters.

## 9. Promote to production (owner)

Merge into the production branch (or change the Vercel production branch to
`platform/government-grade`), then confirm the cron entry from `vercel.json` appears under
Project → Cron Jobs.

On the Hobby plan Vercel accepts only a daily cron, so scheduled notices also need the repository
workflow `.github/workflows/dispatch-notifications.yml`: add the repository secrets `APP_URL` and
`CRON_SECRET` (Settings → Secrets and variables → Actions). On Pro, set `vercel.json` to
`*/5 * * * *` and disable that workflow instead.

## 10. Official content (owner)

In `/admin/platform` fill in the platform identity (authority name, emblem, footer attribution,
copyright, support contacts) and in `/admin/school` the school profile, then set "identity approved".
Until that switch is on, the public site deliberately shows neutral placeholders instead of names.

## 11. After launch

- Run Lighthouse and axe on the live domain and record the findings.
- Have a native Tajik speaker review the interface wording.
- Schedule the first restore drill from the backup.
