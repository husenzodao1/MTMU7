"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { searchContacts, createDirectConversation } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, MessageSquare } from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roleName: string;
}

export function NewConversationForm() {
  const t = useTranslations("messages");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (value.length < 2) {
      setContacts([]);
      return;
    }
    setIsSearching(true);
    const results = await searchContacts(value);
    setContacts(results);
    setIsSearching(false);
  }, []);

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {t("newConversation")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("searchUsers")}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-colors duration-[var(--duration-fast)] focus:border-primary-300 focus:bg-white"
          />
        </div>

        {isSearching && (
          <div className="py-4 text-center text-sm text-neutral-400">
            {t("searchUsers")}...
          </div>
        )}

        <div className="space-y-1">
          {contacts.map((contact) => (
            <form
              key={contact.id}
              action={createDirectConversation.bind(null, contact.id)}
            >
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50"
              >
                <Avatar
                  fallback={`${contact.firstName.charAt(0)}${contact.lastName.charAt(0)}`}
                  src={contact.avatarUrl}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-800">
                    {contact.firstName} {contact.lastName}
                  </p>
                  {contact.roleName && (
                    <p className="text-xs text-neutral-400">
                      {contact.roleName}
                    </p>
                  )}
                </div>
              </button>
            </form>
          ))}
        </div>

        {query.length >= 2 && !isSearching && contacts.length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-400">
            {t("noConversations")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
