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
6. **Authentication → URL Configuration**: Site URL and the redirect list must
   match the deployed address, including `/auth/callback`, `/auth/confirm` and
   `/verify`.

Check it by asking for a recovery code at `/login → forgot password`: the code
should arrive within a minute.

## When nobody can receive email yet

An operator with the service-role key can set a password directly:

```bash
node scripts/admin/set-user-password.mts person@example.com
```

The password is typed at the prompt, is not echoed, is not part of the command
line, and is never written anywhere. Use it to restore access to an
administrator account, then fix SMTP so the normal flow works for everyone else.
