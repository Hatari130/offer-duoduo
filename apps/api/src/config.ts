export type RegistrationMode = "open" | "allowlist" | "closed";

export interface ApiConfig {
  host: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  databaseUrl?: string;
  allowedOrigins: string[];
  allowDemoAuth: boolean;
  registrationMode: RegistrationMode;
  allowedRegistrationEmails: string[];
  webSessionTtlSeconds: number;
  deviceSessionTtlSeconds: number;
  cookieName: string;
  requireHttps: boolean;
  opportunityIngestKey?: string;
  aiApiKey?: string;
  aiBaseUrl: string;
  aiModel: string;
  demoStreamDelayMs: number;
  interviewAsrProvider: "bcut" | "disabled";
  ffmpegPath: string;
  ffprobePath: string;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

function readRegistrationMode(value: string | undefined, production: boolean): RegistrationMode {
  if (value === "open" || value === "allowlist" || value === "closed") return value;
  return production ? "closed" : "open";
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const nodeEnv = env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development";
  const production = nodeEnv === "production";
  return {
    host: env.API_HOST || "127.0.0.1",
    port: positiveNumber(env.API_PORT, 8787),
    nodeEnv,
    databaseUrl: env.DATABASE_URL?.trim() || undefined,
    allowedOrigins: (
      env.CORS_ORIGINS ||
      "http://127.0.0.1:5173,http://localhost:5173,chrome-extension://*"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    allowDemoAuth: booleanValue(env.ALLOW_DEMO_AUTH, !production),
    registrationMode: readRegistrationMode(env.REGISTRATION_MODE, production),
    allowedRegistrationEmails: (env.ALLOWED_REGISTRATION_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    webSessionTtlSeconds: positiveNumber(env.WEB_SESSION_TTL_SECONDS, 60 * 60 * 24 * 30),
    deviceSessionTtlSeconds: positiveNumber(env.DEVICE_SESSION_TTL_SECONDS, 60 * 60 * 24 * 90),
    cookieName: env.AUTH_COOKIE_NAME?.trim() || "offerflow_session",
    requireHttps: booleanValue(env.REQUIRE_HTTPS, production),
    opportunityIngestKey: env.OPPORTUNITY_INGEST_KEY?.trim() || undefined,
    aiApiKey: env.AI_API_KEY || env.DEEPSEEK_API_KEY || undefined,
    aiBaseUrl: (env.AI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
    aiModel: env.AI_MODEL || "deepseek-chat",
    demoStreamDelayMs: positiveNumber(env.DEMO_STREAM_DELAY_MS, 18),
    interviewAsrProvider:
      env.INTERVIEW_ASR_PROVIDER?.trim().toLowerCase() === "disabled" ? "disabled" : "bcut",
    ffmpegPath: env.FFMPEG_PATH || "ffmpeg",
    ffprobePath: env.FFPROBE_PATH || "ffprobe"
  };
}

export function validateProductionConfig(config: ApiConfig): void {
  if (config.nodeEnv !== "production") return;
  const errors: string[] = [];
  if (!config.databaseUrl) errors.push("DATABASE_URL 必须指向 PostgreSQL");
  if (config.allowDemoAuth) errors.push("生产环境必须设置 ALLOW_DEMO_AUTH=false");
  if (!config.requireHttps) errors.push("生产环境必须设置 REQUIRE_HTTPS=true");
  if (config.allowedOrigins.some((origin) => origin.startsWith("http://") || origin === "*" || origin === "chrome-extension://*")) {
    errors.push("CORS_ORIGINS 只能包含 HTTPS 网站来源或明确的浏览器扩展来源");
  }
  if (!config.opportunityIngestKey || config.opportunityIngestKey.length < 24) {
    errors.push("OPPORTUNITY_INGEST_KEY 至少需要 24 个字符");
  }
  if (config.registrationMode === "allowlist" && !config.allowedRegistrationEmails.length) {
    errors.push("allowlist 注册模式必须配置 ALLOWED_REGISTRATION_EMAILS");
  }
  if (errors.length) throw new Error(`生产配置不安全：\n- ${errors.join("\n- ")}`);
}
