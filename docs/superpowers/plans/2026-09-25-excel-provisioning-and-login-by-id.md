# Excel-driven provisioning, login by personal ID, six-digit codes

## Context

The school does not want to type its register into the portal. It already keeps
classes, pupils, teachers and the timetable in spreadsheets, and it wants to
hand those spreadsheets to the portal and get working accounts back.

Today the portal works the other way round: a person registers themselves at
`/register`, proves their address with an emailed code, chooses a password, and
waits for an administrator to approve them. That model asks a thousand children
to do something none of them will do correctly, and it leaves the register
scattered across a thousand self-descriptions.

The owner's decision, in their own words: only a sign-in screen remains; the
administrator imports Excel files; the system issues a login and a password for
everyone and gives the workbook back with those two columns filled; the person
signs in with what they were handed, confirms the address that was written in
the spreadsheet, and is then in. Changing the issued password afterwards is
optional. Re-importing an edited workbook updates the register rather than
duplicating it.

Three things prompted this plan on 2026-09-25: the emailed code arrives with
eight digits instead of six; nothing in the portal reads a spreadsheet; and the
timetable, which the deputy head owns, is the source the journal should derive
from but currently has no bulk entry at all.

Outcome: an administrator can bring an empty portal to a full school year with
four workbooks, and nobody types a name twice.

---

## What is already true (do not re-derive)

- **The eight-digit code is not ours.** `src/features/auth/schemas.ts` accepted
  `\d{6,10}`; GoTrue's own `mailer_otp_length` decides the length.
- **No spreadsheet library is installed.** All tabular work is
  [csv.ts](../../../src/lib/export/csv.ts) — `toCsv`, `parseCsv`,
  `escapeCsvCell`, `neutralizeFormula`.
- **The import shape to reuse** is `IMPORT_CONFIG` in
  [config.ts](../../../src/features/admin/import/config.ts), the three-step
  dry-run wizard in [wizard.tsx](../../../src/features/admin/import/wizard.tsx),
  `runImportAction` in
  [actions.ts](../../../src/features/admin/import/actions.ts), and the
  `{valid, total, errors[{row,field,code}], created}` contract that
  `import_students` / `import_staff` / `import_classes` return
  (`supabase/migrations/00025_registration_and_people_rpcs.sql`). Those three are
  **insert-only**; this work needs upsert.
- **`app.guard_users_write()` refuses INSERT into `public.users` from API
  callers**, so accounts must be created inside a `SECURITY DEFINER` function.
- **Writing `auth.users` from SQL has precedent**: `00015` seeds the owner
  account, and `00044` documents exactly which GoTrue columns must be `''`
  rather than NULL or sign-in fails with
  `converting NULL to string is unsupported`.
- **The service role is restricted to one caller** by
  [service-role.md](../../security/service-role.md).
- **Production is nearly empty**: 1 school, 5 users, 2 students, 2 classes, and
  **0 subjects, 0 class_subjects, 0 academic_terms, 0 assessment_types**.

### Five facts that change the design

1. `get_my_access` (`00022`) builds its `user` object from `public.users` only —
   it does not expose whether the address is confirmed.
2. The PGlite `auth.users` in `tests/db/supabase-compat.sql` is a 13-column stub
   holding **none** of the eight columns `00044` repairs. Extending it is a
   prerequisite, not a nicety.
3. `parseCsv`'s header normalizer (`csv.ts:81`) lowercases and strips everything
   outside `[a-z0-9]`, so `Синф` becomes the empty string and the column is
   dropped. **The xlsx reader needs its own header map.**
4. `public.users.email` is UNIQUE **globally**, not per school. Siblings cannot
   share one family address.
5. `subjects` has no unique name — only `(school_id, code) WHERE code IS NOT
   NULL`. "Find or create by name" duplicates without a new index.

---

## Decisions

### Accounts are created in SQL, not through the GoTrue admin API

A `SECURITY DEFINER` function inserts `auth.users` + `auth.identities` +
`public.users` + the person row in one transaction.

