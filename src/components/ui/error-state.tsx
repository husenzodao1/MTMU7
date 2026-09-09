import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ErrorStateProps {
  title: string;
  description?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost" | "secondary";
  }>;
  showCharacters?: boolean;
  className?: string;
}

function PlayfulCharacters() {
  return (
    <div className="mb-6 flex items-end justify-center gap-2">
      {/* Character 1 */}
      <svg width="48" height="56" viewBox="0 0 48 56" fill="none" className="animate-in" style={{ animationDelay: "100ms" }}>
        <rect x="8" y="16" width="32" height="32" rx="10" fill="#E8EEFB" stroke="#CBD5E1" strokeWidth="1.5" />
        <circle cx="18" cy="30" r="3" fill="#1E293B" />
        <circle cx="30" cy="30" r="3" fill="#1E293B" />
        <path d="M18 38 C22 35 26 35 30 38" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
        <text x="24" y="11" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#64748B">?</text>
      </svg>
      {/* Character 2 */}
      <svg width="48" height="56" viewBox="0 0 48 56" fill="none" className="animate-in" style={{ animationDelay: "250ms" }}>
        <rect x="8" y="16" width="32" height="32" rx="10" fill="#FEE2E2" stroke="#FECDD3" strokeWidth="1.5" />
        <circle cx="16" cy="30" r="3.5" fill="#991B1B" />
        <circle cx="32" cy="30" r="3.5" fill="#991B1B" />
        <ellipse cx="24" cy="40" rx="3.5" ry="2.5" fill="#991B1B" />
      </svg>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  actions,
  showCharacters = true,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[24px] border border-neutral-200/70 bg-white/80 p-10 text-center shadow-card backdrop-blur-sm animate-in",
        className
      )}
    >
      {showCharacters && <PlayfulCharacters />}
      <h3 className="text-lg font-bold tracking-tight text-neutral-900">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-neutral-500 leading-relaxed">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant ?? (i === 0 ? "default" : "outline")}
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
