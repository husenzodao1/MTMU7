# Deployment Runbook

## Before deployment

1. Confirm the branch and review `git diff`.
2. Run `npm ci`.
3. Run `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:db`, `npm run db:types -- --check`, both i18n checks, `npm run security:secrets`, and `npm run build`.
4. Confirm the supported Node version from `package.json`.
5. Apply Supabase migrations in order and verify the generated types.

## Vercel

Configure the six variables documented in `docs/security/SECRETS.md` for the correct environment.
Vercel supplies `CRON_SECRET` to its own cron request; verify the endpoint returns 401 without it and
does not expose secrets in errors.

**Delivery schedule.** `vercel.json` asks for one daily run, which every Vercel plan allows. A daily
run is too coarse for a notice scheduled "in fifteen minutes", so the repository also carries
`.github/workflows/dispatch-notifications.yml`, which calls the same endpoint every ten minutes.
Give the repository two secrets — `APP_URL` and `CRON_SECRET` — or the job exits quietly. The
endpoint is idempotent, so the two schedules may run together. On a Pro plan you can instead set
`vercel.json` to `*/5 * * * *` and disable the workflow.

**Region.** `vercel.json` runs the functions in `fra1`, Frankfurt, because the database is in
`eu-central-1`, Frankfurt. Left to Vercel's default (Washington), every query a page makes crosses
the Atlantic twice — about ninety milliseconds each, several per page — and a function that waits
longer holds its slot longer when the whole school arrives at once. If the Supabase project ever
moves, move this with it.

## Supabase

- Configure Auth Site URL and callback URLs for the production domain.
- Configure email/OTP templates, including `{{ .Token }}` where required.
- Verify Storage buckets and policies.
- Enable backups and document restoration ownership.
- Run smoke tests for school isolation, login, file access, and notification dispatch.

## Rollback

Use the previous Vercel deployment for application rollback. Database changes require a reviewed forward migration; do not edit applied migrations or use destructive rollback commands in production.

Live Auth, Storage, Realtime, cron, backup restoration, and browser QA remain `NOT VERIFIED IN LIVE RUNTIME` until the production smoke checklist is completed.
