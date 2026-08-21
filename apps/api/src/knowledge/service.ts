import type { KnowledgeCitation } from "@offerflow/domain";

export interface KnowledgeEntry {
  id: string;
  sourceId: string;
  title: string;
  content: string;
  url?: string;
}

const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "resume-star",
    sourceId: "offerflow-career-guide",
    title: "项目经历的 STAR 写法",
    content:
      "项目经历应先说明场景和目标，再写清自己的动作，最后给出可验证结果。动作要使用分析、设计、推动、验证等具体动词；结果优先使用转化率、效率、规模、时长等指标。没有商业指标时，可以写覆盖用户数、完成周期、准确率或迭代次数。"
  },
  {
    id: "campus-calendar",
    sourceId: "offerflow-career-guide",
    title: "校招准备节奏",
    content:
      "校招准备可分为定位、材料、投递、笔面试和复盘五个阶段。定位阶段确定岗位族和城市；材料阶段准备基础简历与项目证据；投递阶段建立每周节奏并记录截止时间；笔面试阶段按岗位知识图谱训练；复盘阶段在每次流程后更新问题清单和下一步行动。"
  },
  {
    id: "career-plan-answer",
    sourceId: "offerflow-interview-guide",
    title: "职业规划问题的回答结构",
    content:
      "回答职业规划时，先说明对目标岗位的理解，再给出一到三年的能力建设路径，最后解释该岗位和公司为什么能承接这条路径。避免只谈职位晋升，也不要给出与当前岗位无关的远期愿望。"
  },
  {
    id: "application-review",
    sourceId: "offerflow-application-guide",
    title: "投递记录与复盘",
    content:
      "每条投递至少记录岗位、来源、投递阶段、关键时间和下一步行动。状态变化使用时间线追加，而不是覆盖历史。每周复盘投递数量、回复率、流程转化和重复失败问题，并据此调整岗位组合和准备优先级。"
  }
];

function queryTokens(query: string): string[] {
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  const latin = query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  const chinese = [...normalized].filter((character) => /[\u3400-\u9fff]/.test(character));
  const pairs = chinese.slice(0, -1).map((character, index) => `${character}${chinese[index + 1]}`);
  return [...new Set([...latin, ...pairs, ...chinese.filter((character) => "简历面试投递校招项目规划".includes(character))])];
}

export class KnowledgeService {
  search(query: string, limit = 3, additionalEntries: KnowledgeEntry[] = []): KnowledgeCitation[] {
    const tokens = queryTokens(query);
    const entries = [...additionalEntries, ...KNOWLEDGE];
    const ranked = entries.map((entry) => {
      const haystack = `${entry.title}${entry.content}`.toLowerCase();
      const score = tokens.reduce(
        (total, token) => total + (haystack.includes(token) ? Math.max(1, token.length) : 0),
        0
      );
      return { entry, score };
    }).sort((left, right) => right.score - left.score);

    // Returning an arbitrary first entry on a zero-score query creates a false
    // citation. This matters even more for private interview material: it
    // should enter a prompt only when the user's question actually matches it.
    const relevant = ranked.filter((result) => result.score > 0);

    return relevant.slice(0, limit).map(({ entry, score }) => ({
      id: entry.id,
      sourceId: entry.sourceId,
      title: entry.title,
      excerpt: entry.content,
      url: entry.url,
      score
    }));
  }
}
