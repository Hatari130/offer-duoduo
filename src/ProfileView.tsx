import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  Plus,
  ScanLine,
  ShieldCheck,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import type {
  FormFieldMatch,
  PersonalProfile,
  ProfileEducation,
  ProfileExperience,
  ProfileProject
} from "./types";

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const FIELD_NAMES: Record<string, string> = {
  fullName: "姓名",
  gender: "性别",
  phone: "手机号",
  email: "邮箱",
  birthDate: "出生日期",
  currentCity: "现居城市",
  address: "联系地址",
  targetRole: "目标岗位",
  targetCities: "意向城市",
  earliestStartDate: "最早到岗",
  portfolioUrl: "作品集",
  githubUrl: "GitHub",
  school: "毕业院校",
  major: "专业",
  degree: "学历",
  gpa: "GPA",
  selfIntroduction: "自我介绍",
  strengths: "个人优势",
  careerPlan: "职业规划"
};

function profileValues(profile: PersonalProfile): Record<string, string> {
  const education = profile.education[0];
  return {
    fullName: profile.fullName,
    gender: profile.gender,
    phone: profile.phone,
    email: profile.email,
    birthDate: profile.birthDate,
    currentCity: profile.currentCity,
    address: profile.address,
    targetRole: profile.targetRole,
    targetCities: profile.targetCities,
    earliestStartDate: profile.earliestStartDate,
    portfolioUrl: profile.portfolioUrl,
    githubUrl: profile.githubUrl,
    school: education?.school || "",
    major: education?.major || "",
    degree: education?.degree || "",
    gpa: education?.gpa || "",
    selfIntroduction: profile.selfIntroduction,
    strengths: profile.strengths,
    careerPlan: profile.careerPlan
  };
}

async function activeTabMessage(message: unknown) {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    throw new Error("请在已加载扩展的招聘网页中使用");
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("http")) throw new Error("当前页面不支持表单填写");
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

