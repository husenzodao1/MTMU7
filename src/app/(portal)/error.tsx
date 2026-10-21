"use client";

import { RouteError } from "@/components/ui/route-error";

/** A failing page in the portal keeps the portal's menu around it. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} home="/dashboard" />;
}
