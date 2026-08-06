import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CloudUpload,
  Download,
  FileText,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Link2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  UserRound,
  X
} from "lucide-react";

type View = "profile" | "mapping" | "records";
type SectionKey = "basic" | "education" | "experience" | "projects";
type FieldStatus = "verified" | "review";

interface ProfileField {
  id: string;
  label: string;
  value: string;
  status: FieldStatus;
  wide?: boolean;
}

interface ProfileSection {
  key: SectionKey;
  label: string;
  caption: string;
  icon: typeof UserRound;
  fields: ProfileField[];
}

const initialSections: ProfileSection[] = [
  {
    key: "basic",
    label: "基本信息",
    caption: "个人与联系方式",
    icon: UserRound,
    fields: [
      { id: "name", label: "姓名", value: "林知夏", status: "verified" },
      { id: "phone", label: "手机", value: "138 0000 2608", status: "verified" },
      { id: "email", label: "邮箱", value: "linzhixia@outlook.com", status: "verified" },
      { id: "city", label: "现居城市", value: "上海", status: "verified" },
      { id: "role", label: "目标职位", value: "产品经理 / AI 产品", status: "review" },
      { id: "portfolio", label: "作品集", value: "linzhixia.framer.website", status: "verified", wide: true }
    ]
  },
  {
    key: "education",
    label: "教育经历",
    caption: "1 条经历 · 2024 届",
    icon: GraduationCap,
    fields: [
      { id: "school", label: "学校", value: "华东师范大学", status: "verified" },
      { id: "major", label: "专业", value: "数据科学与大数据技术", status: "verified" },
      { id: "degree", label: "学历", value: "本科", status: "verified" },
      { id: "dates", label: "就读时间", value: "2020.09 — 2024.06", status: "verified" },
      { id: "gpa", label: "GPA / 排名", value: "3.72 / 4.0 · 专业前 15%", status: "review", wide: true }
    ]
  },
  {
    key: "experience",
    label: "实习经历",
    caption: "2 条经历 · 识别完整",
    icon: BriefcaseBusiness,
    fields: [
      { id: "company1", label: "公司 / 职位", value: "星河智能 · 产品实习生", status: "verified" },
      { id: "time1", label: "时间", value: "2023.06 — 2023.12", status: "verified" },
      { id: "company2", label: "公司 / 职位", value: "寻光科技 · 数据产品实习生", status: "verified" },
      { id: "time2", label: "时间", value: "2022.07 — 2022.12", status: "verified" },
      { id: "experienceSummary", label: "经历摘要", value: "参与 AI 对话产品从 0 到 1，负责用户研究、需求拆解与上线后的数据复盘。", status: "review", wide: true }
    ]
  },
  {
    key: "projects",
    label: "项目与成果",
    caption: "3 个项目 · 4 项荣誉",
    icon: FolderKanban,
    fields: [
      { id: "project1", label: "项目名称", value: "校园 AI 求职助手", status: "verified" },
      { id: "projectRole", label: "项目角色", value: "产品负责人", status: "verified" },
      { id: "projectResult", label: "项目成果", value: "服务 2,400+ 名用户，简历修改完成率提升 36%。", status: "review", wide: true }
    ]
  }
];

