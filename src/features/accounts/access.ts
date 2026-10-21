import "server-only";
import { can, hasRole, isPlatformAdmin, type Access } from "@/lib/auth/access";
import type { AccountKind } from "@/features/accounts/types";

/**
 * The kinds of account this person may make, for the form to offer. Only an
 * offer: the database refuses anything outside what they may do regardless.
 */
export function allowedKinds(access: Access, mode: "school" | "homeroom"): AccountKind[] {
  if (mode === "homeroom") return ["student"];
  // A pupil is added by their class teacher (My class) or by the pupils'
  // workbook, and a parent only by that workbook, beside their child (00088):
  // the office's form makes staff and administrators.
  const kinds: AccountKind[] = [];
  const accounts = can(access, "users.update");
  if (accounts && can(access, "staff.create")) kinds.push("teacher", "director", "vice_principal", "librarian", "staff");
  if (hasRole(access, "admin") || isPlatformAdmin(access)) kinds.push("admin");
  return kinds;
}
