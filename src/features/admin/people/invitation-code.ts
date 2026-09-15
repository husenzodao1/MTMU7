import { randomInt } from "node:crypto";
import "server-only";

// No 0/O or 1/I/L: codes are read aloud and typed from paper.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Cryptographically random 10-character invitation code (~49 bits). */
export function generateInvitationCode(length = 10): string {
  let code = "";
  for (let i = 0; i < length; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}
