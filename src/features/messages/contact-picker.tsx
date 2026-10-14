"use client";

import { Check, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { Input } from "@/components/ui/form-controls";
import { Avatar } from "@/components/ui/misc";
import { searchContactsAction } from "@/features/messages/actions";
import type { ContactResult } from "@/features/messages/types";
import { pickName, type Locale } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";

/**
 * Searches people the current user may message (server-side child-safety
 * rules apply). Single mode calls onPick; multiple mode toggles selection.
 */
export function ContactPicker({
  selected,
  onToggle,
  multiple,
  excludeIds = [],
}: {
  selected: ContactResult[];
  onToggle: (contact: ContactResult) => void;
  multiple: boolean;
  excludeIds?: string[];
}) {
  const t = useTranslations("portal.messages");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const result = await searchContactsAction(term);
        setResults(result.ok ? (result.data ?? []) : []);
        setSearched(true);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const visible = query.trim().length >= 2 ? results.filter((r) => !excludeIds.includes(r.id)) : [];
  const selectedIds = new Set(selected.map((s) => s.id));

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
          {t("searchPeople")}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setSearched(false);
            }}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
            maxLength={60}
            autoComplete="off"
            aria-describedby={`${inputId}-hint`}
          />
        </div>
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-ink-muted">{t("searchHint")}</p>
      </div>

      <div aria-live="polite" aria-busy={pending}>
        {pending && visible.length === 0 ? <p className="py-2 text-sm text-ink-muted">{tc("loading")}</p> : null}
        {!pending && searched && visible.length === 0 && query.trim().length >= 2 ? (
          <p className="py-2 text-sm text-ink-muted">{t("noContacts")}</p>
        ) : null}
        {visible.length > 0 ? (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {visible.map((contact) => {
              const name = `${contact.last_name} ${contact.first_name}`;
              const isSelected = selectedIds.has(contact.id);
              const roles = contact.roles.map((r) => pickName(r, locale)).join(", ");
              return (
                <li key={contact.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(contact)}
                    aria-pressed={multiple ? isSelected : undefined}
                    className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-surface-muted", isSelected && "bg-brand-50")}
                  >
                    <Avatar name={name} src={contact.avatar_url} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{name}</span>
                      {roles ? <span className="block truncate text-xs text-ink-muted">{roles}</span> : null}
                    </span>
                    {multiple && isSelected ? <Check className="size-4 text-brand-text" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
