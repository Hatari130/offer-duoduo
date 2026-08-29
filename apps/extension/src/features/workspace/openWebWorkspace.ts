const DEFAULT_WEB_ORIGIN = "https://jobkoi.cn";

export function getWebWorkspaceUrl(path = "/app/applications"): string {
  const configuredOrigin = import.meta.env.VITE_OFFERFLOW_WEB_URL?.trim();
  const origin = (configuredOrigin || DEFAULT_WEB_ORIGIN).replace(/\/$/, "");
  return new URL(path, `${origin}/`).toString();
}

export function openWebWorkspace(path = "/app/applications"): void {
  const url = getWebWorkspaceUrl(path);
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