const mappingRows = [
  { name: "基本资料", fields: 12, coverage: 100, tone: "good" },
  { name: "教育经历", fields: 8, coverage: 96, tone: "good" },
  { name: "实习 / 项目", fields: 15, coverage: 93, tone: "good" },
  { name: "家庭与紧急联系人", fields: 7, coverage: 57, tone: "warn" }
];

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "profile", label: "简历资料库", icon: LayoutDashboard },
  { id: "mapping", label: "网申字段映射", icon: Target },
  { id: "records", label: "投递记录", icon: BriefcaseBusiness }
];

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("profile");
  const [sections, setSections] = useState(initialSections);
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(["basic", "education"]));
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("林知夏_产品经理简历.pdf");
  const [toast, setToast] = useState("");

  const totalFields = useMemo(
    () => sections.reduce((count, section) => count + section.fields.length, 0),
    [sections]
  );

  const filteredSections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sections;
    return sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) =>
          `${field.label} ${field.value}`.toLowerCase().includes(normalized)
        )
      }))
      .filter((section) => section.fields.length > 0);
  }, [query, sections]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const toggleSection = (sectionKey: SectionKey) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  };

  const updateField = (sectionKey: SectionKey, fieldId: string, value: string) => {
    setSections((current) =>
      current.map((section) =>
        section.key !== sectionKey
          ? section
          : {
              ...section,
              fields: section.fields.map((field) =>
                field.id === fieldId ? { ...field, value, status: "verified" } : field
              )
            }
      )
    );
  };

  const startParsing = (file?: File) => {
    setParsing(true);
    if (file) setFileName(file.name);
    window.setTimeout(() => {
      setParsing(false);
      setUploadOpen(false);
      notify("简历解析完成，建议先确认 3 个待校对字段");
    }, 1000);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) startParsing(file);
    event.target.value = "";
  };

  return (
    <main className="site-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark"><ArrowRight size={18} strokeWidth={3} /></span>
          <span className="brand-name">OFFER<strong>FLOW</strong></span>
        </div>
        <div className="workspace-label"><span className="workspace-dot" /> 我的求职工作台 <ChevronDown size={14} /></div>
        <nav className="main-nav" aria-label="主导航">
          <p className="nav-kicker">工作区</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${view === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  if (item.id === "records") notify("投递记录模块正在接入中");
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.id === "profile" && <span className="nav-count">92%</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={16} /><span>资料只为你的网申工作台服务</span></div>
          <button className="nav-item" onClick={() => notify("设置模块正在接入中")}><Settings2 size={17} /><span>偏好设置</span></button>
          <div className="user-mini"><span className="avatar">林</span><span><strong>林知夏</strong><small>个人账号</small></span><ChevronRight size={14} /></div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>工作区</span><ChevronRight size={14} /><strong>{view === "profile" ? "简历资料库" : view === "mapping" ? "网申字段映射" : "投递记录"}</strong></div>
          <div className="topbar-actions"><button className="icon-button" aria-label="通知" onClick={() => notify("当前没有新的提醒")}><Bell size={18} /><span className="notification-dot" /></button><button className="help-button" onClick={() => notify("需要帮助？可以从上传简历开始")}>帮助中心</button></div>
        </header>

        {view === "profile" ? (
          <div className="page-content">
            <div className="page-heading">
              <div><span className="eyebrow">RESUME DATA ROOM · 01</span><h1>简历资料库</h1><p>维护一次，重复用于不同公司的网申表单。</p></div>
              <div className="heading-actions"><button className="button secondary" onClick={() => notify("已导出当前结构化资料（演示）")}><Download size={16} />导出资料</button><button className="button primary" onClick={() => setUploadOpen(true)}><Upload size={16} />解析新简历</button></div>
            </div>

            <section className="resume-summary-card">
              <div className="file-preview"><div className="file-icon"><FileText size={24} /></div><div><span className="status-chip"><span />已解析</span><h2>{fileName}</h2><p>PDF · 2.4 MB · 上次更新于今天 10:28</p></div></div>
              <div className="summary-divider" />
              <div className="summary-progress"><div className="progress-copy"><span>资料完整度</span><strong>92%</strong></div><div className="progress-track"><span style={{ width: "92%" }} /></div><small><BadgeCheck size={13} /> {totalFields} 个字段已提取 · 3 个字段待校对</small></div>
              <button className="summary-menu" aria-label="更多操作" onClick={() => notify("更多操作将在接入云端版本后开放")}><span /><span /><span /></button>
            </section>

            <div className="insight-strip"><div className="insight-icon"><Sparkles size={18} /></div><div><strong>简历已经可以用于网申</strong><span>基本资料、教育经历和项目经历的映射覆盖率超过 90%。</span></div><button onClick={() => setView("mapping")}>查看字段映射 <ArrowRight size={15} /></button></div>

            <div className="content-grid">
              <div className="profile-column">
                <div className="section-toolbar"><div><span className="eyebrow">STRUCTURED PROFILE</span><h2>已提取资料 <span>{totalFields}</span></h2></div><div className="toolbar-actions"><label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索字段" /></label><button className={`edit-toggle ${editing ? "on" : ""}`} onClick={() => { setEditing((current) => !current); if (editing) notify("资料已保存到当前设备"); }}><Pencil size={14} />{editing ? "完成编辑" : "编辑资料"}</button></div></div>
                <div className="section-list">
                  {filteredSections.map((section) => <ProfileSectionCard key={section.key} section={section} open={openSections.has(section.key)} editing={editing} onToggle={() => toggleSection(section.key)} onUpdate={updateField} />)}
                  {!filteredSections.length && <div className="empty-search"><Search size={20} /><strong>没有找到匹配字段</strong><span>试试搜索“学校”“邮箱”或“项目”。</span></div>}
                </div>
              </div>
              <aside className="right-column">
                <ReadinessCard onAction={() => setView("mapping")} />
                <MissingCard onFix={() => { setEditing(true); setOpenSections(new Set(["basic", "education", "experience", "projects"])); notify("已展开资料，请补充标记为待校对的字段"); }} />
                <div className="source-card"><div className="card-heading"><div><span className="eyebrow">SOURCE FILE</span><h3>原始简历</h3></div><FileText size={18} /></div><div className="source-file"><span className="pdf-badge">PDF</span><span>{fileName}</span><button onClick={() => notify("预览窗口将在接入文件存储后开放")} aria-label="预览原始简历"><ChevronRight size={15} /></button></div><button className="full-button" onClick={() => setUploadOpen(true)}><RefreshCw size={14} />替换文件并重新解析</button></div>
              </aside>
            </div>
          </div>
        ) : view === "mapping" ? (
          <MappingView onBack={() => setView("profile")} onToast={notify} />
        ) : (
          <RecordsView onBack={() => setView("profile")} onToast={notify} />
        )}
      </section>

      {uploadOpen && <UploadModal parsing={parsing} fileName={fileName} inputRef={fileInputRef} onClose={() => !parsing && setUploadOpen(false)} onPick={() => fileInputRef.current?.click()} onChange={handleFileChange} onDemo={() => startParsing()} />}
      {toast && <button className="toast" onClick={() => setToast("")}><Check size={15} />{toast}<X size={14} /></button>}
    </main>
  );
}

