import { Mail, Phone, MapPin } from "lucide-react";

interface ContactsSectionProps {
  title: string;
  body: string;
  school: {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
}

export function ContactsSection({ title, body, school }: ContactsSectionProps) {
  return (
    <section className="py-16 sm:py-20" id="contacts">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <p className="mt-4 text-neutral-600">{body}</p>
        <div className="mt-8 space-y-4">
          {school.address && (
            <div className="flex items-center gap-3 text-neutral-700">
              <MapPin className="h-5 w-5 shrink-0 text-neutral-400" />
              <span>{school.address}</span>
            </div>
          )}
          {school.phone && (
            <div className="flex items-center gap-3 text-neutral-700">
              <Phone className="h-5 w-5 shrink-0 text-neutral-400" />
              <a href={`tel:${school.phone}`} className="hover:text-primary-600">{school.phone}</a>
            </div>
          )}
          {school.email && (
            <div className="flex items-center gap-3 text-neutral-700">
              <Mail className="h-5 w-5 shrink-0 text-neutral-400" />
              <a href={`mailto:${school.email}`} className="hover:text-primary-600">{school.email}</a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
