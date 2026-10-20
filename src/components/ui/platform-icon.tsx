import { FileText, FolderOpen, Link2, MapPin, Video } from "lucide-react";
import { InstagramIcon, TelegramIcon, WhatsAppIcon, XIcon } from "@/components/site/social-icons";
import type { Platform } from "@/lib/social/platforms";

/**
 * Each service's mark, filled, on the 24-unit grid of social-icons.tsx (where
 * Telegram, Instagram, WhatsApp and X already are), reduced to the shape that
 * makes it recognisable at sixteen pixels. Google's tools and Zoom take the
 * portal's own line icons: their marks are colour, not shape.
 */

type Props = { className?: string };
const box = "0 0 24 24";

function YouTubeIcon({ className }: Props) {
  return (
    <svg viewBox={box} fill="currentColor" aria-hidden className={className}>
      <path
        fillRule="evenodd"
        d="M21.58 7.19a2.5 2.5 0 0 0-1.76-1.77C18.26 5 12 5 12 5s-6.26 0-7.82.42A2.5 2.5 0 0 0 2.42 7.2C2 8.75 2 12 2 12s0 3.25.42 4.81a2.5 2.5 0 0 0 1.76 1.77C5.74 19 12 19 12 19s6.26 0 7.82-.42a2.5 2.5 0 0 0 1.76-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81ZM10 15.02V8.98L15.2 12 10 15.02Z"
      />
    </svg>
  );
}

function TikTokIcon({ className }: Props) {
  return (
    <svg viewBox={box} fill="currentColor" aria-hidden className={className}>
      <path d="M16.7 2.5c.3 2.3 1.6 3.8 3.8 4v2.7a6.9 6.9 0 0 1-3.75-1.2v6.4a5.85 5.85 0 1 1-5.85-5.85c.3 0 .62.03.92.08v2.8a3.1 3.1 0 1 0 2.18 2.97V2.5h2.7Z" />
    </svg>
  );
}

function FacebookIcon({ className }: Props) {
  return (
    <svg viewBox={box} fill="currentColor" aria-hidden className={className}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.79 8.43-4.94 8.43-9.94Z" />
    </svg>
  );
}

function SnapchatIcon({ className }: Props) {
  return (
    <svg viewBox={box} fill="currentColor" aria-hidden className={className}>
      <path d="M12.06 2.5c2.9 0 5.13 2.27 5.13 5.2l-.04 2.2c.42.2.95.06 1.38-.1.66-.23 1.18.55.62.97-.5.37-1.3.62-1.8.88-.35.2-.37.5-.18.9.92 1.78 2.25 2.88 3.98 3.3.38.1.4.6.04.78-.6.3-1.36.4-1.98.5-.2.3-.2.94-.5 1.14-.58.24-1.58-.08-2.5.12-.9.2-1.8 1.36-4.15 1.36s-3.27-1.16-4.17-1.36c-.92-.2-1.92.12-2.5-.12-.3-.2-.3-.84-.5-1.14-.62-.1-1.38-.2-1.98-.5-.36-.18-.34-.68.04-.78 1.73-.42 3.06-1.52 3.98-3.3.2-.4.17-.7-.18-.9-.5-.26-1.3-.51-1.8-.88-.56-.42-.04-1.2.62-.97.43.16.96.3 1.38.1l-.04-2.2c0-2.93 2.25-5.2 5.15-5.2Z" />
    </svg>
  );
}

function VkIcon({ className }: Props) {
  return (
    <svg viewBox={box} fill="currentColor" aria-hidden className={className}>
      <path d="M12.9 18c-6.03 0-9.47-4.13-9.61-11h3.02c.1 5.04 2.32 7.18 4.08 7.62V7h2.85v4.35c1.74-.19 3.57-2.17 4.19-4.35h2.84a8.4 8.4 0 0 1-3.86 5.48A8.7 8.7 0 0 1 20.9 18h-3.13c-.67-2.1-2.36-3.72-4.57-3.94V18h-.3Z" />
    </svg>
  );
}

function OkIcon({ className }: Props) {
  return (
    <svg viewBox={box} fill="currentColor" aria-hidden className={className}>
      <path d="M12 3a4.4 4.4 0 1 1 0 8.8A4.4 4.4 0 0 1 12 3Zm0 2.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Zm4.7 7.7c.5.6.38 1.47-.25 1.88-.8.52-1.72.88-2.66 1.08l2.56 2.56a1.25 1.25 0 1 1-1.77 1.77L12 17.92l-2.58 2.57a1.25 1.25 0 1 1-1.77-1.77l2.56-2.56a8.2 8.2 0 0 1-2.66-1.08 1.3 1.3 0 0 1-.25-1.88c.43-.52 1.2-.6 1.76-.2a4.9 4.9 0 0 0 5.88 0c.56-.4 1.33-.32 1.76.2Z" />
    </svg>
  );
}

function LinkedInIcon({ className }: Props) {
  return (
    <svg viewBox={box} fill="currentColor" aria-hidden className={className}>
      <path d="M5.05 3.5a2.05 2.05 0 1 1 0 4.1 2.05 2.05 0 0 1 0-4.1ZM3.3 9h3.5v11.5H3.3V9Zm5.9 0h3.36v1.57h.05c.47-.88 1.61-1.82 3.32-1.82 3.55 0 4.2 2.34 4.2 5.37v6.38h-3.5v-5.66c0-1.35-.02-3.08-1.88-3.08-1.88 0-2.17 1.47-2.17 2.98v5.76H9.2V9Z" />
    </svg>
  );
}

const ICON: Record<Platform, (props: Props) => React.ReactElement> = {
  telegram: TelegramIcon,
  instagram: InstagramIcon,
  whatsapp: WhatsAppIcon,
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  facebook: FacebookIcon,
  snapchat: SnapchatIcon,
  x: XIcon,
  vk: VkIcon,
  ok: OkIcon,
  linkedin: LinkedInIcon,
  docs: ({ className }) => <FileText className={className} aria-hidden />,
  drive: ({ className }) => <FolderOpen className={className} aria-hidden />,
  maps: ({ className }) => <MapPin className={className} aria-hidden />,
  meet: ({ className }) => <Video className={className} aria-hidden />,
  zoom: ({ className }) => <Video className={className} aria-hidden />,
};

/** The service's mark; a plain link's for any other site. */
export function PlatformIcon({ platform, className }: { platform: Platform | null; className?: string }) {
  if (!platform) return <Link2 className={className} aria-hidden />;
  const Icon = ICON[platform];
  return <Icon className={className} />;
}
