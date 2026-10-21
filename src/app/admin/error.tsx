"use client";

import { RouteError } from "@/components/ui/route-error";

/** A failing page in the admin centre keeps the admin menu around it. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} home="/admin" />;
}
