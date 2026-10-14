import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface Face {
  id: string;
  /** First name and the initial of the surname. */
  name: string;
  avatar: string | null;
  /** Their profile is at /u/<nickname>, when they chose one. */
  nickname: string | null;
  /** The class of a pupil, the year of a graduate. */
  detail: string | null;
}

export interface SchoolFaces {
  active: Face[];
  graduates: Face[];
  counts: { active: number; graduates: number };
}

/** The pupils and graduates the dashboard's ribbons show (school_faces, 00079). */
export async function getSchoolFaces(limit = 24): Promise<SchoolFaces | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("school_faces", { p_limit: limit });
  if (error || !data) return null;
  const faces = data as unknown as SchoolFaces;
  return {
    active: Array.isArray(faces.active) ? faces.active : [],
    graduates: Array.isArray(faces.graduates) ? faces.graduates : [],
    counts: { active: Number(faces.counts?.active ?? 0), graduates: Number(faces.counts?.graduates ?? 0) },
  };
}
