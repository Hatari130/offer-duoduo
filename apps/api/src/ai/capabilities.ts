export interface AssistantCapability {
  id: string;
  name: string;
  description: string;
}

export const ASSISTANT_CAPABILITIES: readonly AssistantCapability[] = [
  {
    id: "opportunity_search",
    name: "JobKoI 岗位库检索",
    description: "后端已接入真实校招岗位数据，可按岗位、公司、城市、届别、批次和更新时间筛选，并返回最多 5 张带真实投递链接的岗位卡片。"
  },
  {
    id: "personal_application_context",
    name: "个人投递管理上下文",
    description: "后端可按当前登录用户读取其 JobKoI 投递管理记录，在用户询问本人投递、进度、待办、复盘或具体已投公司时，提供投递概览与相关记录。"
  }
];

export function assistantCapabilityContext(): string {
  const catalogue = ASSISTANT_CAPABILITIES
    .map((capability) => `- ${capability.name}：${capability.description}`)
    .join("\n");
  return [
    "平台能力事实（由 JobKoI 后端提供，不是模型推测）：",
    catalogue,
    "岗位卡片和投递链接由后端检索层生成，你不能自行编造。即使本轮没有收到岗位结果，也不得声称 JobKoI 没有岗位库、没有 JSON 数据或没有接入招聘数据；应准确表述为“本轮尚未触发岗位检索”或“当前条件下没有检索到结果”。",
    "当本轮资料包含“个人投递管理”或“投递记录”时，它们就是当前登录用户的真实记录。必须优先依据这些记录回答，不得声称无法访问用户的投递管理；未出现在资料里的回复率、通过率和流程结果不得猜测。"
  ].join("\n");
}

export function opportunityCapabilityAnswer(prompt: string): string | undefined {
  const mentionsOpportunityData = /岗位库|招聘库|岗位数据|招聘数据|json\s*数据|数据库/i.test(prompt);
  const asksAboutCapability = /有没有|有吗|有没|不是有|是否|接入|能不能|可以.*(?:查|搜)|怎么.*(?:查|搜)/.test(prompt);
  if (!mentionsOpportunityData || !asksAboutCapability) return undefined;
  return "有，我能直接查 JobKoI 已接入的真实校招岗位库。告诉我岗位方向、公司、城市、届别、批次或时间范围中的任意一项，我会先筛出最多 5 个还能投、带真实链接的岗位。比如，你可以说：“找上海最近一周更新的产品经理岗位”。";
}
