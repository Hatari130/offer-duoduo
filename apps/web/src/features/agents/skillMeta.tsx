import type { ChatAgentExpert, ChatSkillCategory } from "@offerflow/domain";

export const CATEGORY_LABELS: Record<ChatSkillCategory, string> = {
  resume: "简历",
  interview: "面试",
  strategy: "求职策略",
  perspective: "视角",
  custom: "我的"
};

/** The last character of the name (“HR 小周” → 周), tinted by category. */
export function ExpertAvatar({ expert, size = "small" }: { expert: Pick<ChatAgentExpert, "name" | "category">; size?: "small" | "large" }) {
  return (
    <span className={`expert-avatar expert-avatar--${expert.category} expert-avatar--${size}`} aria-hidden="true">
      {expert.name.trim().slice(-1)}
    </span>
  );
}
