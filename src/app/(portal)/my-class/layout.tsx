import { OfficeWords } from "@/components/office-words";

/** A class teacher's own class uses the office's forms and import wizard, and so its words. */
export default function MyClassLayout({ children }: { children: React.ReactNode }) {
  return <OfficeWords>{children}</OfficeWords>;
}
