# Writing to `auth.users`

`auth.users` belongs to Supabase's auth service, not to this application. The
platform writes to it in exactly two places, and nowhere else may.

| Where | What it does |
| --- | --- |
| `supabase/migrations/00015_super_admin_and_cms.sql` | Seeds the platform owner's account when a project is first created. |
| `app.create_login(email, password)` — `supabase/migrations/00046_account_provisioning.sql` | Creates the account the school issues to a pupil or a teacher. |

`00044_auth_user_empty_strings.sql` repairs rows that were written before the
column list below was understood. It is idempotent and safe to leave in place.

## Why in SQL rather than through the auth admin API

The alternative is `POST /auth/v1/admin/users` with the service-role key.
[service-role.md](service-role.md) permits that key exactly one caller, and
account creation is an administrator-facing workflow reached from a web page.
Three things decided it:

- **Blast radius.** The service key bypasses every RLS policy in the schema.
  Loading it into the import path trades a narrow, auditable SQL write for a
  master key in a request handler.
- **Half-created accounts.** GoTrue creating the auth user and the platform rows
  failing afterwards leaves an orphan holding the address, which then blocks
  every retry. In one transaction that state cannot exist.
- **Testability.** `tests/db/*` runs the migrations against PGlite and is this
  repository's real safety net. The admin API cannot be exercised there, so the
  highest-consequence code in the feature would have been the only code with no
  test.

## The column list, and why it is the whole point

Supabase's auth service reads several of this table's columns into non-nullable
Go strings. A row that leaves one NULL cannot be read at all: signing in fails
with

```
error finding user: sql: Scan error on column index 8, name "email_change":
converting NULL to string is unsupported
```

which names a column nobody set and gives no hint that the account itself is the
problem. That is what `00044` exists to repair, and `00015` is what made it
necessary.

`app.create_login` therefore writes every one of them explicitly:
`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`,
`email_change_token_current`, `phone_change`, `phone_change_token`,
`reauthentication_token` — all `''` — plus `instance_id`, `aud`, `role`,
`raw_app_meta_data`, `raw_user_meta_data`, `email_change_confirm_status`,
`is_sso_user`, `is_anonymous`. It also writes the matching `auth.identities` row,
which GoTrue expects to find for an email account.

`email_confirmed_at` is left **NULL** on purpose: the school wrote the address
down, and the person still has to show they can read it.

## How it is kept honest

`tests/db/account-provisioning.test.mts` does not hand-check a list. It reads
`information_schema.columns` for `auth.users` and asserts that a created row
matches the account 00015 seeded and 00044 repaired in **every** column except
the ones that are meant to differ. A column added to `auth.users` that
`app.create_login` does not set fails that test by construction.

`tests/db/supabase-compat.sql` carries the full GoTrue column set for that
reason, with the four columns that have no default in production left without one
here — a shim that quietly defaulted them to `''` would let the test pass on a
row production could not read.

## Before go-live, once

Create one account through the Supabase dashboard and one through the importer
in the same project, then diff the two `auth.users` rows column by column. This
is the only check that proves an SQL-created account is indistinguishable from a
GoTrue-created one in the version of the auth service actually running. Record
the date and the outcome here.

| Date | Project | Outcome |
| --- | --- | --- |
| — | — | not yet run |

## Adding a third writer

Don't. If something genuinely needs one, it requires a security review, an entry
in the table above, and a test written the same way as the one described here.
