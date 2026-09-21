# Service Role Policy

The Supabase service-role key bypasses RLS and is server-only.

The only permitted application use is:

`src/app/api/cron/dispatch-notifications/route.ts`

That route requires `Authorization: Bearer ${CRON_SECRET}`, compares the value with a timing-safe check, calls `dispatch_due_notifications`, and returns only counters. Do not import `createPrivilegedClient` into pages, Server Actions, user workflows, or ordinary data-access helpers.

Any new privileged use requires a security review, an audit entry, and an update to this document.
