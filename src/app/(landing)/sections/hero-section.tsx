import { Button } from "@/components/ui/button";
import Link from "next/link";

interface HeroSectionProps {
  title: string;
  description: string;
  imageUrl?: string | null;
  ctaText: string;
}

export function HeroSection({ title, description, imageUrl, ctaText }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 to-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl animate-in">
              {title}
            </h1>
            <p className="text-lg text-neutral-600 animate-in" style={{ animationDelay: "100ms" }}>
              {description}
            </p>
            <div className="animate-in" style={{ animationDelay: "200ms" }}>
              <Link href="/register">
                <Button size="lg" className="press-scale">
                  {ctaText}
                </Button>
              </Link>
            </div>
          </div>
          {imageUrl && (
            <div className="animate-in" style={{ animationDelay: "150ms" }}>
              <img
                src={imageUrl}
                alt={title}
                className="rounded-2xl shadow-xl w-full object-cover aspect-[4/3]"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
