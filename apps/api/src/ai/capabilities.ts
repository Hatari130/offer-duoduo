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
  }
];

export function assistantCapabilityContext(): string {
  const catalogue = ASSISTANT_CAPABILITIES
    .map((capability) => `- ${capability.name}：${capability.description}`)
    .join("\n");
  return [
    "平台能力事实（由 JobKoI 后端提供，不是模型推测）：",
    catalogue,
    "岗位卡片和投递链接由后端检索层生成，你不能自行编造。即使本轮没有收到岗位结果，也不得声称 JobKoI 没有岗位库、没有 JSON 数据或没有接入招聘数据；应准确表述为“本轮尚未触发岗位检索”或“当前条件下没有检索到结果”。"
  ].join("\n");
}

export function opportunityCapabilityAnswer(prompt: string): string | undefined {
  const mentionsOpportunityData = /岗位库|招聘库|岗位数据|招聘数据|json\s*数据|数据库/i.test(prompt);
  const asksAboutCapability = /有没有|有吗|有没|不是有|是否|接入|能不能|可以.*(?:查|搜)|怎么.*(?:查|搜)/.test(prompt);
  if (!mentionsOpportunityData || !asksAboutCapability) return undefined;
  return "有。JobKoI 后端已经接入真实校招岗位数据，可以按岗位方向、公司、城市、届别、批次和更新时间检索，并返回最多 5 张带真实投递链接的岗位卡片。你可以直接说，例如“找上海昨天更新的产品经理岗位”。";
}