export default function ProfileView({
  profile,
  onSave,
  onBack
}: {
  profile: PersonalProfile;
  onSave: (profile: PersonalProfile) => Promise<void>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [status, setStatus] = useState("");
  const [fields, setFields] = useState<FormFieldMatch[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(profile), [profile]);

  const values = useMemo(() => profileValues(draft), [draft]);
  const essentials = [draft.fullName, draft.phone, draft.email, draft.currentCity, draft.targetRole];
  const completion = Math.round(
    ((essentials.filter(Boolean).length + Math.min(draft.education.length, 1)) / 6) * 100
  );

  const set = <K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    await onSave(draft);
    setStatus("个人资料已保存在本地");
    setBusy(false);
  };

  const scan = async () => {
    setBusy(true);
    setStatus("");
    try {
      await onSave(draft);
      const response = await activeTabMessage({ type: "OFFERFLOW_SCAN_APPLICATION_FORM" });
      if (!response?.ok) throw new Error(response?.error || "表单识别失败");
      const matches = (response.fields || []) as FormFieldMatch[];
      setFields(matches);
      setSelectedFields(new Set(matches.filter((field) => values[field.key]).map((field) => field.id)));
      setStatus(matches.length ? `识别到 ${matches.length} 个可匹配字段` : "当前页面没有识别到可填写字段");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "表单识别失败");
    } finally {
      setBusy(false);
    }
  };

  const fill = async () => {
    setBusy(true);
    try {
      const chosen = fields.filter((field) => selectedFields.has(field.id));
      const response = await activeTabMessage({
        type: "OFFERFLOW_FILL_APPLICATION_FORM",
        fields: chosen,
        values
      });
      if (!response?.ok) throw new Error(response?.error || "填写失败");
      setStatus(`已填写 ${response.filled} 个字段，请检查后再提交`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "填写失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleField = (id: string) => {
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addEducation = () =>
    set("education", [...draft.education, { id: newId("edu"), school: "", major: "", degree: "", startDate: "", endDate: "", gpa: "" }]);
  const updateEducation = (id: string, patch: Partial<ProfileEducation>) =>
    set("education", draft.education.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addExperience = () =>
    set("experiences", [...draft.experiences, { id: newId("exp"), organization: "", title: "", startDate: "", endDate: "", description: "" }]);
  const updateExperience = (id: string, patch: Partial<ProfileExperience>) =>
    set("experiences", draft.experiences.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addProject = () =>
    set("projects", [...draft.projects, { id: newId("project"), name: "", role: "", startDate: "", endDate: "", description: "" }]);
  const updateProject = (id: string, patch: Partial<ProfileProject>) =>
    set("projects", draft.projects.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <section className="profile-view">
      <div className="profile-title-row">
        <button onClick={onBack}><ChevronLeft size={17} />秋招工作区</button>
        <span><ShieldCheck size={14} />仅保存在本地</span>
      </div>

      <div className="profile-heading">
        <span><UserRound size={20} /></span>
        <div><h1>个人资料库</h1><p>维护一次，重复用于不同公司的网申表单。</p></div>
      </div>

      <div className="profile-progress">
        <div><strong>{completion}%</strong><span>基础档案完整度</span></div>
        <i><b style={{ width: `${completion}%` }} /></i>
      </div>

      <div className="profile-autofill-card">
        <span><ScanLine size={20} /></span>
        <div><strong>填写当前网申</strong><small>先识别字段，确认后再写入网页</small></div>
        <button onClick={scan} disabled={busy}>识别表单</button>
      </div>

      {status && <button className="profile-status" onClick={() => setStatus("")}><span>{status}</span><X size={13} /></button>}

      {fields.length > 0 && (
        <div className="profile-match-panel">
          <div className="profile-section-title"><span><strong>填写预览</strong><small>{selectedFields.size} / {fields.length} 个字段</small></span></div>
          <div className="profile-match-list">
            {fields.map((field) => {
              const available = Boolean(values[field.key]);
              return (
                <label className={!available ? "missing" : ""} key={field.id}>
                  <input type="checkbox" checked={selectedFields.has(field.id)} disabled={!available} onChange={() => toggleField(field.id)} />
                  <span className="profile-match-check">{selectedFields.has(field.id) && <Check size={12} />}</span>
                  <span><strong>{FIELD_NAMES[field.key] || field.label}</strong><small>{field.label}</small></span>
                  <em>{available ? values[field.key] : "资料未填写"}</em>
                </label>
              );
            })}
          </div>
          <button className="profile-fill-button" disabled={!selectedFields.size || busy} onClick={fill}><Check size={15} />确认填写 {selectedFields.size} 项</button>
          <p>填写后请在网页中检查；OfferDuoDuo 不会点击提交按钮。</p>
        </div>
      )}

      <ProfileSection title="基本信息" description="常见网申字段">
        <div className="profile-grid">
          <Field label="姓名"><input value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
          <Field label="性别"><select value={draft.gender} onChange={(e) => set("gender", e.target.value)}><option value="">请选择</option><option>男</option><option>女</option><option>不便透露</option></select></Field>
          <Field label="手机号"><input type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="邮箱"><input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="出生日期"><input type="date" value={draft.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
          <Field label="现居城市"><input value={draft.currentCity} onChange={(e) => set("currentCity", e.target.value)} /></Field>
          <Field label="联系地址" wide><input value={draft.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
      </ProfileSection>

      <ProfileSection title="求职偏好" description="用于申请信息">
        <div className="profile-grid">
          <Field label="目标岗位"><input value={draft.targetRole} onChange={(e) => set("targetRole", e.target.value)} /></Field>
          <Field label="意向城市"><input value={draft.targetCities} onChange={(e) => set("targetCities", e.target.value)} placeholder="例如：北京、上海" /></Field>
          <Field label="最早到岗"><input type="date" value={draft.earliestStartDate} onChange={(e) => set("earliestStartDate", e.target.value)} /></Field>
          <Field label="作品集"><input type="url" value={draft.portfolioUrl} onChange={(e) => set("portfolioUrl", e.target.value)} /></Field>
          <Field label="GitHub" wide><input type="url" value={draft.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} /></Field>
        </div>
      </ProfileSection>

      <ProfileSection title="教育经历" description="第一条用于自动匹配" action="添加教育" onAction={addEducation}>
        {draft.education.map((item) => (
          <EntryCard key={item.id} title={item.school || "新教育经历"} onRemove={() => set("education", draft.education.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="学校"><input value={item.school} onChange={(e) => updateEducation(item.id, { school: e.target.value })} /></Field>
              <Field label="专业"><input value={item.major} onChange={(e) => updateEducation(item.id, { major: e.target.value })} /></Field>
              <Field label="学历"><input value={item.degree} onChange={(e) => updateEducation(item.id, { degree: e.target.value })} /></Field>
              <Field label="GPA"><input value={item.gpa} onChange={(e) => updateEducation(item.id, { gpa: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={item.startDate} onChange={(e) => updateEducation(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={item.endDate} onChange={(e) => updateEducation(item.id, { endDate: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {!draft.education.length && <EmptyEntry onClick={addEducation} text="添加你的教育经历" />}
      </ProfileSection>

      <ProfileSection title="实习 / 工作" description="支持保存多段经历" action="添加经历" onAction={addExperience}>
        {draft.experiences.map((item) => (
          <EntryCard key={item.id} title={item.organization || "新经历"} onRemove={() => set("experiences", draft.experiences.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="公司 / 组织"><input value={item.organization} onChange={(e) => updateExperience(item.id, { organization: e.target.value })} /></Field>
              <Field label="岗位"><input value={item.title} onChange={(e) => updateExperience(item.id, { title: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={item.startDate} onChange={(e) => updateExperience(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={item.endDate} onChange={(e) => updateExperience(item.id, { endDate: e.target.value })} /></Field>
              <Field label="经历描述" wide><textarea rows={4} value={item.description} onChange={(e) => updateExperience(item.id, { description: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {!draft.experiences.length && <EmptyEntry onClick={addExperience} text="添加实习或工作经历" />}
      </ProfileSection>

      <ProfileSection title="项目经历" description="产品、研究或比赛项目" action="添加项目" onAction={addProject}>
        {draft.projects.map((item) => (
          <EntryCard key={item.id} title={item.name || "新项目"} onRemove={() => set("projects", draft.projects.filter((entry) => entry.id !== item.id))}>
            <div className="profile-grid">
              <Field label="项目名称"><input value={item.name} onChange={(e) => updateProject(item.id, { name: e.target.value })} /></Field>
              <Field label="担任角色"><input value={item.role} onChange={(e) => updateProject(item.id, { role: e.target.value })} /></Field>
              <Field label="开始时间"><input type="month" value={item.startDate} onChange={(e) => updateProject(item.id, { startDate: e.target.value })} /></Field>
              <Field label="结束时间"><input type="month" value={item.endDate} onChange={(e) => updateProject(item.id, { endDate: e.target.value })} /></Field>
              <Field label="项目描述" wide><textarea rows={4} value={item.description} onChange={(e) => updateProject(item.id, { description: e.target.value })} /></Field>
            </div>
          </EntryCard>
        ))}
        {!draft.projects.length && <EmptyEntry onClick={addProject} text="添加项目经历" />}
      </ProfileSection>

      <ProfileSection title="常用回答" description="可复用并按公司微调">
        <div className="profile-long-fields">
          <Field label="自我介绍"><textarea rows={5} value={draft.selfIntroduction} onChange={(e) => set("selfIntroduction", e.target.value)} /></Field>
          <Field label="个人优势"><textarea rows={4} value={draft.strengths} onChange={(e) => set("strengths", e.target.value)} /></Field>
          <Field label="职业规划"><textarea rows={4} value={draft.careerPlan} onChange={(e) => set("careerPlan", e.target.value)} /></Field>
        </div>
      </ProfileSection>

      <div className="profile-save-bar">
        <span><ShieldCheck size={15} />不会发送给 AI</span>
        <button onClick={save} disabled={busy}><Check size={15} />保存个人资料</button>
      </div>
    </section>
  );
}

function ProfileSection({ title, description, action, onAction, children }: { title: string; description: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return <section className="profile-section"><div className="profile-section-title"><span><strong>{title}</strong><small>{description}</small></span>{action && <button onClick={onAction}><Plus size={13} />{action}</button>}</div>{children}</section>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>;
}

function EntryCard({ title, onRemove, children }: { title: string; onRemove: () => void; children: ReactNode }) {
  return <div className="profile-entry"><div><strong>{title}</strong><button onClick={onRemove} aria-label="删除"><Trash2 size={14} /></button></div>{children}</div>;
}

function EmptyEntry({ onClick, text }: { onClick: () => void; text: string }) {
  return <button className="profile-empty-entry" onClick={onClick}><Plus size={15} />{text}</button>;
}

