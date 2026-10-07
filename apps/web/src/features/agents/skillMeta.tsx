import type { ChatAgentExpert, ChatSkillCategory } from "@offerflow/domain";
import { ExpertPortrait, hasPortrait } from "./ExpertPortrait";

export const CATEGORY_LABELS: Record<ChatSkillCategory, string> = {
  resume: "简历",
  interview: "面试",
  strategy: "求职策略",
  perspective: "视角",
  custom: "我的"
};

/** Official experts get their drawn portrait; a user's own skill shows the last character of its name (“我的导师” → 师). */
export function ExpertAvatar({ expert, size = "small" }: { expert: Pick<ChatAgentExpert, "id" | "name" | "category">; size?: "small" | "large" }) {
  const portrait = hasPortrait(expert.id);
  return (
    <span
      className={`expert-avatar expert-avatar--${expert.category} expert-avatar--${size}${portrait ? " expert-avatar--portrait" : ""}`}
      aria-hidden="true"
    >
      {portrait ? <ExpertPortrait id={expert.id} /> : expert.name.trim().slice(-1)}
    </span>
  );
}
