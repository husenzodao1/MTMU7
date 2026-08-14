interface AboutSectionProps {
  title: string;
  body: string;
}

export function AboutSection({ title, body }: AboutSectionProps) {
  return (
    <section className="py-16 sm:py-20" id="about">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <div className="mt-6 whitespace-pre-line text-neutral-600 leading-relaxed">
          {body}
        </div>
      </div>
    </section>
  );
}
