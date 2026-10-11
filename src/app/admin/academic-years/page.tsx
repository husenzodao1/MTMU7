import { redirect } from "next/navigation";

/**
 * The school year runs itself now (00086): it is named and turned over from
 * the date, and its quarters are columns the teacher writes in the journal on
 * the day. There is nothing left to set up here, so an old link to this page
 * lands on the classes, where the year is shown.
 */
export default function AcademicYearsPage() {
  redirect("/admin/classes");
}
