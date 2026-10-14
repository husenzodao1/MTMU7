"use client";

import { useEffect } from "react";
import { letGoOfNativeToken } from "@/features/native/bridge";
import { letGoOfWebPush } from "@/features/push/client";
import { forgetChat } from "@/features/messages/forget";
import { forgetKeptPages } from "@/lib/kept-pages";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * On the sign-in pages: when nobody is signed in here, this browser or phone
 * lets go of its notifications and of the pages it kept. Signing out from the menu forgets them
 * itself (app-shell.tsx); this catches every other way a session ends — the
 * sign-in page's own "sign out", signing out elsewhere, a session that ran
 * out — so a device left signed out never shows anybody's messages.
 */
export function SignedOutDevice() {
  useEffect(() => {
    void getBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) return;
        void letGoOfWebPush();
        void letGoOfNativeToken();
        void forgetKeptPages();
        void forgetChat();
      })
      .catch(() => undefined);
  }, []);
  return null;
}
