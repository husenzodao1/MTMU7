/**
 * The authentication emails, in one place: what `npm run portal:setup` sends
 * to Supabase, and what docs/operations/email-templates.html shows for pasting
 * by hand.
 *
 *   node scripts/setup/email-templates.mts   → rewrites the docs file
 *
 * Written to be let into the inbox, not just to look right:
 *
 * - No links and no addresses of any kind. The portal asks for a code, so a
 *   link is never needed, and a link to a shared *.vercel.app host is one of
 *   the things filters score hardest.
 * - No images. An image with no text beside it is a spam signal, and the
 *   emblem is an SVG most mail clients refuse anyway.
 * - A short hidden preheader that repeats the code, so the preview line in the
 *   inbox is the useful sentence rather than the first cell of a table.
 * - The code in the subject too: the one line a person reads, and a subject a
 *   filter recognises as a one-time code rather than a newsletter.
 * - Plain, calm words, one purpose per message, a line saying why it came.
 *
 * Deliverability itself is the sender's, not the template's: the From address
 * must be sent by a server allowed to send for its domain (SPF) and signed
 * by it (DKIM). See docs/operations/EMAIL.md.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export interface AuthEmail {
  /** The Management API's name for it: mailer_subjects_<key>, mailer_templates_<key>_content. */
  key: "confirmation" | "invite" | "magic_link" | "email_change" | "recovery" | "reauthentication";
  label: string;
  subject: string;
  html: string;
}

const FONT = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

function email(options: { title: string; lead: string; leadRu: string; why: string; token?: boolean }): string {
  const code = options.token === false ? "" : "{{ .Token }}";
  return `<!doctype html>
<html lang="tg">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${options.title}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${options.title}: ${code}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e3e6ea;border-radius:12px;">
      <tr><td style="padding:26px 26px 22px 26px;font-family:${FONT};color:#15191e;">
        <p style="margin:0 0 18px 0;font-size:13px;font-weight:600;color:#8a5a0e;">МТМУ №7</p>
        <p style="margin:0 0 6px 0;font-size:18px;font-weight:600;line-height:1.35;">${options.title}</p>
        <p style="margin:0 0 4px 0;font-size:14px;line-height:1.55;color:#454d57;">${options.lead}</p>
        <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#6b7280;">${options.leadRu}</p>
        <p style="margin:0 0 18px 0;padding:14px 0;text-align:center;background:#fdf7ea;border:1px solid #f0d9a8;border-radius:10px;font-family:Consolas,'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#15191e;">${code}</p>
        <p style="margin:0;font-size:12px;line-height:1.55;color:#6b7280;">${options.why}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const IGNORE = "Агар шумо инро напурсида бошед, ин мактубро нодида гиред. · Если вы этого не запрашивали, просто проигнорируйте письмо.";

export const AUTH_EMAILS: AuthEmail[] = [
  {
    key: "confirmation",
    label: "Confirm sign up",
    subject: "{{ .Token }} — рамзи тасдиқ · МТМУ №7",
    html: email({
      title: "Рамзи тасдиқ",
      lead: "Ин рамзро дар саҳифаи бақайдгирӣ ворид кунед. Рамз 60 дақиқа эътибор дорад.",
      leadRu: "Введите этот код на странице регистрации. Код действует 60 минут.",
      why: IGNORE,
    }),
  },
  {
    key: "invite",
    label: "Invite user",
    subject: "{{ .Token }} — даъват ба портали МТМУ №7",
    html: email({
      title: "Даъват ба портал",
      lead: "Мактаб барои шумо ҳисоб кушод. Барои фаъол кардан ин рамзро ворид кунед.",
      leadRu: "Школа открыла для вас учётную запись. Для активации введите этот код.",
      why: IGNORE,
    }),
  },
  {
    key: "magic_link",
    label: "Magic link / sign-in code",
    subject: "{{ .Token }} — рамзи воридшавӣ · МТМУ №7",
    html: email({
      title: "Рамзи воридшавӣ",
      lead: "Барои ворид шудан ба портал ин рамзро ворид кунед.",
      leadRu: "Для входа в портал введите этот код.",
      why: IGNORE,
    }),
  },
  {
    key: "email_change",
    label: "Change email address",
    subject: "{{ .Token }} — тасдиқи почтаи нав · МТМУ №7",
    html: email({
      title: "Тасдиқи почтаи нав",
      lead: "Барои гузаштан ба суроғаи нав ин рамзро ворид кунед.",
      leadRu: "Чтобы перейти на новый адрес, введите этот код.",
      why: IGNORE,
    }),
  },
  {
    key: "recovery",
    label: "Reset password",
    subject: "{{ .Token }} — барқарории парол · МТМУ №7",
    html: email({
      title: "Барқарории парол",
      lead: "Барои гузоштани пароли нав ин рамзро ворид кунед.",
      leadRu: "Чтобы задать новый пароль, введите этот код.",
      why: IGNORE,
    }),
  },
  {
    key: "reauthentication",
    label: "Reauthentication",
    subject: "{{ .Token }} — тасдиқи амал · МТМУ №7",
    html: email({
      title: "Тасдиқи амал",
      lead: "Барои тасдиқи амали муҳим ин рамзро ворид кунед.",
      leadRu: "Для подтверждения важного действия введите этот код.",
      why: IGNORE,
    }),
  },
];

/** The Management API patch that installs every subject and template. */
export function templatePatch(): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const item of AUTH_EMAILS) {
    patch[`mailer_subjects_${item.key}`] = item.subject;
    patch[`mailer_templates_${item.key}_content`] = item.html;
  }
  return patch;
}

// Run directly: rewrite the docs copy for pasting by hand.
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = join(import.meta.dirname, "..", "..", "docs", "operations", "email-templates.html");
  const sections = AUTH_EMAILS.map(
    (item, index) => `<!-- ════════════════════════════════════════════════════════════════════
     ${index + 1}. ${item.label.toUpperCase()}
     Subject: ${item.subject}
     ════════════════════════════════════════════════════════════════════ -->
${item.html}`
  );
  writeFileSync(
    out,
    `<!--
  Authentication email templates for Supabase. Generated by
  scripts/setup/email-templates.mts — edit there, not here.

  \`npm run portal:setup\` installs all of them (subjects included). To paste
  by hand: Supabase → Authentication → Emails → Templates, one block per
  template, and the subject from the comment above each block.
-->

${sections.join("\n\n")}
`,
    "utf8"
  );
  console.log(`Wrote ${out}`);
}
