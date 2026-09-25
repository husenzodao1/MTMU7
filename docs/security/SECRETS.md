# Secret Handling

## Rules

- Never commit `.env*`, except `.env.example`.
- Never print secret values in logs, issues, screenshots, or CI output.
- Store production values in Vercel Environment Variables and Supabase project settings.
- Rotate any key that appeared in an archive, terminal output, or untrusted deployment artifact.
- Use separate Supabase projects and keys for local, preview, and production environments.

## Variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase API origin |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | RLS-protected browser/server client |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Notification scheduler only |
| `NEXT_PUBLIC_APP_URL` | public | Canonical application URL |
| `DEFAULT_SCHOOL_SLUG` | server-only | Fallback public school slug |
| `CRON_SECRET` | server-only | Vercel Cron bearer authentication |
| `LOGIN_LOOKUP_SECRET` | server-only | Turns an issued login into the sign-in address |

`LOGIN_LOOKUP_SECRET` must also be taught to the database, which stores only its
SHA-256:

```bash
node scripts/admin/set-login-secret.mts
```

Rotating it means setting the new value in both places; sign-in by login stops
working in between, so do the two together. Without it people can still sign in
with their email address, so a mismatch degrades rather than locks out.

`NEXT_PUBLIC_*` values are not a substitute for authorization. RLS remains mandatory.

## Rotation

1. Create replacement keys in Supabase.
2. Update Vercel Production and Preview variables.
3. Redeploy and verify Auth, Storage, and RLS.
4. Revoke the old keys.
5. Run `npm run security:secrets` and record the rotation date without recording values.
