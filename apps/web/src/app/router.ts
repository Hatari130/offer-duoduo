import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

const NAVIGATION_EVENT = "offerflow:navigate";
const TRANSITION_ATTRIBUTE = "offerflowTransition";
const FALLBACK_ATTRIBUTE = "offerflowTransitionFallback";

export type UiTransitionScope = "route" | "application-view" | "resume-tab";

interface ViewTransitionHandle {
  finished: Promise<unknown>;
  skipTransition: () => void;
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransitionHandle;
};

let activeTransition: ViewTransitionHandle | undefined;
let fallbackTimer: number | undefined;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function runFallbackTransition(update: () => void, scope: UiTransitionScope): void {
  flushSync(update);
  const root = document.documentElement;
  delete root.dataset[FALLBACK_ATTRIBUTE];
  void root.offsetWidth;
  root.dataset[FALLBACK_ATTRIBUTE] = scope;
  if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
  fallbackTimer = window.setTimeout(() => {
    if (root.dataset[FALLBACK_ATTRIBUTE] === scope) delete root.dataset[FALLBACK_ATTRIBUTE];
    fallbackTimer = undefined;
  }, 240);
}

export function startUiTransition(update: () => void, scope: UiTransitionScope): void {
  if (prefersReducedMotion() || document.visibilityState === "hidden") {
    update();
    return;
  }

  const transitionDocument = document as TransitionDocument;
  if (!transitionDocument.startViewTransition) {
    runFallbackTransition(update, scope);
    return;
  }

  activeTransition?.skipTransition();
  document.documentElement.dataset[TRANSITION_ATTRIBUTE] = scope;

  try {
    const transition = transitionDocument.startViewTransition(() => flushSync(update));
    activeTransition = transition;
    void transition.finished
      .catch(() => undefined)
      .finally(() => {
        if (activeTransition !== transition) return;
        activeTransition = undefined;
        if (document.documentElement.dataset[TRANSITION_ATTRIBUTE] === scope) {
          delete document.documentElement.dataset[TRANSITION_ATTRIBUTE];
        }
      });
  } catch {
    delete document.documentElement.dataset[TRANSITION_ATTRIBUTE];
    runFallbackTransition(update, scope);
  }
}

export function navigate(path: string, options: { replace?: boolean; transition?: boolean } = {}): void {
  const next = path.startsWith("/") ? path : `/${path}`;
  if (next === window.location.pathname && !options.replace) return;

  const commit = () => {
    if (options.replace) window.history.replaceState({}, "", next);
    else window.history.pushState({}, "", next);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  };

  if (options.replace || options.transition === false) commit();
  else startUiTransition(commit, "route");
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    const updateFromHistory = () => startUiTransition(update, "route");
    window.addEventListener("popstate", updateFromHistory);
    window.addEventListener(NAVIGATION_EVENT, update);
    return () => {
      window.removeEventListener("popstate", updateFromHistory);
      window.removeEventListener(NAVIGATION_EVENT, update);
    };
  }, []);

  return pathname;
}

export function conversationIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/app\/chat\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}
