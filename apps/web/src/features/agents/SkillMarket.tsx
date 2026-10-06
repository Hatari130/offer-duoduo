import { useMemo, useState, type FormEvent } from "react";
import type { ChatAgentProfile } from "@offerflow/contracts";
import { CUSTOM_SKILL_LIMITS } from "@offerflow/contracts";
import type { ChatAgentExpert, ChatAgentName, ChatSkillCategory, CustomSkill, CustomSkillDraft } from "@offerflow/domain";
import { ArrowLeft, Check, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { CATEGORY_LABELS, ExpertAvatar } from "./skillMeta";

const TABS: Array<{ id: "all" | ChatSkillCategory; label: string }> = [
  { id: "all", label: "全部" },
  { id: "resume", label: CATEGORY_LABELS.resume },
  { id: "interview", label: CATEGORY_LABELS.interview },
  { id: "strategy", label: CATEGORY_LABELS.strategy },
  { id: "perspective", label: CATEGORY_LABELS.perspective }
];

const EMPTY_DRAFT: CustomSkillDraft = { name: "", role: "", when: "", summary: "", instructions: "", teams: [] };

export function SkillMarket({
  open,
  onClose,
  agents,
  skills,
  customSkills,
  activeTeam,
  teamSkillIds,
  onToggle,
  onSaveCustom,
  onDeleteCustom
}: {
  open: boolean;
  onClose: () => void;
  agents: ChatAgentProfile[];
  skills: ChatAgentExpert[];
  /** The user's own skills with their full method, for editing. */
  customSkills: CustomSkill[];
  activeTeam?: ChatAgentProfile;
  teamSkillIds: string[];
  onToggle: (skillId: string) => void;
  onSaveCustom: (draft: CustomSkillDraft, id?: string) => Promise<void>;
  onDeleteCustom: (id: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"all" | ChatSkillCategory>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id?: string; draft: CustomSkillDraft }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const official = useMemo(() => skills.filter((skill) => skill.source === "official"), [skills]);
  const mine = useMemo(() => skills.filter((skill) => skill.source === "custom"), [skills]);
  const visible = official.filter((skill) =>
    (tab === "all" || skill.category === tab) &&
    `${skill.name}${skill.role}${skill.summary}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  const close = () => {
    setEditing(undefined);
    setError("");
    onClose();
  };

  const card = (skill: ChatAgentExpert) => {
    const joined = teamSkillIds.includes(skill.id);
    const fits = activeTeam ? skill.teams.includes(activeTeam.id) : false;
    const teamNames = skill.teams.map((team) => agents.find((agent) => agent.id === team)?.name.replace("团队", "")).filter(Boolean).join(" · ");
    const custom = skill.source === "custom" ? customSkills.find((item) => `custom:${item.id}` === skill.id) : undefined;
    return (
      <article key={skill.id} className={`skill-card${joined ? " is-joined" : ""}`}>
        <ExpertAvatar expert={skill} size="large" />
        <div className="skill-card__text">
          <strong>{skill.name}</strong>
          <p>{skill.summary}</p>
          <small>{skill.source === "official" ? "JobKoI 官方" : "我创建的"} · 适用：{teamNames}</small>
        </div>
        <div className="skill-card__actions">
          {custom && (
            <button type="button" className="skill-card__icon" aria-label={`编辑 ${skill.name}`} onClick={() => setEditing({ id: custom.id, draft: { ...custom } })}>
              <Pencil aria-hidden="true" size={14} />
            </button>
          )}
          <button
            type="button"
            className="skill-card__join"
            disabled={!activeTeam || !fits}
            aria-pressed={joined}
            title={!activeTeam ? "先在首页邀请一支团队" : fits ? undefined : `不适用于${activeTeam.name}`}
            onClick={() => onToggle(skill.id)}
          >
            {joined ? <><Check aria-hidden="true" size={13} />已加入</> : fits ? <><Plus aria-hidden="true" size={13} />加入团队</> : "不适用"}
          </button>
        </div>
      </article>
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await onSaveCustom(editing.draft, editing.id);
      setEditing(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "暂时无法保存，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing?.id || !window.confirm(`删除「${editing.draft.name}」？已加入团队的会一起移出。`)) return;
    setBusy(true);
    try {
      await onDeleteCustom(editing.id);
      setEditing(undefined);
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof Omit<CustomSkillDraft, "teams">, label: string, hint: string, multiline = false) => (
    <label className="skill-form__field">
      <span>{label}<small>{hint}</small></span>
      {multiline ? (
        <textarea
          value={editing?.draft[key] ?? ""}
          maxLength={CUSTOM_SKILL_LIMITS[key]}
          rows={8}
          required
          onChange={(event) => setEditing((current) => current && { ...current, draft: { ...current.draft, [key]: event.target.value } })}
        />
      ) : (
        <input
          value={editing?.draft[key] ?? ""}
          maxLength={CUSTOM_SKILL_LIMITS[key]}
          required
          onChange={(event) => setEditing((current) => current && { ...current, draft: { ...current.draft, [key]: event.target.value } })}
        />
      )}
    </label>
  );

  return (
    <Modal open={open} onClose={close} labelledBy="skill-market-title" className="skill-market">
      {editing ? (
        <form className="skill-form" onSubmit={(event) => void submit(event)}>
          <button type="button" className="skill-form__back" onClick={() => setEditing(undefined)}>
            <ArrowLeft aria-hidden="true" size={15} />返回技能市场
          </button>
          <h2 id="skill-market-title">{editing.id ? "编辑我的技能" : "创建我的技能"}</h2>
          <p className="skill-form__intro">写下这位专家是谁、什么时候请 TA、怎么工作。只有你自己能用；无论怎么写，TA 都不能编造你的经历。</p>
          <div className="skill-form__row">
            {field("name", "名字", "比如“我的导师”")}
            {field("role", "角色", "一句话说明 TA 是谁")}
          </div>
          {field("summary", "简介", "显示在技能卡片上")}
          {field("when", "什么时候请 TA", "主教练靠这句话判断何时请 TA")}
          {field("instructions", "工作方法", "TA 看材料时按什么步骤、输出什么", true)}
          <fieldset className="skill-form__teams">
            <legend>可以加入的团队</legend>
            {agents.map((agent) => (
              <label key={agent.id}>
                <input
                  type="checkbox"
                  checked={editing.draft.teams.includes(agent.id)}
                  onChange={(event) => setEditing((current) => current && {
                    ...current,
                    draft: {
                      ...current.draft,
                      teams: event.target.checked
                        ? [...current.draft.teams, agent.id]
                        : current.draft.teams.filter((team: ChatAgentName) => team !== agent.id)
                    }
                  })}
                />
                {agent.name}
              </label>
            ))}
          </fieldset>
          {error && <p className="skill-form__error" role="alert">{error}</p>}
          <footer>
            {editing.id && (
              <button type="button" className="skill-form__delete" onClick={() => void remove()} disabled={busy}>
                <Trash2 aria-hidden="true" size={14} />删除
              </button>
            )}
            <button type="submit" className="team-dialog__primary" disabled={busy || !editing.draft.teams.length}>
              {busy ? "正在保存…" : "保存技能"}
            </button>
          </footer>
        </form>
      ) : (
        <div className="skill-market__body">
          <h2 id="skill-market-title">技能市场</h2>
          <p className="skill-market__context">
            {activeTeam ? <>正在为 <strong>{activeTeam.name}</strong> 挑选专家，最多 8 位。</> : "先在首页邀请一支团队，再把专家加入团队。"}
          </p>

          <section aria-labelledby="my-skills-title">
            <h3 id="my-skills-title">我的技能</h3>
            <div className="skill-grid">
              <button type="button" className="skill-card skill-card--create" onClick={() => setEditing({ draft: { ...EMPTY_DRAFT, teams: activeTeam ? [activeTeam.id] : [] } })}>
                <span className="skill-card__plus" aria-hidden="true"><Plus size={18} /></span>
                <span className="skill-card__text">
                  <strong>创建我的技能</strong>
                  <p>比如“我的导师”“目标公司的学长”</p>
                </span>
              </button>
              {mine.map(card)}
            </div>
          </section>

          <section aria-labelledby="official-skills-title">
            <div className="skill-market__toolbar">
              <h3 id="official-skills-title">官方技能</h3>
              <label className="skill-market__search">
                <Search aria-hidden="true" size={14} />
                <span className="sr-only">搜索技能</span>
                <input type="search" placeholder="搜索技能" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
            </div>
            <div className="skill-tabs" role="tablist" aria-label="技能类别">
              {TABS.map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="skill-grid">
              {visible.map(card)}
              {!visible.length && <p className="skill-market__empty">没有找到匹配的技能。</p>}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
