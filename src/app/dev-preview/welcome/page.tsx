import { notFound } from "next/navigation";
import { BookScene } from "@/features/intro/book-scene";

/** The welcome on its own, for looking at frame by frame. Development only. */
export default async function WelcomePreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  return (
    <div className="intro intro-welcome" data-play="">
      <BookScene hello={params.hello ?? "Салом"} name={params.name ?? "Фарангис"} waiting={params.wait === "1"} />
    </div>
  );
}
