import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-48 rounded-full" />
        <Skeleton className="h-4 w-64" />
      </div>
      {/* Hero card skeleton */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="rounded-[28px] bg-neutral-100/80 p-8 lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-10 w-48 rounded-xl" />
          </div>
          <div className="grid grid-cols-4 gap-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="h-3 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-[22px] border border-neutral-200/70 bg-white p-5">
              <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-20 rounded-full" />
                <Skeleton className="h-7 w-12 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
