export interface ApiConfig {
  host: string;
  port: number;
  allowedOrigins: string[];
  tokenSecret: string;
  tokenTtlSeconds: number;
  allowDemoAuth: boolean;
  aiApiKey?: string;
  aiBaseUrl: string;
  aiModel: string;
  demoStreamDelayMs: number;
  interviewAsrProvider: "bcut" | "disabled";
  ffmpegPath: string;
  ffprobePath: string;
  databaseUrl?: string;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    host: env.API_HOST || "127.0.0.1",
    port: positiveNumber(env.API_PORT, 8787),
    allowedOrigins: (
      env.CORS_ORIGINS ||
      "http://127.0.0.1:5173,http://localhost:5173,chrome-extension://*"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    tokenSecret: env.AUTH_TOKEN_SECRET || "offerflow-local-development-secret-change-me",
    tokenTtlSeconds: positiveNumber(env.AUTH_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 7),
    allowDemoAuth: env.ALLOW_DEMO_AUTH !== "false",
    aiApiKey: env.AI_API_KEY || env.DEEPSEEK_API_KEY || undefined,
    aiBaseUrl: (env.AI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
    aiModel: env.AI_MODEL || "deepseek-chat",
    demoStreamDelayMs: positiveNumber(env.DEMO_STREAM_DELAY_MS, 18),
    interviewAsrProvider:
      env.INTERVIEW_ASR_PROVIDER?.trim().toLowerCase() === "disabled" ? "disabled" : "bcut",
    ffmpegPath: env.FFMPEG_PATH || "ffmpeg",
    ffprobePath: env.FFPROBE_PATH || "ffprobe",
    databaseUrl: env.DATABASE_URL || undefined
  };
}
