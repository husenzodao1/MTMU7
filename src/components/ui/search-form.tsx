"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { SearchingPanel, useLingering } from "@/components/ui/searching";

/**
 * A search box that sends ?q= to its own page without leaving it: the
 * results arrive in place, and the magnifying glass searches meanwhile
 * (searching.tsx).
 */
export function SearchForm({
  label,
  placeholder,
  submitLabel,
  searchingLabel,
  defaultValue,
  autoFocus,
}: {
  label: string;
  placeholder?: string;
  submitLabel: string;
  searchingLabel: string;
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const searching = useLingering(pending);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    startTransition(() => router.push(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname));
  };

  return (
    <div className="filter-bar mb-6" data-searching={searching || undefined}>
      <form role="search" onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <TextField name="q" label={label} defaultValue={defaultValue} maxLength={100} autoFocus={autoFocus} placeholder={placeholder} className="min-w-64 flex-1" />
        <Button type="submit">{submitLabel}</Button>
      </form>
      {searching ? <SearchingPanel label={searchingLabel} /> : null}
    </div>
  );
}
