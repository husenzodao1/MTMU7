import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { WhatsAppIcon } from "@/components/site/social-icons";

/**
 * WhatsApp opens on its own, outside the portal: in a new tab on a computer,
 * in WhatsApp itself on a phone (the app hands wa.me links to the phone).
 */
const outside = { target: "_blank", rel: "noopener noreferrer", "data-instant": "off" } as const;

/** The bare mark at the end of a person's row: a press opens a chat with them in WhatsApp. */
export function WhatsAppButton({ href, name }: { href: string; name: string }) {
  const t = useTranslations("portal.people");
  return (
    <a href={href} {...outside} className="wa-button" aria-label={t("whatsappTo", { name })} title={t("whatsapp")}>
      <WhatsAppIcon className="size-[1.125rem]" />
    </a>
  );
}

/** +992 92 947 5028: the number as it is read, under the words on a profile. */
function spaced(link: string): string {
  const digits = link.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("992")) return `+992 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits}`;
}

/** On a profile: "Contact on WhatsApp", with the mark and the number. */
export function WhatsAppBox({ href, name }: { href: string; name: string }) {
  const t = useTranslations("portal.people");
  return (
    <a href={href} {...outside} className="wa-box" aria-label={t("whatsappTo", { name })}>
      <span className="wa-box-mark" aria-hidden>
        <WhatsAppIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{t("contact")}</span>
        <span className="tabular block text-xs text-ink-muted" dir="ltr">
          {spaced(href)}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-muted rtl:rotate-180" aria-hidden />
    </a>
  );
}
