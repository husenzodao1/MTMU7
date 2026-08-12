import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ErrorStateProps {
  title: string;
  description?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
  }>;
  showCharacters?: boolean;
  className?: string;
}

function PlayfulCharacters() {
  return (
    <div className="mb-6 flex items-end justify-center gap-1">
      {/* Character 1 - confused */}
      <svg width="48" height="56" viewBox="0 0 48 56" fill="none" className="animate-in" style={{ animationDelay: "100ms" }}>
        <rect x="8" y="16" width="32" height="32" rx="8" fill="var(--color-primary-200)" />
        <circle cx="18" cy="30" r="3" fill="var(--color-primary-700)" />
        <circle cx="30" cy="30" r="3" fill="var(--color-primary-700)" />
        <path d="M18 38 C22 36 26 36 30 38" stroke="var(--color-primary-700)" strokeWidth="2" strokeLinecap="round" />
        <text x="24" y="10" textAnchor="middle" fontSize="14">?</text>
      </svg>
      {/* Character 2 - panicking */}
      <svg width="48" height="56" viewBox="0 0 48 56" fill="none" className="animate-in" style={{ animationDelay: "250ms" }}>
        <rect x="8" y="16" width="32" height="32" rx="8" fill="var(--color-warning-500)" opacity="0.3" />
        <circle cx="16" cy="30" r="4" fill="var(--color-neutral-700)" />
        <circle cx="32" cy="30" r="4" fill="var(--color-neutral-700)" />
        <ellipse cx="24" cy="40" rx="4" ry="3" fill="var(--color-neutral-700)" />
        <line x1="10" y1="12" x2="14" y2="18" stroke="var(--color-neutral-400)" strokeWidth="2" strokeLinecap="round" />
        <line x1="38" y1="12" x2="34" y2="18" stroke="var(--color-neutral-400)" strokeWidth="2" strokeLinecap="round" />
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
    <div className={cn("flex flex-col items-center justify-center py-12 text-center animate-in", className)}>
      {showCharacters && <PlayfulCharacters />}
      <h3 className="text-lg font-medium text-neutral-800">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-neutral-500">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-6 flex gap-3">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant ?? (i === 0 ? "default" : "outline")}
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
