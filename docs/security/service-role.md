# Service Role Policy

The Supabase service-role key bypasses RLS and is server-only.

The permitted application uses are:

## 1. `src/app/api/cron/dispatch-notifications/route.ts`

Requires `Authorization: Bearer ${CRON_SECRET}`, compares the value with a timing-safe check, calls `dispatch_due_notifications`, and returns only counters.

## 2. `src/lib/telegram/db.ts` — the parents' bot

Reached from exactly two routes:

- `src/app/api/telegram/webhook/route.ts`, which refuses every request whose `X-Telegram-Bot-Api-Secret-Token` does not match `TELEGRAM_WEBHOOK_SECRET` (timing-safe), and returns 503 when that secret or `TELEGRAM_BOT_TOKEN` is unset;
- `src/app/api/cron/telegram-dispatch/route.ts`, which requires `CRON_SECRET` like the route above.

A parent has no account on the portal, so there is no session for RLS to act on. Authorization is therefore inside the database: every `telegram_*` function is `SECURITY DEFINER`, is granted to `service_role` alone, and derives what it may return from `public.telegram_children` — a table whose rows are only written when somebody typed a pupil's name *and* the code the school printed for that pupil. A chat id is treated as an identifier, never as a credential.

The two reads that take a pupil id from the caller (`telegram_report`, and the button handlers that call it) begin with `app.telegram_may_see(chat, student)` and raise `forbidden` when it is false, because a callback button can be forged.

`public.issue_parent_codes` is deliberately **not** in this list: it is called by a signed-in administrator through the ordinary client and is gated on `students.update`.

## 3. `src/lib/push/send.ts` — Web Push for chat messages

Reached from `src/app/api/push/message/route.ts` alone, which the sender's browser calls right after writing the message. The route first reads the message through the caller's own client, so row level security decides whether the caller may even name it.

The privileged calls are `claim_message_push` and `forget_push_endpoints`, both granted to `service_role` alone. `claim_message_push` returns a message's recipients only once (`message_push_log` records the claim), only within ten minutes of the message, and never to the sender, a member who muted the conversation, switched message notifications off, or hid the message. Asking again — a retry, a replay — sends nothing. Endpoints and keys never leave the server.

## 4. `src/lib/auth/google-orphan.ts` — an unrecognised Google sign-in

Called from `src/app/auth/callback/route.ts` after a Google sign-in whose address matches no portal account. It deletes the auth user Supabase created only when all of these hold: no `public.users` row, no registration request, Google as its only identity, and created in the last ten minutes. Anything else is left alone.

Do not use this client for anything a signed-in user does. User operations go through `src/lib/supabase/server.ts` and are authorized by RLS and RPCs.

Any new privileged use requires a security review, an audit entry, and an update to this document.