The alternative — `POST /auth/v1/admin/users` with the service-role key — was
rejected on three grounds: it widens the service-role blast radius from one cron
endpoint to an admin-facing workflow; a failure between "GoTrue created the auth
user" and "the platform rows committed" leaves an orphan holding the email and
blocking retry; and it cannot be tested, while `tests/db/*` against PGlite is
this repo's real safety net.

`app.create_login()` becomes the **only** place in the codebase that writes
`auth.users`. It sets every column `00044` names to `''` — do not copy `00015`'s
column list, which is precisely the omission that made `00044` necessary — and,
under `SET search_path = ''`, must schema-qualify `extensions.crypt`,
`extensions.gen_salt`, `extensions.gen_random_bytes`.

Password: `gen_random_bytes(10)` over the 32-character alphabet
`23456789abcdefghijkmnpqrstuvwxyz` (no `l`/`o`, unbiased at `& 31`), ≈50 bits,
hashed with `gen_salt('bf', 10)` so an issued password is indistinguishable from
a self-chosen one. That costs ~60–100 ms a row, so the importer takes
`p_offset`/`p_limit` and the route loops in chunks of ~300.

### Sign-in by personal ID uses a server-only secret, not a password oracle

`signInWithPassword` needs the email, and `public_id` is sequential, so a plain
`login_email(p_login)` RPC would let anyone with the publishable key harvest
every pupil's address.

Gating that RPC on the password instead — "return the email only if the password
matches" — is **worse**, and was rejected: at sign-in there is no session, so the
function must be granted to `anon`, which turns it into a password-verification
oracle reachable by anyone who opens the site, bypassing the GoTrue rate limits
that protect `/token` today.

Instead `public.login_lookup(p_login text, p_secret text)` compares
`digest(p_secret,'sha256')` against a hash in a single-row table with RLS on and
**no policies**, so only definer code can read it. The secret is
`LOGIN_LOOKUP_SECRET`, handled exactly like `CRON_SECRET` in
[env.server.ts](../../../src/lib/env.server.ts). A wrong secret returns NULL for
every login; a blocked or rejected account returns NULL too. No password is ever
compared in SQL, and all rate limiting stays with GoTrue.

If the owner would rather not manage a second secret, the alternative is a
**random**, non-enumerable login column (`MT-4K7QX2`) instead of sequential
`public_id`; then the lookup needs no gate at all.

### Email confirmation reads GoTrue's own record, and works either way round

Accounts are created with `email_confirmed_at` left NULL, so "confirmed" means
the person really did read a code we sent — not a flag we set for ourselves. The
gate reads that column through `get_my_access`, which already runs as the
platform and can see the `auth` schema the portal cannot.

A project set to demand confirmation *before* the first sign-in would refuse
those accounts outright, so `signInAction` treats GoTrue's `email_not_confirmed`
not as a failure but as the next step: it sends the code and hands the visitor to
`/confirm-email`, which works with a session or, through a short-lived httpOnly
cookie, without one. The flow is therefore correct whether or not the dashboard
setting is changed, and the address is never taken from the form — only from the
session or that cookie — so a code cannot be redirected to another inbox.

A pupil whose address cannot receive anything is not left stranded: see
`public.confirm_account` below.

The gate lives in `getPortalSession()`
([guards.ts](../../../src/lib/auth/guards.ts)), **not** in `src/proxy.ts`: the
proxy deliberately avoids an auth round-trip per request, and `/admin` sits
outside the `(portal)` group, reaching the check only through
`requireAdminArea → requireAccess → getPortalSession`.

### Library: `write-excel-file` + `read-excel-file`

4.3 MB together against ExcelJS's 21.8 MB, same author, `fflate` under both.
ExcelJS's one real advantage — true read-modify-write of an uploaded workbook —
is not needed, because the returned workbook is regenerated canonically with
unknown columns carried through.

Hand-rolling OOXML on `node:zlib` was rejected: writing is tolerable, but the
owner will re-save the file in Excel or LibreOffice, so the **reader** must
handle shared strings, inline strings and date serials resolved through
`styles.xml`. A writing bug is cosmetic; a reading bug corrupts the register.

Parsing moves **server-side** — it keeps a spreadsheet parser out of the admin
bundle, and lets the template writer and the reader share one column definition.

