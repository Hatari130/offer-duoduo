import type { ChatMessage } from "@offerflow/domain";

export type ChatPendingMode = "opportunities" | "answer";

const OPPORTUNITY_REQUEST = /(?:(?:找|查|搜|推荐|看看|有哪些|有什么|能投|可投|投递).{0,18}(?:岗位|职位|工作|实习))|(?:(?:岗位|职位|工作|实习).{0,18}(?:找|查|搜|推荐|有哪些|有什么|能投|可投|投递|招聘))|(?:能投(?:什么|哪些|的)?)/;
const OPPORTUNITY_FOLLOW_UP = /还有吗|还有没有|换一批|更多|继续(?:找|查|看)|只看|只想|改成|换成|最近|近\s*\d+\s*天|近一周|最近一周|昨天|今天|本周|链接呢/;

export function chatPendingMode(
  prompt: string,
  history: readonly Pick<ChatMessage, "role" | "opportunityResults">[] = []
): ChatPendingMode {
  if (OPPORTUNITY_REQUEST.test(prompt)) return "opportunities";

  const hasRecentOpportunityResults = [...history]
    .reverse()
    .slice(0, 4)
    .some((message) => message.role === "assistant" && Boolean(message.opportunityResults));

  return hasRecentOpportunityResults && OPPORTUNITY_FOLLOW_UP.test(prompt)
    ? "opportunities"
    : "answer";
}
