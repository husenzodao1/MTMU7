"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/session";
import { forgetNativeToken } from "@/features/native/bridge";
import { forgetWebPush } from "@/features/push/client";
import { forgetChat } from "@/lib/chat-leftovers";
import { forgetKeptPages } from "@/lib/kept-pages";

/**
 * Signing out, from the foot of Settings: at once, whatever the network, the
 * page dims and says it is on its way out (html[data-leaving], globals.css);
 * this phone or browser stops getting this person's notifications and lets go
 * of the pages it kept (a second or two at most); then the session ends.
 */
export function SignOutButton({ label }: { label: string }) {
  return (
    <form
      action={async () => {
        document.documentElement.setAttribute("data-leaving", "");
        await Promise.all([forgetNativeToken(), forgetWebPush(), forgetKeptPages(), forgetChat()]);
        await signOutAction();
      }}
    >
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger-600/30 bg-surface px-4 py-3 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-50"
      >
        <LogOut className="size-4" aria-hidden />
        {label}
      </button>
    </form>
  );
}
