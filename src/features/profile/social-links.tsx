import { PlatformIcon } from "@/components/ui/platform-icon";
import { accountLabel, accountUrl, platformName, type SocialAccount } from "@/lib/social/accounts";
import { cn } from "@/lib/utils/cn";

/**
 * A person's accounts elsewhere, on their profile: each service's mark and
 * name, and the account under it, opening the account on its service
 * (styled as the links in news, globals.css .content-link).
 */
export function SocialLinks({ accounts, className }: { accounts: SocialAccount[]; className?: string }) {
  if (accounts.length === 0) return null;
  return (
    <ul className={cn("social-links", className)}>
      {accounts.map((account) => (
        <li key={account.platform}>
          <a
            href={accountUrl(account)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            data-instant="off"
            className="social-link"
            data-platform={account.platform}
            title={accountUrl(account)}
          >
            <span className="social-link-badge" aria-hidden>
              <PlatformIcon platform={account.platform} className="social-link-glyph" />
            </span>
            <span className="social-link-body">
              <span className="social-link-name">{platformName(account.platform)}</span>
              <span className="social-link-handle" dir="ltr">
                {accountLabel(account)}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
