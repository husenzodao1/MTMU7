import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in">
      <Skeleton className="h-8 w-36" />
      <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
        <Skeleton className="h-5 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-lg" />
          <Skeleton className="h-11 flex-1 rounded-lg" />
        </div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
        <Skeleton className="h-5 w-44" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
