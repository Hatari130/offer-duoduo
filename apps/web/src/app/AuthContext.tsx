import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import type { LoginRequest, RegisterRequest, SessionUser } from "@offerflow/contracts";
import { ACCESS_TOKEN_KEY, api } from "./api";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user?: SessionUser;
  login: (request: LoginRequest) => Promise<void>;
  register: (request: RegisterRequest) => Promise<void>;
  enterDemo: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const handoffExchanges = new Map<string, ReturnType<typeof api.auth.exchangeHandoff>>();

function exchangeHandoffOnce(code: string) {
  const existing = handoffExchanges.get(code);
  if (existing) return existing;
  const request = api.auth.exchangeHandoff({ code });
  handoffExchanges.set(code, request);
  return request;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser>();

  const establishSession = useCallback(
    (session: { accessToken: string; user: SessionUser }) => {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
      setUser(session.user);
      setStatus("authenticated");
    },
    []
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    setUser(undefined);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const handoffCode = url.searchParams.get("handoff");
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

    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setStatus("anonymous");
      return;
    }
    let active = true;
    api.auth
      .session()
      .then((session) => {
        if (!active) return;
        setUser(session.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (active) logout();
      });
    return () => {
      active = false;
    };
  }, [establishSession, logout]);

  useEffect(() => {
    window.addEventListener("offerflow:unauthorized", logout);
    return () => window.removeEventListener("offerflow:unauthorized", logout);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: async (request) => establishSession(await api.auth.login(request)),
      register: async (request) => establishSession(await api.auth.register(request)),
      enterDemo: async () => establishSession(await api.auth.demo()),
      logout
    }),
    [establishSession, logout, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
