import { useEffect, useId, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UniqueID from "@tiptap/extension-unique-id";
import { Bold, Link2, List, ListOrdered, Redo2, Undo2 } from "lucide-react";
import type { ResumeContentBlock } from "@offerflow/domain";
import { createUuid } from "../../app/id";
import { blocksToDescription, descriptionToBlocks, safeResumeLink } from "./descriptionDocument";

const ProjectMetadata = Extension.create({
  name: "resumeProjectMetadata",
  addGlobalAttributes() {
    return [{ types: ["blockquote"], attributes: { resumeProject: { default: false, parseHTML: element => element.getAttribute("data-resume-project") === "true", renderHTML: attrs => attrs.resumeProject ? { "data-resume-project": "true" } : {} } } }];
  }
});

export default function DescriptionEditor({ blocks = [], onChange }: {
  blocks?: ResumeContentBlock[];
  onChange: (blocks: ResumeContentBlock[]) => void;
}) {
  const id = useId();
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const metadata = useRef(new Map<string, ResumeContentBlock>());
  const remember = (items: ResumeContentBlock[]) => items.forEach(block => { metadata.current.set(block.id, block); remember(block.children || []); });
  remember(blocks);
  const lastEmitted = useRef(JSON.stringify(blocks));
  const ready = useRef(false);
  const contentSignature = useRef("");
  const signature = (value: unknown) => JSON.stringify(value, (key, item) => key === "resumeId" ? undefined : item);
  const linkDialog = useRef<HTMLDialogElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const linkSelection = useRef({ from: 0, to: 0 });
  const [url, setUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [toolbarIndex, setToolbarIndex] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false, codeBlock: false, horizontalRule: false,
        italic: false, strike: false, underline: false, trailingNode: false, heading: { levels: [3] },
        link: { openOnClick: false, autolink: false, linkOnPaste: false,
          isAllowedUri: url => Boolean(safeResumeLink(url)) }
      }),
      UniqueID.configure({ attributeName: "resumeId", types: ["paragraph", "heading", "blockquote"], generateID: () => `content-${createUuid()}` }),
      ProjectMetadata
    ],
    content: blocksToDescription(blocks),
    editorProps: { attributes: { role: "textbox", "aria-label": "描述", "aria-multiline": "true", "aria-describedby": `${id}-hint`, "data-placeholder": "直接描述这段经历，可分段或按需要添加列表。" } },
    onCreate: ({ editor }) => { contentSignature.current = signature(editor.getJSON()); ready.current = true; },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON();
      const nextSignature = signature(doc);
      if (!ready.current || nextSignature === contentSignature.current) return;
      contentSignature.current = nextSignature;
      const next = descriptionToBlocks(doc, [...metadata.current.values()], () => `content-${createUuid()}`);
      const serialized = JSON.stringify(next);
      if (serialized !== lastEmitted.current) {
        lastEmitted.current = serialized;
        changeRef.current(next);
      }
    }
  });
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor?.isActive("bold") || false,
    link: editor?.isActive("link") || false,
    bullet: editor?.isActive("bulletList") || false,
    ordered: editor?.isActive("orderedList") || false,
    canUndo: editor?.can().undo() || false,
    canRedo: editor?.can().redo() || false,
    empty: editor?.isEmpty ?? true
  }) });

  useEffect(() => {
    const serialized = JSON.stringify(blocks);
    if (editor && serialized !== lastEmitted.current) {
      lastEmitted.current = serialized;
      editor.commands.setContent(blocksToDescription(blocks), { emitUpdate: false });
      contentSignature.current = signature(editor.getJSON());
    }
  }, [blocks, editor]);

  const openLink = () => {
    if (!editor) return;
    linkSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setUrl(editor.getAttributes("link").href || "");
    setLinkError("");
    linkDialog.current?.showModal();
  };
  const applyLink = () => {
    const href = safeResumeLink(url);
    if (!editor || !href) { setLinkError("请输入以 https:// 或 http:// 开头的有效网址"); linkDialog.current?.querySelector("input")?.focus(); return; }
    const chain = editor.chain().focus().setTextSelection(linkSelection.current);
    if (linkSelection.current.from === linkSelection.current.to && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else { chain.extendMarkRange("link").setLink({ href }).run(); }
    linkDialog.current?.close();
  };
  const actions = [
    { label: "加粗", Icon: Bold, active: state?.bold, run: () => editor?.chain().focus().toggleBold().run() },
    { label: "添加或编辑链接", Icon: Link2, active: state?.link, run: openLink },
    { label: "无序列表", Icon: List, active: state?.bullet, run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: "有序列表", Icon: ListOrdered, active: state?.ordered, run: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: "撤销", Icon: Undo2, disabled: !state?.canUndo, run: () => editor?.chain().focus().undo().run() },
    { label: "重做", Icon: Redo2, disabled: !state?.canRedo, run: () => editor?.chain().focus().redo().run() }
  ];

  return <div className="resume-description-field">
    <span className="resume-description-label">描述</span>
    <div className={`resume-description-editor ${state?.empty ? "is-empty" : ""}`}>
      <div className="resume-description-toolbar" role="toolbar" aria-label="描述格式" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const current = buttons.indexOf(event.target as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
        {actions.map(({ label, Icon, active, disabled, run }, index) => <button
          key={label} ref={index === 1 ? linkButton : undefined} type="button"
          aria-label={label} title={label} aria-pressed={active} disabled={!editor || disabled}
          tabIndex={toolbarIndex === index || (actions[toolbarIndex]?.disabled && index === 0) ? 0 : -1} onFocus={() => setToolbarIndex(index)}
          onMouseDown={event => event.preventDefault()} onClick={run}
        ><Icon size={19} aria-hidden="true" /></button>)}
      </div>
      <EditorContent editor={editor} />
    </div>
    <p id={`${id}-hint`} className="resume-description-hint">可直接粘贴已有描述，分点与格式按需添加。</p>
    <dialog className="resume-link-dialog" ref={linkDialog} aria-labelledby={`${id}-link-title`} onClose={() => linkButton.current?.focus()}>
      <form onSubmit={event => { event.preventDefault(); applyLink(); }}>
        <h2 id={`${id}-link-title`}>编辑链接</h2>
        <label htmlFor={`${id}-url`}>网址</label>
        <input id={`${id}-url`} type="text" inputMode="url" autoFocus value={url} onChange={event => { setUrl(event.target.value); setLinkError(""); }} placeholder="https://example.com" aria-invalid={Boolean(linkError)} aria-describedby={linkError ? `${id}-error` : undefined} />
        {linkError && <p id={`${id}-error`} className="resume-experience-error">{linkError}</p>}
        <footer>
          {state?.link && <button type="button" onClick={() => { editor?.chain().focus().setTextSelection(linkSelection.current).extendMarkRange("link").unsetLink().run(); linkDialog.current?.close(); }}>移除链接</button>}
          <button type="button" onClick={() => linkDialog.current?.close()}>取消</button>
          <button type="submit" className="primary-button">应用链接</button>
        </footer>
      </form>
    </dialog>
  </div>;
}