function ProfileSectionCard({ section, open, editing, onToggle, onUpdate }: { section: ProfileSection; open: boolean; editing: boolean; onToggle: () => void; onUpdate: (sectionKey: SectionKey, fieldId: string, value: string) => void }) {
  const Icon = section.icon;
  return <section className={`profile-section ${open ? "open" : ""}`}>
    <button className="section-head" onClick={onToggle} aria-expanded={open}><span className="section-icon"><Icon size={17} /></span><span className="section-title"><strong>{section.label}</strong><small>{section.caption}</small></span><ChevronDown size={17} className="section-chevron" /></button>
    {open && <div className="field-grid">{section.fields.map((field) => <FieldRow key={field.id} sectionKey={section.key} field={field} editing={editing} onUpdate={onUpdate} />)}<button className="add-field" onClick={() => undefined}><Plus size={14} />添加一项</button></div>}
  </section>;
}

function FieldRow({ sectionKey, field, editing, onUpdate }: { sectionKey: SectionKey; field: ProfileField; editing: boolean; onUpdate: (sectionKey: SectionKey, fieldId: string, value: string) => void }) {
  return <label className={`field-row ${field.wide ? "wide" : ""}`}><span>{field.label}{field.status === "review" && <em>待校对</em>}</span>{editing ? (field.wide ? <textarea value={field.value} onChange={(event) => onUpdate(sectionKey, field.id, event.target.value)} rows={2} /> : <input value={field.value} onChange={(event) => onUpdate(sectionKey, field.id, event.target.value)} />) : <strong>{field.value || "—"}</strong>}{!editing && <i className={field.status === "verified" ? "verified" : "review"}>{field.status === "verified" ? <Check size={11} /> : <CircleAlert size={11} />}</i>}</label>;
}

function ReadinessCard({ onAction }: { onAction: () => void }) {
  return <div className="readiness-card"><div className="card-heading"><div><span className="eyebrow">APPLICATION READY</span><h3>网申准备度</h3></div><span className="score-circle">92</span></div><div className="readiness-bars"><div><span>基本资料</span><strong>100%</strong><i><b style={{ width: "100%" }} /></i></div><div><span>教育经历</span><strong>96%</strong><i><b style={{ width: "96%" }} /></i></div><div><span>实习 / 项目</span><strong>93%</strong><i><b style={{ width: "93%" }} /></i></div><div><span>扩展字段</span><strong>57%</strong><i><b className="yellow" style={{ width: "57%" }} /></i></div></div><button className="card-link" onClick={onAction}>查看可填写字段 <ArrowRight size={14} /></button></div>;
}

function MissingCard({ onFix }: { onFix: () => void }) {
  return <div className="missing-card"><div className="card-heading"><div><span className="eyebrow">NEEDS REVIEW</span><h3>建议补充</h3></div><CircleAlert size={18} /></div><p>有 3 项信息在不同公司的网申中经常出现，补充后能减少手动填写。</p><ul><li><span>紧急联系人</span><small>7 家公司会要求</small></li><li><span>政治面貌</span><small>校招表单常见</small></li><li><span>期望城市排序</span><small>用于岗位匹配</small></li></ul><button className="card-link" onClick={onFix}>去补充资料 <ArrowRight size={14} /></button></div>;
}

