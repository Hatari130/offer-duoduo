import { lazy, Suspense } from "react";

// react-markdown + remark-gfm are ~40% of the chat bundle; the empty chat home never renders them.
const loadRenderer = () => import("./MarkdownRenderer");
const MarkdownRenderer = lazy(loadRenderer);

export function preloadMarkdown(): void {
  void loadRenderer();
}

export function Markdown({ children, externalLinks = false }: { children: string; externalLinks?: boolean }) {
  return (
    <Suspense fallback={<p className="markdown-fallback">{children}</p>}>
      <MarkdownRenderer externalLinks={externalLinks}>{children}</MarkdownRenderer>
    </Suspense>
  );
}
