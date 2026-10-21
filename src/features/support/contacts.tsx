import { getTranslations } from "next-intl/server";
import { Phone } from "lucide-react";
import { TelegramIcon, WhatsAppIcon } from "@/components/site/social-icons";
import { getAuthSchool } from "@/lib/site/auth-school";
import { PLATFORM_PHONE, resolveContacts } from "@/lib/site/contacts";

/** The desk where it already is: WhatsApp, Telegram, a call. */
export async function SupportContacts({ className }: { className?: string }) {
  const t = await getTranslations("common.support");
  const school = await getAuthSchool();
  const contacts = resolveContacts(school?.socialLinks);
  const item = "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted";
  return (
    <div className={`grid grid-cols-3 gap-2 ${className ?? ""}`}>
      <a href={contacts.whatsapp} target="_blank" rel="noopener noreferrer" data-instant="off" className={item}>
        <WhatsAppIcon className="size-5 text-[#25d366]" />
        WhatsApp
      </a>
      <a href={contacts.telegram} target="_blank" rel="noopener noreferrer" data-instant="off" className={item}>
        <TelegramIcon className="size-5 text-[#229ed9]" />
        Telegram
      </a>
      <a href={`tel:${(school?.phone ?? PLATFORM_PHONE).replace(/[^\d+]/g, "")}`} data-instant="off" className={item}>
        <Phone className="size-5 text-brand-text" aria-hidden />
        {t("call")}
      </a>
    </div>
  );
}
