# Final Report (specification §85, sections A–W)

Date: 2026-09-16 · Branch `platform/government-grade` · 233 commits · nothing pushed to any remote.

> **Partially verified in live runtime (2026-09-16).** The platform is deployed at
> https://maktabi-miyona-7.vercel.app against the school's Supabase project with migrations
> `00022`–`00035` applied. Verified there: the public site renders from the live database (school
> directory, school page with its CMS section, news/events/documents routes), protected routes
> redirect to sign-in, security headers are served, and the scheduled-dispatch endpoint answers 401
> without its secret and 200 with it.
>
> **Still NOT VERIFIED IN LIVE RUNTIME:** signing in and every authenticated flow behind it (portal,
> admin, gradebook, attendance), Storage upload and signed-URL delivery, Realtime message delivery,
> outgoing email, and restoring from a backup.

---

## A. Summary

The legacy single-school application was rebuilt as a multi-tenant, permission-driven education
platform: 35 database migrations establish tenancy, RBAC, the academic core, CMS, communication,
storage and reporting under row level security; the application layer provides the public school
website, the student/guardian/teacher portal and an Admin Control Center that covers day-to-day
administration without code changes. Authorization lives in the database (RLS plus SECURITY DEFINER
RPCs with a fixed `search_path`); the application re-checks it in every page and Server Action.
Official institutional content is never invented — the interface shows neutral placeholders until
the owner supplies and approves the real text, emblem and photograph.

## B. Files changed

233 commits touch, in round numbers: 35 SQL migrations; 108 build-time routes under `src/app`
(public site, auth, portal, teacher area, admin, file delivery, cron, sitemap/robots/manifest); ~65
feature modules under `src/features`; a UI kit of 14 primitives under `src/components/ui`; shared
libraries under `src/lib` (auth, i18n, list params, storage, security, export, request time); 21
message catalogues (7 areas × 3 locales, 2323 keys each); 14 test files; 5 scripts; CI workflow; 7
documents under `docs/`. `git log --stat` in the repository is authoritative.

## C. Database migrations

`00001`–`00021` are the legacy chain. This work added:

| Migration | Content |
|---|---|
| 00022 | Platform foundation: tenancy, regions/districts, permissions v2 (31 modules), school provisioning trigger, hardened RLS core |
| 00023 | Core RLS and accounts, `list_public_schools`, `resolve_public_school` |
| 00024 | Academic core: people, calendar, classes, subjects, enrollments, grades, attendance, homework, timetable |
| 00025 | Registration, approvals, invitation codes, student lifecycle, validated import |
| 00026 | CMS: news workflow, announcements with targeting, events, documents with versions, site sections, library v2 |
| 00027 | Messaging under RLS, safety tools, notifications v2, `dispatch_due_notifications` |
| 00028 | Storage buckets and policies (`school/area/uuid.ext`) |
| 00029 | Dashboards, portal "today" functions, reports, analytics |
| 00030 | Portal timetables |
| 00031 | School-local attendance dates; substitute teachers may mark the lesson they cover |
| 00032 | Role editing keeps permissions the editor does not hold; dashboard on the school's date |
| 00033 | School-local dates in the current term, analytics and cross-school overview; localized subject names |
| 00034 | School-local default date in `teacher_today` and `student_overview` |
| 00035 | A book author may manage the access list of their own unpublished draft |

## D. Security fixes

- **NULL authorization bypass**: `app.can()` returned NULL for unknown permissions, and NULL is not
  false in a policy. It now coalesces to false (00029). Covered by `tests/db/foundation.test.mts`.
- **Service role confinement**: one client factory (`src/lib/supabase/privileged.ts`), one caller
  (`/api/cron/dispatch-notifications`), documented in `docs/security/service-role.md`.
- **Cron authentication**: bearer token compared with `timingSafeEqual`; missing or wrong secret
  returns 401 and the response never contains secret material (`tests/unit/cron.test.mts`).
- **Secrets hygiene**: `.env*` ignored except the template, `npm run security:secrets` scans the
  tree in CI (357 files, clean), rotation runbook in `docs/security/SECRETS.md`.
- **Self-escalation guards**: triggers reject changes to role, school, approval and active state on
  one's own account.
