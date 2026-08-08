import { useEffect, useState } from "react";

const NAVIGATION_EVENT = "offerflow:navigate";

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const next = path.startsWith("/") ? path : `/${path}`;
  if (options.replace) window.history.replaceState({}, "", next);
  else window.history.pushState({}, "", next);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(NAVIGATION_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAVIGATION_EVENT, update);
    };
  }, []);

  return pathname;
}

export function conversationIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/app\/chat\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}
