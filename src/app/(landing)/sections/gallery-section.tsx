interface GallerySectionProps {
  title: string;
  images: Array<{ url: string; alt?: string }>;
}

export function GallerySection({ title, images }: GallerySectionProps) {
  if (images.length === 0) return null;

  return (
    <section className="bg-neutral-50 py-16 sm:py-20" id="gallery">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <div
              key={i}
              className="aspect-square overflow-hidden rounded-xl animate-list-item"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <img
                src={img.url}
                alt={img.alt ?? ""}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