### The round-trip key

Per row, in order:

1. `Логин` filled → must match `public.users.public_id` **in this school**. No
   match → `unknown_login`. Never fall through to "create": a typo must not
   spawn a duplicate person.
2. Blank, staff → match `staff.employee_number` (unique per school).
3. Blank, student → `(class, last_name, first_name, date_of_birth)`, casefolded.
   More than one match → `ambiguous_person`, never a guess.
4. No match → create person, account and password.

**A matched row keeps its existing password.** Only case 4, or an explicit reset,
issues a new one — otherwise correcting one phone number invalidates a thousand
logins.

---

## The four workbooks

Common to all: sheet 1 is **`Дастур`** (instructions, ignored by the importer);
the header row is row 1, bold, frozen, with AutoFilter; columns are matched **by
header text**, never by position; unknown columns are ignored on read and carried
through verbatim on write; `Логин` and `Парол` are always the last two columns,
grey, with the note *«Ин ду сутунро пур накунед — система худаш пур мекунад.»*

| Workbook | Sheet | Columns |
| --- | --- | --- |
| `Хонандагон.xlsx` | `Хонандагон` | `Синф*` · `Насаб*` · `Ном*` · `Номи падар` · `Санаи таваллуд*` · `Ҷинс` · `Почтаи электронӣ*` · `Телефон` · `Логин` · `Парол` |
| `Омӯзгорон.xlsx` | `Омӯзгорон` | `Рақами омӯзгор*` · `Насаб*` · `Ном*` · `Номи падар` · `Фанҳо` (`;`-separated) · `Роҳбари синф` · `Вазифа` · `Почтаи электронӣ*` · `Телефон` · `Логин` · `Парол` |
| `Ҷадвали дарсӣ.xlsx` | `Ҷадвал` | `Синф` · `Рӯз` · then twelve columns headed `1`…`12` |
| `Журнал.xlsx` | `Мавзӯъҳо`, `Баҳоҳо` | see phase 5 |

**One sheet with a `Синф` column, not one sheet per class.** Thirty-three sheets
means thirty-three header rows to keep in sync and a round-trip that must
recreate exactly the same sheet set. The generated template pre-fills `Синф` with
the school's existing class names in order and freezes the header, so it reads as
grouped while staying structurally flat.

`Вазифа` maps Tajik words onto `staff.staff_type` (`омӯзгор`→`teacher`,
`директор`→`director`, `муовини директор`→`vice_principal`,
`китобдор`→`librarian`). `Фанҳо` only pre-creates `subjects` rows — the
authoritative teacher↔class↔subject link comes from the timetable.

### How `Математика (14)` resolves

`^\s*(.+?)\s*\((\d{1,32})\)\s*$` → subject name, teacher number. A cell with no
parentheses means the subject is known but no teacher is assigned; empty means a
free period; anything else is `invalid_cell`.

- **Subject** by `lower(btrim(name_tg))`, after adding
  `subjects_school_name_unique` — safe today because production has 0 subjects.
  Casing collapses; **typos do not**, so the dry run lists every subject name it
  is about to create, which is the single most valuable thing it prints.
- **Teacher** by `staff.employee_number`, trimmed but **not** zero-stripped:
  `014` and `14` stay different and the owner fixes the sheet.
- **Shift is not a column** — `timetable_entries.shift` is copied from
  `classes.shift`, and `app.validate_timetable_entry` already overwrites
  `academic_year_id` and `teacher_id`.
- `timetable_teacher_conflict` is the constraint that will actually fire. Detect
  it in a **pre-pass self-join** over incoming rows plus the existing table, so
  the error can name both cells — *«Омӯзгори 14: Ҷадвал!D12 (7А) ва Ҷадвал!D47
  (9Б)»* — comparing `(shift, period)`, not period alone.
- Re-import deletes and re-inserts per class, inside the transaction, for the
  classes the file covers. Classes absent from the file are untouched.

### The credentials workbook

Generated in Postgres, returned in the RPC result, held in the route handler's
memory for one request, written into a Buffer, streamed out. **Never written to
any table, never logged** (the audit row carries counts only), never sent to the
browser as JSON — only as the file body, with `Content-Disposition: attachment`
and `Cache-Control: private, no-store`.

