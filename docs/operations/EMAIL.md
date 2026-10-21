# Account email

Everything a person does before they have a session depends on email: the code
that confirms a new registration, the password recovery code, and the address
confirmation link. If email does not leave the project, those flows stop.

## The default Supabase sender is not enough

A new project uses Supabase's built-in sender, which is meant for development
only:

- roughly a couple of messages per hour for the whole project;
- delivery restricted to addresses that belong to the project's own team;
- no delivery guarantees or bounce handling.

A failure looks like this in the dashboard or the API:

```
Error sending recovery email
```

That is the sender refusing, not a problem with the account.

## Configure a real sender (one-time, ~10 minutes)

1. Create an account with an email provider that offers SMTP. Any of these work
   and have a free tier: Resend, Brevo, Mailgun, SendGrid. A Gmail account with
   an app password also works for a small school.
2. Verify the sending domain, or use the address the provider gives you.
3. Supabase dashboard → **Project Settings → Authentication → SMTP Settings** →
   enable custom SMTP and fill in:

   | Field | Value |
   | --- | --- |
   | Sender email | the verified address, e.g. `no-reply@school.tj` |
   | Sender name | the school's name |
   | Host / Port | from the provider (commonly 587 with STARTTLS) |
   | Username / Password | from the provider |

4. Supabase dashboard → **Authentication → Rate limits** → raise the email limit
   (the default of a few per hour is the development cap).
5. **Authentication → Email Templates**: the confirmation and recovery templates
   must contain `{{ .Token }}`, because the portal asks for a six-digit code
   rather than a link.
6. **Authentication → Providers → Email → Email OTP Length** must be **6**.
   The length is the project's setting, not the code's: a project left on 8
   sends eight digits under a screen that promises six. `npm run portal:setup`
   sets it (and checks it) with a Supabase personal access token. The form
   still accepts 6–10 digits, so nobody is locked out while the setting is
   being changed.
7. **Authentication → URL Configuration**: Site URL and the redirect list must
   match the deployed address, including `/auth/callback`, `/auth/confirm` and
   `/verify`.

Check it by asking for a recovery code at `/login → forgot password`: the code
should arrive within a minute.

## Codes landing in spam

A message goes to spam when the receiving server cannot confirm it came from
the address it claims. The usual cause here: the From address is a
`@gmail.com` (or any other) address, but the message is sent by a different
company's server (Brevo, Resend, SendGrid…) that the address's owner never
authorised. SPF and DKIM then fail, and Gmail files it as spam however good
the text is.

Two fixes, either is enough:

1. **Send through the account itself** (no domain needed). With a Gmail
   account — the school's `…@gmail.com` — create an *app password* (Google
   Account → Security → 2-Step Verification → App passwords) and put in
   Supabase → Authentication → SMTP Settings:

   | Field | Value |
   | --- | --- |
   | Sender email | the Gmail address itself |
   | Sender name | `МТМУ №7` |
   | Host / Port | `smtp.gmail.com` / `465` |
   | Username | the Gmail address |
   | Password | the 16-letter app password |

   Gmail allows about 500 messages a day from one account, plenty for sign-in
   codes. Google signs every message, so it lands in the inbox.

2. **Own a domain** (e.g. `mtmu7.tj`) and verify it with the SMTP provider:
   add its SPF, DKIM and DMARC records to the domain's DNS, and send from
   `no-reply@` that domain.

`npm run portal:setup` does option 1 end to end — it asks for the address and
the app password and also installs the spam-safe templates and subjects from
`scripts/setup/email-templates.mts` (no links, no images, the code in the
subject). By hand, the same templates are in `email-templates.html`.

If a message still lands in spam once: open it and press **Not spam**. Gmail
learns per sender, and the next ones arrive in the inbox.

## When nobody can receive email yet

An operator with the service-role key can set a password directly:

```bash
node scripts/admin/set-user-password.mts person@example.com
```

The password is typed at the prompt, is not echoed, is not part of the command
line, and is never written anywhere. Use it to restore access to an
administrator account, then fix SMTP so the normal flow works for everyone else.