function MappingView({ onBack, onToast }: { onBack: () => void; onToast: (message: string) => void }) {
  return <div className="page-content simple-page"><div className="page-heading"><div><button className="back-link" onClick={onBack}><ChevronRight size={15} className="back-arrow" />返回简历资料库</button><span className="eyebrow">FIELD MAPPING · 02</span><h1>网申字段映射</h1><p>把你的结构化资料转换成不同招聘系统认识的字段。</p></div><button className="button primary" onClick={() => onToast("字段映射已刷新") }><RefreshCw size={16} />刷新映射库</button></div><div className="mapping-hero"><div className="mapping-orbit"><Target size={28} /></div><div><span className="eyebrow">CURRENT LIBRARY</span><h2>已覆盖 90%+ 常见网申字段</h2><p>当前映射库 v1.4.2，最近更新于 2026.08.04。</p></div><div className="mapping-stat"><strong>42</strong><span>已支持字段</span></div></div><div className="table-card"><div className="table-heading"><div><span className="eyebrow">MAPPING COVERAGE</span><h2>字段覆盖概览</h2></div><span className="connected-label"><span />映射库已连接</span></div><div className="mapping-table"><div className="mapping-row mapping-row-head"><span>字段分组</span><span>字段数</span><span>覆盖度</span><span>状态</span></div>{mappingRows.map((row) => <div className="mapping-row" key={row.name}><strong>{row.name}</strong><span>{row.fields} 项</span><div className="table-progress"><i><b className={row.tone === "warn" ? "yellow" : ""} style={{ width: `${row.coverage}%` }} /></i><strong>{row.coverage}%</strong></div><span className={`mapping-status ${row.tone}`}>{row.tone === "good" ? "可自动填写" : "需要补充"}</span></div>)}</div></div></div>;
}

function RecordsView({ onBack, onToast }: { onBack: () => void; onToast: (message: string) => void }) {
  return <div className="page-content simple-page"><div className="page-heading"><div><button className="back-link" onClick={onBack}><ChevronRight size={15} className="back-arrow" />返回简历资料库</button><span className="eyebrow">APPLICATION TRACKER · 03</span><h1>投递记录</h1><p>集中查看网申进度，把每一次申请留在自己的节奏里。</p></div><button className="button primary" onClick={() => onToast("投递记录入口已准备好") }><Plus size={16} />新增投递</button></div><div className="record-empty"><div className="record-empty-icon"><BriefcaseBusiness size={25} /></div><span className="eyebrow">YOUR APPLICATIONS</span><h2>下一次投递，从完成资料库开始</h2><p>网页端记录和浏览器自动填表会共享同一套个人资料。</p><button className="button secondary" onClick={onBack}><ArrowRight size={15} />回到资料库</button></div></div>;
}

function UploadModal({ parsing, fileName, inputRef, onClose, onPick, onChange, onDemo }: { parsing: boolean; fileName: string; inputRef: React.RefObject<HTMLInputElement>; onClose: () => void; onPick: () => void; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onDemo: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div className="upload-modal"><button className="modal-close" onClick={onClose} disabled={parsing} aria-label="关闭"><X size={18} /></button><div className="modal-icon"><CloudUpload size={23} /></div><span className="eyebrow">IMPORT RESUME</span><h2 id="upload-title">解析一份新简历</h2><p>上传后，OfferFlow 会把简历拆解成可复用的网申字段。支持 PDF、DOC、DOCX，文件仅用于当前解析流程。</p>{parsing ? <div className="parse-state"><div className="parse-spinner"><RefreshCw size={22} /></div><strong>正在提取 {fileName}</strong><span>正在识别教育、经历与项目字段…</span><i><b /></i></div> : <><button className="dropzone" onClick={onPick}><span className="dropzone-icon"><Upload size={20} /></span><strong>点击选择，或将文件拖到这里</strong><small>PDF / DOC / DOCX · 最大 10 MB</small></button><input ref={inputRef} type="file" accept=".pdf,.doc,.docx" onChange={onChange} hidden /><div className="modal-divider"><span>或</span></div><button className="demo-upload" onClick={onDemo}><Sparkles size={15} />使用示例简历体验解析</button></>}<div className="modal-privacy"><ShieldCheck size={14} /><span>隐私提示：原型阶段使用示例结果；接入后端解析服务时可切换为本地处理或加密上传。</span></div></div></div>;
}

export default App;
