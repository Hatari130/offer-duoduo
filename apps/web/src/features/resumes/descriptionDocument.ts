import type { ResumeContentBlock, ResumeInlineText } from "@offerflow/domain";

export interface DescriptionNode {
  type?: string;
  attrs?: Record<string, any>;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  content?: DescriptionNode[];
}

export function safeResumeLink(value: string): string | undefined {
  const candidate = value.trim();
  if (!/^https?:\/\//i.test(candidate)) return undefined;
  try {
    const url = new URL(candidate);
    return url.hostname && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function blockInlineText(block: ResumeContentBlock): ResumeInlineText[] {
  const prefix = block.label ? `${block.label}：` : "";
  const text = `${prefix}${block.text || ""}`;
  // AI and older clients edit plain text. Never show stale rich text over it.
  if (block.inline?.map(run => run.text).join("") === text) {
    return block.inline.map(run => ({ text: run.text, bold: run.bold, href: run.href ? safeResumeLink(run.href) : undefined }));
  }
  return [...(prefix ? [{ text: prefix, bold: true }] : []), { text: block.text || "" }];
}

function inlineNodes(runs: ResumeInlineText[]): DescriptionNode[] {
  return runs.flatMap(run => {
    const marks = [...(run.bold ? [{ type: "bold" }] : []), ...(run.href && safeResumeLink(run.href) ? [{ type: "link", attrs: { href: safeResumeLink(run.href) } }] : [])];
    return run.text.split("\n").flatMap((text, index) => [
      ...(index ? [{ type: "hardBreak" }] : []),
      ...(text ? [{ type: "text", text, marks }] : [])
    ]);
  });
}

export function blocksToDescription(blocks: ResumeContentBlock[]): DescriptionNode {
  const convert = (items: ResumeContentBlock[]): DescriptionNode[] => {
    const nodes: DescriptionNode[] = [];
    for (let index = 0; index < items.length;) {
      const block = items[index]!;
      if (block.kind === "project") {
        nodes.push({ type: "blockquote", attrs: { resumeId: block.id, resumeProject: true }, content: [
          { type: "heading", attrs: { level: 3, resumeId: `${block.id}-heading` }, content: inlineNodes([{ text: block.title || "" }]) },
          ...convert(block.children || [])
        ] });
        index++;
      } else if (block.kind === "bullet") {
        const ordered = Boolean(block.listOrder);
        const content: DescriptionNode[] = [];
        let expectedOrder = block.listOrder;
        while (items[index]?.kind === "bullet" && Boolean(items[index]?.listOrder) === ordered && (!ordered || items[index]?.listOrder === expectedOrder)) {
          const item = items[index++]!;
          content.push({ type: "listItem", content: [{ type: "paragraph", attrs: { resumeId: item.id }, content: inlineNodes(blockInlineText(item)) }] });
          if (expectedOrder) expectedOrder++;
        }
        nodes.push({ type: ordered ? "orderedList" : "bulletList", ...(ordered ? { attrs: { start: block.listOrder } } : {}), content });
      } else {
        nodes.push({ type: "paragraph", attrs: { resumeId: block.id }, content: inlineNodes(blockInlineText(block)) });
        index++;
      }
    }
    return nodes;
  };
  return { type: "doc", content: blocks.length ? convert(blocks) : [{ type: "paragraph" }] };
}

function readInline(node: DescriptionNode): ResumeInlineText[] {
  if (node.type === "hardBreak") return [{ text: "\n" }];
  if (node.type === "text") {
    const href = node.marks?.find(mark => mark.type === "link")?.attrs?.href;
    return [{ text: node.text || "", ...(node.marks?.some(mark => mark.type === "bold") ? { bold: true } : {}), ...(typeof href === "string" && safeResumeLink(href) ? { href: safeResumeLink(href) } : {}) }];
  }
  return (node.content || []).flatMap(readInline);
}

export function descriptionToBlocks(doc: DescriptionNode, previous: ResumeContentBlock[], createId: () => string): ResumeContentBlock[] {
  const known = new Map<string, ResumeContentBlock>();
  const remember = (blocks: ResumeContentBlock[]) => blocks.forEach(block => { known.set(block.id, block); remember(block.children || []); });
  remember(previous);
  const used = new Set<string>();
  const nodeId = (node: DescriptionNode) => {
    const existing = node.attrs?.resumeId;
    const id = typeof existing === "string" && existing && !used.has(existing) ? existing : createId();
    used.add(id);
    return id;
  };
  const read = (nodes: DescriptionNode[]): ResumeContentBlock[] => nodes.flatMap(node => {
    if (node.type === "blockquote") {
      if (!node.attrs?.resumeProject) return read(node.content || []);
      const id = nodeId(node);
      const [heading, ...children] = node.content || [];
      const hasHeading = heading?.type === "heading";
      return [{ ...known.get(id), id, kind: "project" as const, title: hasHeading ? readInline(heading).map(run => run.text).join("") : "", children: read(hasHeading ? children : node.content || []) }];
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      let order = Number(node.attrs?.start) || 1;
      return (node.content || []).flatMap(item => {
        const paragraphs = (item.content || []).filter(child => child.type !== "bulletList" && child.type !== "orderedList");
        const first = paragraphs[0];
        const combined: DescriptionNode[] = paragraphs.flatMap((p, index) => [...(index ? [{ type: "hardBreak" }] : []), ...(p.content || [])]);
        const block = first ? read([{ ...first, type: "paragraph", content: combined }])[0] : undefined;
        if (block) { block.kind = "bullet"; block.listOrder = node.type === "orderedList" ? order++ : undefined; }
        const nested = read((item.content || []).filter(child => child.type === "bulletList" || child.type === "orderedList"));
        return [...(block ? [block] : []), ...nested];
      });
    }
    if (node.type !== "paragraph" && node.type !== "heading") return read(node.content || []);
    const id = nodeId(node);
    const old = known.get(id);
    const inline = readInline(node);
    const fullText = inline.map(run => run.text).join("");
    const prefix = old?.label ? `${old.label}：` : "";
    const leadingBold = inline.filter((_, index) => inline.slice(0, index).reduce((sum, run) => sum + run.text.length, 0) < prefix.length).every(run => run.bold);
    const label = prefix && fullText.startsWith(prefix) && leadingBold ? old?.label : undefined;
    return [{ id, kind: "paragraph" as const, ...(old?.evidence ? { evidence: old.evidence } : {}), ...(label ? { label } : {}), text: label ? fullText.slice(prefix.length) : fullText, ...(inline.some(run => run.bold || run.href) ? { inline } : {}) }];
  });
  const blocks = read(doc.content || []);
  return blocks.length === 1 && blocks[0]?.kind === "paragraph" && !blocks[0].text ? [] : blocks;
}

export function monthInputValue(value: string): string {
  const match = value.trim().match(/^(\d{4})[.\-/](\d{1,2})$/);
  return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${match[1]}-${match[2]!.padStart(2, "0")}` : "";
}

export function experienceDateError(startDate: string, endDate: string, isCurrent?: boolean): string {
  const start = monthInputValue(startDate);
  const end = monthInputValue(endDate);
  return !isCurrent && start && end && end < start ? "结束日期不能早于开始日期" : "";
}