`Парол` is filled only for rows that got a **new** password; unchanged rows read
`(аллакай дода шудааст)`. A final sheet `Огоҳӣ` warns that the file holds
passwords.

Because nothing is stored, a lost workbook is regenerated, not recovered:
`resetCredentialsAction(personIds[])` issues fresh passwords for a handful of
people, and `public.users.credentials_issued_at` lets the admin list show *when*
credentials were issued without storing *what* they were. Issuing credentials
writes its own audit action, distinct from the import's.

### What happens to self-registration

Delete the UI; keep the database.

**Delete**: `src/app/(auth)/register/`, `src/app/(auth)/pending/`, the
`/register` link in `login/page.tsx`, `RegistrationDetailsForm`,
`RegistrationPasswordForm`, the `purpose:"register"` branch of `VerifyCodeForm`,
the eight registration actions in
[auth/actions.ts](../../../src/features/auth/actions.ts), `DRAFT_COOKIE` and
`readDraft` (keep `RESET_COOKIE` — password reset stays), and
`registrationDetailsSchema`.

> Removing `registrationDetailsSchema` drops the `@/` import from `schemas.ts`,
> which makes `otpSchema` unit-testable — `tests/unit/*` resolve source through
> relative paths and cannot follow the alias.

**Keep, hidden**: `/admin/approvals` and `/admin/invitations` stay reachable so
the historical rows remain viewable, but drop from the admin navigation.

**Keep in the database, closed off**: revoke `submit_registration` from
`authenticated` and force `registration_open: false`. Do **not** drop
`registration_requests`, `invitation_codes` or the two RPCs — that is a
destructive migration against a live database for no benefit. Close the door;
leave the wall.

---

## Phases

Next free migration is **00045**.

### Phase 0 — six digits *(done)*

`otpSchema` pinned to `/^\d{6}$/` and the input to `maxLength={6}`.
**The owner must set Email OTP Length to 6** in the Supabase dashboard
(Authentication → Sign In / Providers → Email); the length is GoTrue's, not ours.

### Phase 1 — login by personal ID, confirmation gate, registration removed *(done)*

Migration `00045_login_by_public_id.sql`: `public.login_secret` (RLS on, no
policies); `public.login_lookup(text, text)`; `public.confirm_account(uuid)`;
`get_my_access` gains `email_verified`, read from `auth.users.email_confirmed_at`;
revoke `submit_registration`; force `registration_open = false`.

Code: `LOGIN_LOOKUP_SECRET` in `env.server.ts`, `.env.example`, CI placeholder,
[SECRETS.md](../../security/SECRETS.md); `signInAction` takes an identifier, not
an email; `/confirm-email` page plus `sendConfirmationCodeAction` and
`confirmEmailAction`; the new `email_unconfirmed` stage in `guards.ts`;
`/confirm-email` added to `AUTH_PATHS` and left out of both `PORTAL_PREFIXES` and
`GUEST_ONLY`; all of the deletions above; keys in all three of
`src/messages/{tg,ru,en}/auth.json`.

`accessSchema` defaults `email_verified` to **true**, so a database that has not
yet taken the migration does not lock everyone out mid-deploy.

Tests: `tests/db/login-lookup.test.mts`; extend `tests/unit/routes.test.mts`.

**Ship this before any spreadsheet work** — it is independent, it is the riskiest
change, and the five existing production accounts already have `public_id`
values to test against.

### Phase 2 — xlsx plumbing and the students workbook *(done)*

Migrations `00046_account_provisioning.sql` (`app.random_password`,
`app.create_login`, `users.credentials_issued_at`) and
`00047_people_upsert_import.sql` (`public.import_people(p_kind, p_rows,
p_dry_run, p_offset, p_limit)` returning
`{valid, total, errors[], created, updated, unchanged, credentials[]}`).

Code: the two packages; `src/lib/export/xlsx.ts`; `src/lib/import/xlsx.ts`;
`src/features/admin/import/templates.ts` (the Tajik column definitions, in one
place); `previewImportAction`; `src/app/admin/import/people/[kind]/route.ts`
(`runtime = "nodejs"`, `maxDuration = 300`); an `.xlsx` variant of the template
route; the wizard reworked for file upload → server preview → blob download.

