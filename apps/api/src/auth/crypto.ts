import {
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString("hex")
  };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const candidate = Buffer.from(hashPassword(password, salt).hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
