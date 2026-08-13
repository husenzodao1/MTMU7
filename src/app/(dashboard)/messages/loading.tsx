import { Skeleton } from "@/components/ui/skeleton";

export default function MessagesLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white animate-in">
      <div className="flex w-full flex-col border-r border-neutral-200 lg:w-80 xl:w-96">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="flex-1 space-y-1 p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg p-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden flex-1 items-center justify-center lg:flex">
        <Skeleton className="h-16 w-48" />
      </div>
    </div>
  );
}
