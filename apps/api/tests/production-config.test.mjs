import assert from "node:assert/strict";
import test from "node:test";
import { loadApiConfig, validateProductionConfig } from "../src/config.ts";

test("production refuses unsafe auth, transport and storage defaults", () => {
  assert.throws(
    () => validateProductionConfig(loadApiConfig({ NODE_ENV: "production" })),
    /DATABASE_URL/
  );

  const safe = loadApiConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://offerflow:secret@127.0.0.1:5432/offerflow",
    CORS_ORIGINS: "https://app.example.com,chrome-extension://abcdefghijklmnop",
    ALLOW_DEMO_AUTH: "false",
    REGISTRATION_MODE: "allowlist",
    ALLOWED_REGISTRATION_EMAILS: "owner@example.com",
    REQUIRE_HTTPS: "true",
    OPPORTUNITY_INGEST_KEY: "a-very-long-random-import-key-2026"
  });
  assert.doesNotThrow(() => validateProductionConfig(safe));
  assert.match(safe.opportunitySeedPath, /apps[\\/]api[\\/]data[\\/]campus-hiring\.json$/);

  const emailVerificationWithoutSecrets = {
    ...safe,
    emailVerificationEnabled: true
  };
  assert.throws(
    () => validateProductionConfig(emailVerificationWithoutSecrets),
    /EMAIL_CODE_HMAC_SECRET/
  );

  assert.doesNotThrow(() => validateProductionConfig({
    ...emailVerificationWithoutSecrets,
    emailCodeHmacSecret: "offerflow-production-email-code-secret-long-enough",
    alibabaCloudAccessKeyId: "test-access-key-id",
    alibabaCloudAccessKeySecret: "test-access-key-secret",
    directMailAccount: "no-reply@example.com"
  }));
});