- **SECURITY DEFINER hardening**: every function sets `search_path = ''` and qualifies objects.
- **Content Security Policy** with a per-request nonce set in `src/proxy.ts`; auth redirects pass
  through `safeRedirectPath`; file delivery issues short-lived signed URLs only after a permission
  check; upload paths are re-validated server-side with `isValidStoragePath`.
- **CSV injection** neutralized in `toCsv`; markdown rendering allows no raw HTML.
- **Audit log** records actor, school, action, entity and metadata, and filters out password, token,
  secret and body fields.

## E. RLS / RBAC changes

Every tenant table carries `school_id` and a policy set built on `app.can(school, permission)`,
`app.can_read_school`, `app.can_grant_role` and role-scope helpers (school, district, region,
platform). Content follows explicit domain states (draft → review → published → archived) rather
than booleans; publishing, archiving and deletion are separate permissions. Delegated role editing
may only grant or revoke permissions the editor holds (00032). Authors without a publishing right
can prepare drafts of announcements and books but cannot publish them (00026, 00035).

## F. Multi-tenant changes

No fixed school UUID remains. The tenant comes from the signed-in user's membership or, for public
pages, from the request host (`school_domains`) with `DEFAULT_SCHOOL_SLUG` as the fallback; the
browser never supplies a `school_id`. Creating a school provisions its roles, modules, assessment
types and website sections automatically. `tests/db/scale.test.mts` seeds 70 provisioned schools and
asserts that each administrator sees only their own tenant across students, enrollments, classes,
academic years and users, that the dashboard answers without walking other tenants, and that the
public directory lists only active schools.

## G. Admin features

Overview dashboard with setup alerts and work queues; cross-section search over students, staff,
user accounts, classes, news, announcements, library and documents, each section gated by its own
permission; people (students, staff, guardians, user
accounts, approvals, invitation codes, CSV import with validation and preview, CSV export); academic
structure (years and terms, classes, subjects, gradebook oversight, attendance, timetable); content
(news desk, announcements with targeting, events, library, documents, media, structured website
sections); communication (notification broadcasts, message moderation with an audited privacy
notice); management (school profile, school settings, roles and the permission matrix, module
switches, platform identity, school creation and status, regions and districts, administrative
scopes); reporting (six reports with CSV export, each export audited; analytics; audit log); system
status that reports configuration presence without ever showing a value.

## H. CMS features

News with a full editorial workflow (draft, review, return with reason, publish, schedule, archive)
and portal authoring for teachers; announcements targeted at the school, roles, classes or
individuals, with attachments and priority; events; a library with metadata, cover, protected file,
categories, visibility rules and per-role/per-class access lists; documents with versions and access
control; a media library; and structured homepage sections in three languages with fallbacks, so a
missing section never blanks the public site.

## I. Academic features

Academic years and terms, classes with homeroom teachers, subjects and class-subject assignments,
enrollments with lifecycle states, assessment types, grades with correction windows and approval,
attendance with a configurable correction period and substitute-teacher rights, homework with
submissions and review, timetable with bell periods and substitutions. All date logic uses the
school's own calendar day (`app.school_today`).

## J. Student features

Dashboard ("today"), schedule, grades, attendance, homework with submission, library with favorites
and protected reading, news, announcements, events, documents, messaging, notifications, profile,
settings and contacts.

## K. Teacher features

Teacher workspace: today's lessons, attendance registers (including lessons they cover as a
substitute), gradebook per class-subject, homework creation and submission review, plus announcement
drafting for roles that hold `announcements.create`.

## L. Parent features

Linked children only, with a secure child switcher; per-child dashboard, grades, attendance,
homework, timetable, announcements, events, documents and notifications.

## M. Design system changes

One institutional token set (neutral canvas, restrained brand accent, semantic success/warning/
danger), Noto Sans with Cyrillic subsets, modest radii, and 14 shared primitives (button, fields,
form controls, data table, filters, pagination, surface/cards/empty states, overlay, toast, action
form with confirmation dialogs, badges, direct upload, print button). No glassmorphism, gradients as
identity, or decorative animation.

Interaction colours (solid button, hover, active, link text) are separate token roles, which let a
dark theme redefine the same names without breaking contrast; the theme follows the reader's system
setting. A print stylesheet turns any administrative page into a paper document — light surfaces,
no navigation, no table row split across pages — which is also how a report becomes a PDF.

