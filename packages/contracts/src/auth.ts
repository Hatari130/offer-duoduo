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
  avatarKey: AvatarKey;
  acceptPrivacy: boolean;
}

export interface AuthCapabilities {
  registrationMode: "open" | "allowlist" | "closed";
  demoEnabled: boolean;
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
    isAvatarKey((value as Record<string, unknown>).avatarKey) &&
    (value as Record<string, unknown>).acceptPrivacy === true
  );
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
