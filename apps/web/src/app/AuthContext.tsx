import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import type { AuthCapabilities, AvatarKey, LoginRequest, RegisterRequest, ResetPasswordRequest, SessionUser } from "@offerflow/contracts";
import { api } from "./api";

type AuthStatus = "loading" | "authenticated" | "guest" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user?: SessionUser;
  capabilities?: AuthCapabilities;
  loginPrompt?: string;
  companionOnboardingOpen: boolean;
  login: (request: LoginRequest) => Promise<void>;
  register: (request: RegisterRequest) => Promise<void>;
  sendRegistrationEmailCode: (email: string) => Promise<{ retryAfterSeconds: number }>;
  verifyRegistrationEmailCode: (email: string, code: string) => Promise<{ verificationToken: string }>;
  sendPasswordResetEmailCode: (email: string) => Promise<{ retryAfterSeconds: number }>;
  resetPassword: (request: ResetPasswordRequest) => Promise<void>;
  saveCompanion: (avatarKey: AvatarKey) => Promise<void>;
  dismissCompanionOnboarding: () => void;
  enterDemo: () => Promise<void>;
  logout: () => Promise<void>;
  requestLogin: (reason?: string) => void;
  dismissLogin: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const handoffExchanges = new Map<string, ReturnType<typeof api.auth.exchangeHandoff>>();
let guestSessionRequest: ReturnType<typeof api.auth.demo> | undefined;

function exchangeHandoffOnce(code: string) {
  const existing = handoffExchanges.get(code);
  if (existing) return existing;
  const request = api.auth.exchangeHandoff({ code });
  handoffExchanges.set(code, request);
  return request;
}

function createGuestSessionOnce() {
  if (guestSessionRequest) return guestSessionRequest;
  guestSessionRequest = api.auth.demo().finally(() => {
    guestSessionRequest = undefined;
  });
  return guestSessionRequest;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser>();
  const [capabilities, setCapabilities] = useState<AuthCapabilities>();
  const [loginPrompt, setLoginPrompt] = useState<string>();
  const [companionOnboardingOpen, setCompanionOnboardingOpen] = useState(false);

  const establishSession = useCallback(
    (session: { user: SessionUser }, nextStatus: "authenticated" | "guest" = "authenticated") => {
      setUser(session.user);
      setStatus(nextStatus);
      setLoginPrompt(undefined);
    },
    []
  );

  const clearSession = useCallback(() => {
    setUser(undefined);
    setStatus("anonymous");
    setCompanionOnboardingOpen(false);
  }, []);

  const dismissCompanionOnboarding = useCallback(() => {
    setCompanionOnboardingOpen(false);
  }, []);

  const saveCompanion = useCallback(async (avatarKey: AvatarKey) => {
    const result = await api.account.updateAvatar({ avatarKey });
    setUser(result.user);
    setCompanionOnboardingOpen(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const requestLogin = useCallback((reason = "登录后即可继续使用这项功能。") => {
    setLoginPrompt(reason);
  }, []);

  const dismissLogin = useCallback(() => {
    setLoginPrompt(undefined);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const handoffCode = url.searchParams.get("handoff");
    const demoParam = url.searchParams.get("demo");
    if (demoParam) {
      let active = true;
      createGuestSessionOnce()
        .then((session) => {
          if (!active) return;
          url.searchParams.delete("demo");
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
          establishSession(session, "guest");
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }
    if (handoffCode) {
      let active = true;
      exchangeHandoffOnce(handoffCode)
        .then((session) => {
          if (!active) return;
          url.searchParams.delete("handoff");
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
          establishSession(session);
        })
        .catch(() => {
          if (active) setStatus("anonymous");
        });
      return () => {
        active = false;
      };
    }

    let active = true;
    void api.auth.capabilities().then((value) => {
      if (active) setCapabilities(value);
    }).catch(() => undefined);
    api.auth
      .session()
      .then((session) => {
        if (!active) return;
        setUser(session.user);
        setStatus(session.user.email === "demo@offerflow.cn" ? "guest" : "authenticated");
      })
      .catch(() => {
        if (active) clearSession();
      });
    return () => {
      active = false;
    };
  }, [clearSession, establishSession]);

  useEffect(() => {
    window.addEventListener("offerflow:unauthorized", clearSession);
    return () => window.removeEventListener("offerflow:unauthorized", clearSession);
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      capabilities,
      loginPrompt,
      companionOnboardingOpen,
      login: async (request) => establishSession(await api.auth.login(request)),
      register: async (request) => {
        establishSession(await api.auth.register(request));
        setCompanionOnboardingOpen(true);
      },
      sendRegistrationEmailCode: (email) => api.auth.sendEmailCode({ email, purpose: "register" }),
      verifyRegistrationEmailCode: (email, code) => api.auth.verifyEmailCode({ email, purpose: "register", code }),
      sendPasswordResetEmailCode: (email) => api.auth.sendEmailCode({ email, purpose: "reset_password" }),
      resetPassword: async (request) => { await api.auth.resetPassword(request); },
      saveCompanion,
      dismissCompanionOnboarding,
      enterDemo: async () => establishSession(await createGuestSessionOnce(), "guest"),
      logout,
      requestLogin,
      dismissLogin
    }),
    [
      capabilities,
      companionOnboardingOpen,
      dismissCompanionOnboarding,
      dismissLogin,
      establishSession,
      loginPrompt,
      logout,
      requestLogin,
      saveCompanion,
      status,
      user
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
