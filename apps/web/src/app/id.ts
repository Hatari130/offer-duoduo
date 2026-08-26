type BrowserCrypto = Pick<Crypto, "getRandomValues"> & {
  randomUUID?: () => string;
};

/**
 * Generates an RFC 4122 version 4 UUID in both secure and insecure browser
 * contexts. `crypto.randomUUID()` is unavailable on plain HTTP origins other
 * than localhost, while `crypto.getRandomValues()` remains available.
 */
export function createUuid(source: BrowserCrypto = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") {
    return source.randomUUID.call(source);
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
