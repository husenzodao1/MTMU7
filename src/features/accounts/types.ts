/**
 * The shapes the account block reads and writes, shared by the admin area and
 * the homeroom teacher's own class. The database is the authority on every
 * one of them (migration 00072); these only name what it hands back.
 */

export const ACCOUNT_KINDS = ["student", "teacher", "director", "vice_principal", "librarian", "staff", "parent", "admin"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** The filter chips, in the order they are shown. */
export const ACCOUNT_CATEGORIES = ["all", "students", "teachers", "directors", "parents", "admins", "staff", "hidden"] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

/** What the database calls each kind of account in its counts. */
export const CATEGORY_OF_ROW: Record<Exclude<AccountCategory, "all">, string> = {
  students: "student",
  teachers: "teacher",
  directors: "director",
  parents: "parent",
  admins: "admin",
  staff: "staff",
  // Not a kind: the accounts hidden from every other tab (00078).
  hidden: "hidden",
};

export const CLASS_POSITIONS = ["monitor", "assistant_monitor", "cleanliness", "studies", "culture", "sports", "health", "press"] as const;
export type ClassPosition = (typeof CLASS_POSITIONS)[number];

export const RELATIONSHIPS = ["mother", "father", "guardian", "grandparent", "sibling", "other"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export interface RoleName {
  slug: string;
  name_tg: string;
  name_ru: string | null;
  name_en: string | null;
}

export interface AccountRow {
  id: string;
  public_id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  status: string;
  is_active: boolean;
  /** On the hidden tab only (00078). */
  hidden?: boolean;
  credentials_issued_at: string | null;
  last_login_at: string | null;
  category: string;
  class_id: string | null;
  class_name: string | null;
  grade_level: number | null;
  roles: RoleName[];
  homeroom: string | null;
  children: string | null;
  parents: number | null;
  telegram: number | null;
  positions: ClassPosition[];
}

export interface AccountDirectory {
  total: number;
  counts: Record<string, number>;
  scope: "school" | "homeroom";
  rows: AccountRow[];
}

export interface GuardianLink {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  relationship: Relationship;
  is_primary: boolean;
  user_id: string | null;
}

export interface AccountDetails {
  id: string;
  public_id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | null;
  status: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  credentials_issued_at: string | null;
  category: string;
  is_self: boolean;
  can_edit: boolean;
  mfa: boolean;
  roles: Array<RoleName & { id: string; level: number }>;
  student: null | {
    id: string;
    student_number: string | null;
    address: string | null;
    class_id: string | null;
    class_name: string | null;
    grade_level: number | null;
    parent_required: boolean;
    parent_managed: boolean;
    positions: ClassPosition[];
    telegram: number;
    guardians: GuardianLink[];
  };
  staff: null | {
    id: string;
    employee_number: string | null;
    staff_type: string;
    position: string | null;
    qualification: string | null;
    hire_date: string | null;
    homeroom_class_id: string | null;
    homeroom_class_name: string | null;
    subjects: string[];
  };
  guardian: null | {
    id: string;
    children: Array<{ student_id: string; first_name: string; last_name: string; relationship: Relationship; class_name: string | null }>;
  };
}

/** A parent written into the pupil's form: one already known, or a new one. */
export interface GuardianInput {
  id?: string;
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  phone?: string;
  relationship: Relationship;
}

export interface AccountInput {
  kind: AccountKind;
  last_name: string;
  first_name: string;
  middle_name?: string;
  nickname?: string;
  date_of_birth?: string;
  gender?: "male" | "female" | "";
  phone?: string;
  email?: string;
  student?: {
    class_id: string;
    student_number?: string;
    address?: string;
    positions: ClassPosition[];
    guardians: GuardianInput[];
  };
  staff?: {
    employee_number?: string;
    position?: string;
    qualification?: string;
    hire_date?: string;
    homeroom_class_id?: string;
  };
  parent?: { children: string[]; relationship: Relationship };
}

export interface IssuedLogin {
  userId: string;
  login: string;
  /** Only when one was just issued; shown once and never stored. */
  password: string | null;
  created: boolean;
}

/** The kind a saved account is edited as, from the category the database gave it. */
export function kindFromDetails(details: Pick<AccountDetails, "category" | "roles">): AccountKind {
  switch (details.category) {
    case "admin":
      return "admin";
    case "director":
      return details.roles.some((r) => r.slug === "director") ? "director" : "vice_principal";
    case "teacher":
      return "teacher";
    case "student":
      return "student";
    case "parent":
      return "parent";
    default:
      return details.roles.some((r) => r.slug === "librarian") ? "librarian" : "staff";
  }
}
