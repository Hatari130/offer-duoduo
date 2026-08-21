export interface DeepSeekJsonParseResult<T> {
  value?: T;
  error?: Error;
  normalized: string;
  likelyTruncated: boolean;
}

export function stripDeepSeekCodeFence(value: string): string {
  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  return firstBrace > 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence;
}

export function isLikelyTruncatedJson(value: string, error?: unknown): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  const message = error instanceof Error ? error.message : String(error || "");
  return !normalized.endsWith("}") || /unterminated|unexpected end/i.test(message);
}

export function parseDeepSeekJson<T>(content: string): DeepSeekJsonParseResult<T> {
  const normalized = stripDeepSeekCodeFence(content);
  try {
    return { value: JSON.parse(normalized) as T, normalized, likelyTruncated: false };
  } catch (error) {
    const parsedError = error instanceof Error ? error : new Error(String(error));
    return {
      error: parsedError,
      normalized,
      likelyTruncated: isLikelyTruncatedJson(normalized, parsedError)
    };
  }
}