Tests: **extend `tests/db/supabase-compat.sql` to the real `auth.users` column
set first**, then `tests/db/account-provisioning.test.mts` — the assertion is
column-driven, comparing every column of a created row against the 00044-repaired
owner row, so a column the function forgets fails by construction — then
`tests/db/people-import.test.mts` and `tests/unit/xlsx.test.mts`.

`import_students` / `import_staff` stay defined and covered; mark them deprecated
and remove in a later cleanup.

### Phase 3 — teachers *(done)*

Same `import_people` with `p_kind := 'staff'`; homeroom assignment into
`classes.homeroom_staff_id`; subject pre-creation from `Фанҳо`.

### Phase 4 — timetable *(done)*

`00048_timetable_import.sql`: `subjects_school_name_unique`;
`public.import_timetable`. `tests/db/timetable-import.test.mts`.

### Phase 5 — journal

Blocked until an **academic-year setup** step creates `academic_terms`
(quarters), `assessment_types` and `bell_periods`, all at zero rows in
production. Then `00049_journal_import.sql`: `import_lesson_topics` first (the
unblocked half — `UNIQUE NULLS NOT DISTINCT (class_subject_id, lesson_date,
period_number)` is already a natural upsert key), the marks grid after.

### Import order is mandatory

academic year → classes → teachers → students → timetable → journal. The wizard
should say so and refuse out of order rather than printing a wall of
`unknown_class`.

---

## The three problems, and how they were answered

**1. One address, one account.** GoTrue allows exactly one account per address,
so two siblings on a family address and a first-year pupil with no address of
their own both had nowhere to go. Two things now cover it:

- The import reports `duplicate_in_file` / `duplicate_existing` rather than
  guessing, so the office is told which row to change instead of silently
  losing a pupil. A family address can still be reused per child through
  plus-addressing — `volid+MT10007@gmail.com` reaches the same inbox and is a
  different address to GoTrue.
- `public.confirm_account(user_id)` lets someone holding `users.update` vouch
  for an account whose address can never receive a code. It is written to the
  audit log under its own action, because it is a judgement and not a proof.
  Without it those accounts would stand for ever at a screen asking for a code
  that cannot arrive.

**2. First-years.** The same escape hatch answers it for now: the parent's
address goes in the child's row, or the administration confirms the account by
hand. A parent portal with its own accounts, linked through `student_guardians`,
is the proper answer and remains a later phase.

**3. Split groups.** `class_subjects` allowed one teacher per subject per class,
and a timetable slot was unique per class, so half of 8А taking English with a
second teacher in the same period could not be expressed at all. Migration 00048
adds `group_label` to both `class_subjects` and `timetable_entries` and carries
it into their unique keys. A cell naming one lesson keeps the empty label, so
everything written before means exactly what it meant; a cell naming two —
`Забони англисӣ (14) / Забони англисӣ (19)` — becomes two bindings and two
slots in the same period.

Two further hazards are handled without needing a decision:
`app.normalize_class_name` folds the Latin letters that look identical to
Cyrillic ones, so `1A` and `1А` are one class; and `subjects_school_name_unique`
means `Математика` typed twice is one subject, while the dry run prints every
subject and class it is about to create so a genuine typo is seen before it
exists.

## Verification

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `node scripts/i18n/check-messages.mts`,
  `node scripts/i18n/check-usage.mts`, `npm run security:secrets`, `npm run db:check`.
- Per phase, the DB tests named above, run against migrations in PGlite.
- **Before go-live, once**: create one account through the Supabase dashboard and
  one through the importer, diff the two `auth.users` rows column by column, and
  record the result in a new `docs/security/auth-users-writes.md`. This is the
  only check that proves an SQL-created account is indistinguishable from a
  GoTrue-created one.
- End to end on staging: import a two-class workbook, download the credentials,
  sign in as one pupil with the issued login, receive a six-digit code, confirm,
  reach the dashboard; then edit one phone number in the workbook, re-import, and
  assert the password did not change.
