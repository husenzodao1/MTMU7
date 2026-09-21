# Feature Parity

## Implemented in the platform

- Multi-school tenancy, school-scoped RLS, roles, permissions, audit logs
- Student, staff, guardian, registration, invitations, and approvals
- Academic years, classes, subjects, enrollments, grades, attendance, homework, timetable
- News, announcements, events, library, documents, media, structured homepage CMS
- Student, teacher, and guardian portal flows
- Messaging safety controls, notifications, reports, and analytics
- Public school directory and school-scoped public content routes
- Cross-section administrative search, dark theme, printable reports (PDF via the browser)

## Deliberate limitations

- Messaging currently supports text and moderation controls but not message attachments; the specification defers attachments to a later phase because they need their own child-safety review.
- External Telegram, WhatsApp, email, and push integrations are not enabled by default.
- Report export is CSV and print/PDF; XLSX would require a new dependency and is not included.
- The web app manifest makes the portal installable, but there is no offline service worker.
- Organisational units (departments) and storage/retention settings from the specification's optional lists are not implemented; nothing in the interface pretends otherwise.
- Official identity text, emblem, school photograph, contacts, and footer attribution require owner approval.
- Public content is limited to published records allowed by RLS.

## Verification status

Automated unit, database, i18n, type, lint, and build checks are available. Live Supabase, production Auth, Storage, Realtime, cron, performance, and accessibility verification remain `NOT VERIFIED IN LIVE RUNTIME` until performed against the deployment environment.