## N. Mobile changes

Responsive layouts throughout, a drawer-based admin shell with searchable navigation, tables that
collapse to readable stacked rows, touch-sized controls and safe-area handling. Verified visually at
375 px and desktop for the public and auth pages: no horizontal scrolling and no console errors.

## O. Accessibility changes

Semantic landmarks, a skip link, visible focus, `aria-current` in navigation, `aria-live` regions for
toasts and the message thread, screen-reader text for icon-only states, labelled form fields with
error text tied to inputs, chart values printed as text (never colour alone), and browser zoom left
enabled. No automated accessibility audit was run.

## P. Performance changes

Cursor-based message pagination instead of loading whole threads; realtime subscriptions scoped to
one conversation; explicit column lists instead of `select("*")`; per-request memoized clock and
cached identity/context lookups; indexed `school_id` lookups (verified by `EXPLAIN` in the 70-school
test); server-side pagination and filtering for every list; the production build reports 107 routes
with the shared first-load JS in the normal range for this stack.

## Q. Tests run

| Suite | Result |
|---|---|
| `npm run test:unit` | 27 passed |
| `npm run test:db` (PGlite, all 35 migrations) | 130 passed (~39 s) |
| `npm run lint` | 0 problems |
| `npx tsc --noEmit` | no errors |
| `npm run db:types -- --check` | types up to date |
| `node scripts/i18n/check-messages.mts` | 2323 keys × 3 locales |
| `node scripts/i18n/check-usage.mts` | all static keys covered |
| `npm run security:secrets` | 357 files, clean |

Coverage spans the categories required by §74: authentication and role checks, tenant isolation,
RBAC boundaries, content states (draft not public, published public, archived hidden), academic
scoping, storage authorization, and the 70-school scenario.

## R. Typecheck result

`npx tsc --noEmit` — no errors, with `strict` and `noUncheckedIndexedAccess` enabled.

## S. Build result

`npx next build` — succeeded; 108 routes emitted, including `robots.txt`, `sitemap.xml` and
`manifest.webmanifest`.

## T. Known limitations

Message attachments are not implemented — the specification defers them, and they need their own
child-safety review before students can exchange files. External Telegram/WhatsApp/email/push
integrations are off by default. The PWA is installable but has no offline service worker. Report
export is CSV and print/PDF; XLSX would need a new dependency. Organisational units (departments)
and storage/retention settings from the specification's optional lists are absent, and nothing in
the interface suggests otherwise. Tajik interface wording is machine-produced and needs a native
review. `/dev-preview` exists for local development and returns 404 in production.

## U. Not verified

Signing in and the authenticated flows behind it (portal, teacher workspace, admin); Storage upload
and signed-URL delivery; Realtime message delivery; outgoing email and the OTP template; restoring
from a backup; production performance with real data volumes; automated accessibility and
cross-browser testing.

Verified live on 2026-09-16 instead: migrations applied to the hosted project, public pages rendered
from it, route protection, security headers, and the scheduled-dispatch endpoint's authorization and
success paths.

The `codebase-memory` MCP server requested for this work never connected (connection timeout), so no
external memory index was used.

## V. Production blockers

1. Owner approval of official identity content (school name, authority name, emblem, photograph,
   footer attribution, contacts, copyright) — the questionnaire is in the handoff, §9.
2. Rotation of the Supabase anon and service-role keys that appeared in legacy archives, and a real
   project configured in the environment variables.
3. Applying migrations 00001–00035 to that project and running the deployment smoke checklist in
   `docs/operations/DEPLOYMENT.md`.
4. Supabase Auth configuration: Site URL, redirect URLs, email/OTP template containing `{{ .Token }}`.
5. `CRON_SECRET` of at least 32 characters configured where the schedule runs.
6. A native Tajik review of the interface text before public launch.

## W. Next recommended phase

Provision the production Supabase project and run the deployment runbook end to end, recording each
smoke check; then collect the owner's official content and mark the identity approved in
`/admin/platform`; then run Lighthouse and axe on the live domain and act on the findings. Only
after those three steps should the platform be described as production-ready. Feature work
(message attachments, global search, XLSX/PDF export, offline PWA) belongs after that, not before.
