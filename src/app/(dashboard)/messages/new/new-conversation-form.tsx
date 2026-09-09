"use client";

import { useState, useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import { searchContacts, createDirectConversation, createGroupConversation } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, Users, User, X, ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roleName: string;
}

export function NewConversationForm() {
  const t = useTranslations("messages");
  const [mode, setMode] = useState<"select" | "direct" | "group">("select");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Contact[]>([]);
  const [groupName, setGroupName] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (value.length < 2) { setContacts([]); return; }
    setIsSearching(true);
    const results = await searchContacts(value);
    setContacts(results);
    setIsSearching(false);
  }, []);

  const toggleMember = (contact: Contact) => {
    setSelectedMembers((prev) =>
      prev.find((m) => m.id === contact.id)
        ? prev.filter((m) => m.id !== contact.id)
        : [...prev, contact]
    );
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    startTransition(async () => {
      await createGroupConversation(selectedMembers.map((m) => m.id), groupName);
    });
  };

  if (mode === "select") {
    return (
      <div className="mx-auto max-w-md space-y-4 px-1">
        <div className="flex items-center gap-3">
          <Link href="/messages">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-bold text-neutral-900">{t("newConversation")}</h1>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("direct")}
            className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <User className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-neutral-800">{t("direct")}</span>
          </button>
          <button
            onClick={() => setMode("group")}
            className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
              <Users className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-neutral-800">{t("group")}</span>
          </button>
        </div>
      </div>
    );
  }

  if (mode === "direct") {
    return (
      <div className="mx-auto max-w-md space-y-4 px-1">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode("select")}>
            <Button variant="ghost" size="icon-sm" asChild={false}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </button>
          <h1 className="text-lg font-bold text-neutral-900">{t("direct")}</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("searchUsers")}
            autoFocus
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-indigo-300 focus:bg-white focus:ring-1 focus:ring-indigo-100"
          />
        </div>

        <div className="space-y-1">
          {isSearching && (
            <div className="py-6 text-center text-sm text-neutral-400">...</div>
          )}
          {contacts.map((contact) => (
            <form key={contact.id} action={createDirectConversation.bind(null, contact.id)}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100"
              >
                <Avatar fallback={`${contact.firstName.charAt(0)}${contact.lastName.charAt(0)}`} src={contact.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-800">{contact.firstName} {contact.lastName}</p>
                  {contact.roleName && <p className="text-xs text-neutral-400">{contact.roleName}</p>}
                </div>
              </button>
            </form>
          ))}
          {query.length >= 2 && !isSearching && contacts.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-400">{t("noResults")}</p>
          )}
        </div>
      </div>
    );
  }

  // Group mode
  return (
    <div className="mx-auto max-w-md space-y-4 px-1">
      <div className="flex items-center gap-3">
        <button onClick={() => { setMode("select"); setSelectedMembers([]); setGroupName(""); }}>
          <Button variant="ghost" size="icon-sm" asChild={false}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </button>
        <h1 className="text-lg font-bold text-neutral-900">{t("group")}</h1>
      </div>

      {/* Group name */}
      <input
        type="text"
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
        placeholder={t("newConversation")}
        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium outline-none transition-all focus:border-indigo-300 focus:bg-white focus:ring-1 focus:ring-indigo-100"
      />

      {/* Selected members chips */}
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedMembers.map((m) => (
            <span
              key={m.id}
              className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"
            >
              {m.firstName} {m.lastName}
              <button onClick={() => toggleMember(m)} type="button">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t("searchUsers")}
          autoFocus
          className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-indigo-300 focus:bg-white focus:ring-1 focus:ring-indigo-100"
        />
      </div>

      <div className="space-y-1">
        {isSearching && (
          <div className="py-4 text-center text-sm text-neutral-400">...</div>
        )}
        {contacts.map((contact) => {
          const isSelected = selectedMembers.some((m) => m.id === contact.id);
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => toggleMember(contact)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-neutral-50"
            >
              <Avatar fallback={`${contact.firstName.charAt(0)}${contact.lastName.charAt(0)}`} src={contact.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-800">{contact.firstName} {contact.lastName}</p>
                {contact.roleName && <p className="text-xs text-neutral-400">{contact.roleName}</p>}
              </div>
              <span className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                isSelected ? "border-indigo-500 bg-indigo-500" : "border-neutral-300 bg-white"
              )}>
                {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
              </span>
            </button>
          );
        })}
        {query.length >= 2 && !isSearching && contacts.length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-400">{t("noResults")}</p>
        )}
      </div>

      {/* Create button */}
      <Button
        onClick={handleCreateGroup}
        disabled={isPending || !groupName.trim() || selectedMembers.length === 0}
        loading={isPending}
        className="w-full rounded-2xl"
      >
        <Users className="mr-2 h-4 w-4" />
        {t("group")} ({selectedMembers.length})
      </Button>
    </div>
  );
}
