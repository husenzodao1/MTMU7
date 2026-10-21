import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * The office's own words for the forms and wizards under it. Every other page
 * is sent without them (layout.tsx, withoutOffice) — they are nearly half of
 * all the portal's words, and a pupil or a parent never sees one of them.
 */
export async function OfficeWords({ children }: { children: ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
