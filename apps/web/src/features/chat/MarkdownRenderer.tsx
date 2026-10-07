import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const plugins = [remarkGfm];
const externalLinkComponents = {
  a: ({ node: _node, ...props }: React.ComponentPropsWithoutRef<"a"> & { node?: unknown }) => (
    <a {...props} target="_blank" rel="noreferrer" />
  )
};

export default function MarkdownRenderer({ children, externalLinks }: { children: string; externalLinks: boolean }) {
  return (
    <ReactMarkdown remarkPlugins={plugins} components={externalLinks ? externalLinkComponents : undefined}>
      {children}
    </ReactMarkdown>
  );
}
