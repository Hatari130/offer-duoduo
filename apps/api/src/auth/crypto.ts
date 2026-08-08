import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  exp: number;
  scope: "user" | "device";
  deviceId?: string;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createAccessToken(
  claims: Omit<AccessTokenClaims, "exp">,
  secret: string,
  ttlSeconds: number,
  now = Date.now()
): { token: string; expiresAt: string } {
  const payload: AccessTokenClaims = {
    ...claims,
    exp: Math.floor(now / 1000) + ttlSeconds
  };
  const encoded = encode(JSON.stringify(payload));
  return {
    token: `${encoded}.${sign(encoded, secret)}`,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };
}

export function verifyAccessToken(
  token: string,
  secret: string,
  now = Date.now()
): AccessTokenClaims | undefined {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return undefined;
  const expected = sign(encoded, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return undefined;

  try {
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AccessTokenClaims;
    if (
      !claims.sub ||
      !claims.email ||
      !claims.exp ||
      !["user", "device"].includes(claims.scope) ||
      claims.exp <= Math.floor(now / 1000)
    ) {
      return undefined;
    }
    return claims;
  } catch {
    return undefined;
  }
}

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
