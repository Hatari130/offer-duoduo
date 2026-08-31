import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { ApiConfig } from "../config.ts";
import { StoreError, type EmailVerificationPurpose, type OfferFlowStore } from "../store/store.ts";
import type { EmailMailer } from "./direct-mail.ts";

interface VerificationTicketPayload {
  version: 1;
  email: string;
  purpose: EmailVerificationPurpose;
  expiresAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface EmailVerificationService {
  configured: boolean;
  sendCode(email: string, purpose: EmailVerificationPurpose, requesterIp?: string): Promise<void>;
  verifyCode(email: string, purpose: EmailVerificationPurpose, code: string): Promise<{ verificationToken: string; expiresAt: string } | undefined>;
  verifyTicket(token: string, email: string, purpose: EmailVerificationPurpose): boolean;
}

export function createEmailVerificationService(
  config: ApiConfig,
  store: OfferFlowStore,
  mailer: EmailMailer
): EmailVerificationService {
  const configured = Boolean(config.emailCodeHmacSecret && mailer.configured);

  function secret(): string {
    if (!config.emailCodeHmacSecret) throw new StoreError("EMAIL_NOT_CONFIGURED", "邮箱验证服务尚未配置", 503);
    return config.emailCodeHmacSecret;
  }

  function codeHmac(email: string, purpose: EmailVerificationPurpose, code: string): string {
    return createHmac("sha256", secret())
      .update(`${purpose}\0${normalizeEmail(email)}\0${code}`)
      .digest("hex");
  }

  function ticketSignature(body: string): Buffer {
    return createHmac("sha256", secret()).update(`email-verification-ticket\0${body}`).digest();
  }

  function issueTicket(email: string, purpose: EmailVerificationPurpose): { verificationToken: string; expiresAt: string } {
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const payload: VerificationTicketPayload = {
      version: 1,
      email: normalizeEmail(email),
      purpose,
      expiresAt
    };
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = ticketSignature(body).toString("base64url");
    return { verificationToken: `${body}.${signature}`, expiresAt };
  }

  return {
    configured,
    async sendCode(rawEmail, purpose, requesterIp) {
      if (!configured) throw new StoreError("EMAIL_NOT_CONFIGURED", "邮箱验证服务尚未配置", 503);
      const email = normalizeEmail(rawEmail);
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const createdAt = new Date().toISOString();
      const reservation = await store.reserveEmailVerificationCode({
        email,
        purpose,
        codeHmac: codeHmac(email, purpose, code),
        requesterIp,
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + 5 * 60_000).toISOString()
      });
      try {
        await mailer.sendVerificationEmail(email, code);
        await store.markEmailVerificationCodeSent(reservation.id, new Date().toISOString());
      } catch (error) {
        await store.deleteEmailVerificationCode(reservation.id);
        throw error;
      }
    },
    async verifyCode(rawEmail, purpose, code) {
      if (!configured) throw new StoreError("EMAIL_NOT_CONFIGURED", "邮箱验证服务尚未配置", 503);
      if (!/^\d{6}$/.test(code)) return undefined;
      const email = normalizeEmail(rawEmail);
      const valid = await store.consumeEmailVerificationCode(
        email,
        purpose,
        codeHmac(email, purpose, code),
        new Date().toISOString()
      );
      return valid ? issueTicket(email, purpose) : undefined;
    },
    verifyTicket(token, rawEmail, purpose) {
      if (!configured) return false;
      const [body, encodedSignature, extra] = token.split(".");
      if (!body || !encodedSignature || extra) return false;
      try {
        const expected = ticketSignature(body);
        const received = Buffer.from(encodedSignature, "base64url");
        if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as VerificationTicketPayload;
        return payload.version === 1
          && payload.email === normalizeEmail(rawEmail)
          && payload.purpose === purpose
          && Date.parse(payload.expiresAt) > Date.now();
      } catch {
        return false;
      }
    }
  };
}
