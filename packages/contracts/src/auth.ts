import { isRecord } from "./common.ts";

export const avatarKeys = [
  "sprout",
  "sunny",
  "peach",
  "cloud",
  "berry",
  "acorn",
  "mint",
  "coral"
] as const;

export type AvatarKey = (typeof avatarKeys)[number];

export function isAvatarKey(value: unknown): value is AvatarKey {
  return typeof value === "string" && avatarKeys.includes(value as AvatarKey);
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarKey: AvatarKey;
  createdAt: string;
}

export interface AuthSession {
  user: SessionUser;
  accessToken: string;
  expiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  displayName: string;
  avatarKey?: AvatarKey;
  acceptPrivacy: boolean;
  emailVerificationToken?: string;
}

export interface ResetPasswordRequest {
  email: string;
  password: string;
  code: string;
}

export interface UpdateAccountAvatarRequest {
  avatarKey: AvatarKey;
}

export interface AuthCapabilities {
  registrationMode: "open" | "allowlist" | "closed";
  demoEnabled: boolean;
  emailVerificationEnabled: boolean;
}

export const emailVerificationPurposes = ["register", "login", "reset_password"] as const;
export type EmailVerificationPurpose = (typeof emailVerificationPurposes)[number];

export interface SendEmailVerificationCodeRequest {
  email: string;
  purpose: EmailVerificationPurpose;
}

export interface VerifyEmailVerificationCodeRequest extends SendEmailVerificationCodeRequest {
  code: string;
}

export interface EmailVerificationTicketResponse {
  verificationToken: string;
  expiresAt: string;
}

export interface AuthDeviceSession {
  id: string;
  scope: "user" | "device";
  deviceId?: string;
  deviceName?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface SessionResponse {
  user: SessionUser;
}

export interface DeviceCodeResponse {
  code: string;
  expiresAt: string;
}

export interface ExchangeDeviceCodeRequest {
  code: string;
  deviceId: string;
  deviceName?: string;
}

export interface ExchangeDeviceCodeResponse extends AuthSession {
  deviceId: string;
}

export function isLoginRequest(value: unknown): value is LoginRequest {
  return (
    isRecord(value) &&
    typeof value.email === "string" &&
    typeof value.password === "string"
  );
}

export function isRegisterRequest(value: unknown): value is RegisterRequest {
  return (
    isRecord(value) &&
    isLoginRequest(value) &&
    typeof (value as Record<string, unknown>).displayName === "string" &&
    (
      (value as Record<string, unknown>).avatarKey === undefined
      || isAvatarKey((value as Record<string, unknown>).avatarKey)
    ) &&
    (value as Record<string, unknown>).acceptPrivacy === true &&
    (
      (value as Record<string, unknown>).emailVerificationToken === undefined
      || typeof (value as Record<string, unknown>).emailVerificationToken === "string"
    )
  );
}

export function isResetPasswordRequest(value: unknown): value is ResetPasswordRequest {
  return (
    isRecord(value)
    && typeof value.email === "string"
    && typeof value.password === "string"
    && typeof value.code === "string"
  );
}

export function isUpdateAccountAvatarRequest(value: unknown): value is UpdateAccountAvatarRequest {
  return isRecord(value) && isAvatarKey(value.avatarKey);
}

export function isEmailVerificationPurpose(value: unknown): value is EmailVerificationPurpose {
  return typeof value === "string" && emailVerificationPurposes.includes(value as EmailVerificationPurpose);
}

export function isSendEmailVerificationCodeRequest(value: unknown): value is SendEmailVerificationCodeRequest {
  return isRecord(value) && typeof value.email === "string" && isEmailVerificationPurpose(value.purpose);
}

export function isVerifyEmailVerificationCodeRequest(value: unknown): value is VerifyEmailVerificationCodeRequest {
  return isRecord(value) && isSendEmailVerificationCodeRequest(value) && typeof value.code === "string";
}

export function isExchangeDeviceCodeRequest(
  value: unknown
): value is ExchangeDeviceCodeRequest {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.deviceId === "string" &&
    (value.deviceName === undefined || typeof value.deviceName === "string")
  );
}
